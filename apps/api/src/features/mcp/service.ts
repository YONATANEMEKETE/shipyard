import {
  MCP_ALWAYS_GRANTED_SCOPES,
  MCP_DEFAULT_SCOPES,
  type CreateMcpTokenRequest,
  type CreateMcpTokenResponse,
  type DeleteMcpTokenResponse,
  type ListMcpTokensQuery,
  type ListMcpTokensResponse,
  type McpTokenCard,
  type McpTokenScope,
  type RevokeMcpTokenResponse,
} from '@shipyard/shared';
import { prisma } from '../../common/db/client.js';
import { captureEvent } from '../../common/analytics/index.js';
import { logger } from '../../common/logger/index.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import {
  McpScopeNotPermittedError,
  McpTokenExpiryInvalidError,
  McpTokenNotFoundError,
} from './errors.js';
import { mcpTokensRepository, type McpTokenRow } from './repository.js';
import {
  generateToken,
  hashToken,
  looksLikeToken,
  MCP_LAST_USED_THROTTLE_MS,
  scopesExceedingRole,
} from './tokens.js';

/**
 * MCP token service — owns issuance, listing, revocation, and the read-side
 * resolution the `/mcp` transport uses to turn a bearer token into an identity.
 *
 * Rules owned here (data-model D1–D9, api-design §3):
 * - the issuance ceiling: a token can never carry a scope above the caller's
 *   role, and `READ` is the default when none is asked for;
 * - an expiry that has already passed is rejected rather than minted dead;
 * - revocation is a timestamp (idempotent); deletion is the explicit, final
 *   removal of a row the member no longer wants to see;
 * - visibility: a member sees and revokes their own credentials, Owner/Admin
 *   may also see and revoke anyone's in the workspace;
 * - every unusable credential resolves identically (`null`) — revoked,
 *   expired, unknown and malformed are indistinguishable to the caller.
 *
 * Membership liveness is deliberately **not** checked here: that is per-request
 * context resolution and belongs to the `/mcp` auth step (M4), not to token
 * management.
 */

/** Mapping is single-sourced here so every surface renders the same card. */
export function toMcpTokenCard(row: McpTokenRow): McpTokenCard {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    label: row.label,
    tokenPrefix: row.tokenPrefix,
    scopes: row.scopes,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The identity a presented credential resolves to (consumed by M4). */
export interface ResolvedMcpToken {
  tokenId: string;
  userId: string;
  workspaceId: string;
  scopes: McpTokenScope[];
}

function isTokenManager(role: WorkspaceRequestContext['role']): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export const mcpTokensService = {
  /**
   * Issue a credential for the calling member inside this workspace. The
   * plaintext leaves the building here and only here (data-model D2).
   */
  async create(
    context: WorkspaceRequestContext,
    userId: string,
    body: CreateMcpTokenRequest,
  ): Promise<CreateMcpTokenResponse> {
    // `READ` always travels with the credential (spec §3.1): asking for it is
    // optional, keeping it is not. Union rather than validate, because the
    // caller's intent — "this connection may edit issues" — is separate from
    // this rule, and a 400 over a scope the member wanted anyway would be a
    // worse surface. `Set` keeps the order stable for the card and the tests.
    const scopes: McpTokenScope[] = [
      ...new Set<McpTokenScope>([
        ...MCP_ALWAYS_GRANTED_SCOPES,
        ...(body.scopes ?? MCP_DEFAULT_SCOPES),
      ]),
    ];

    const exceeding = scopesExceedingRole(context.role, scopes);
    if (exceeding.length > 0) {
      throw new McpScopeNotPermittedError(
        `These permissions require an Owner or Admin in this workspace: ${exceeding.join(
          ', ',
        )}. Your role is ${context.role}. Create the token without them, or ask an admin.`,
      );
    }

    let expiresAt: Date | null = null;
    if (body.expiresAt != null) {
      const parsed = new Date(body.expiresAt);
      if (parsed.getTime() <= Date.now()) {
        throw new McpTokenExpiryInvalidError();
      }
      expiresAt = parsed;
    }

    const generated = generateToken();

    const row = await mcpTokensRepository.create(prisma, {
      userId,
      workspaceId: context.workspaceId,
      label: body.label,
      tokenHash: generated.tokenHash,
      tokenPrefix: generated.tokenPrefix,
      scopes,
      expiresAt,
    });

    // Never log the token or its hash — the id is the join key for support.
    logger.info(
      {
        tokenId: row.id,
        workspaceId: context.workspaceId,
        userId,
        scopes,
      },
      'mcp.token.created',
    );
    captureEvent(userId, 'mcp_token_created', {
      workspaceId: context.workspaceId,
      scopes,
    });

    return { ...toMcpTokenCard(row), token: generated.token };
  },

  /**
   * List credentials. A member sees their own; Owner/Admin may pass
   * `?all=true` to see every connection in the workspace (api-design §2 #3).
   * A member passing `all=true` simply receives their own list — the flag is a
   * view request, not a permission claim.
   */
  async list(
    context: WorkspaceRequestContext,
    userId: string,
    query: ListMcpTokensQuery,
  ): Promise<ListMcpTokensResponse> {
    const wantsAll = query.all === 'true';
    const rows =
      wantsAll && isTokenManager(context.role)
        ? await mcpTokensRepository.listForWorkspace(
            prisma,
            context.workspaceId,
          )
        : await mcpTokensRepository.listForUser(
            prisma,
            context.workspaceId,
            userId,
          );

    return { tokens: rows.map(toMcpTokenCard) };
  },

  /**
   * Revoke a credential. Idempotent by design — revocation is an emergency
   * action and a retried request must not fail (api-design §2 #4). A token the
   * caller may not see answers `404 TOKEN_NOT_FOUND`, identical to an unknown
   * id, so revocation cannot be used to probe other members' credentials.
   */
  async revoke(
    context: WorkspaceRequestContext,
    userId: string,
    tokenId: string,
  ): Promise<RevokeMcpTokenResponse> {
    const row = await mcpTokensRepository.findByIdScoped(
      prisma,
      tokenId,
      context.workspaceId,
    );

    if (!row || (row.userId !== userId && !isTokenManager(context.role))) {
      throw new McpTokenNotFoundError();
    }

    if (row.revokedAt) {
      return toMcpTokenCard(row);
    }

    const revoked = await mcpTokensRepository.revoke(
      prisma,
      row.id,
      new Date(),
    );

    logger.info(
      {
        tokenId: revoked.id,
        workspaceId: context.workspaceId,
        userId,
        ownerUserId: row.userId,
      },
      'mcp.token.revoked',
    );

    return toMcpTokenCard(revoked);
  },

  /**
   * Delete a credential for good — the row and its hash leave the database, so
   * it disappears from the list and can never resolve again.
   *
   * Visibility is revoke's rule exactly: the token's owner, or an Owner/Admin.
   * Anyone else gets the identical `404 TOKEN_NOT_FOUND`, so deletion cannot be
   * used to probe for other members' credentials either.
   *
   * Deleting a *live* token is allowed on purpose and behaves as
   * revoke-and-forget: the hash row is gone, so `verify` rejects it under the
   * same one-predicate rule as a revoked or expired one (api-design §3.1). The
   * member does not have to revoke first to clean up.
   *
   * Not idempotent, unlike revoke: a second delete finds no row and answers
   * `404`. The surface treats that as done (the row the caller wanted gone is
   * gone) — see `useDeleteAgentToken` in the web app.
   */
  async remove(
    context: WorkspaceRequestContext,
    userId: string,
    tokenId: string,
  ): Promise<DeleteMcpTokenResponse> {
    const row = await mcpTokensRepository.findByIdScoped(
      prisma,
      tokenId,
      context.workspaceId,
    );

    if (!row || (row.userId !== userId && !isTokenManager(context.role))) {
      throw new McpTokenNotFoundError();
    }

    await mcpTokensRepository.remove(prisma, row.id);

    // The row is gone, so this is the only record left that it existed — which
    // is why the log carries what the row said, and never the token or hash.
    logger.info(
      {
        tokenId: row.id,
        workspaceId: context.workspaceId,
        userId,
        ownerUserId: row.userId,
        wasRevoked: row.revokedAt !== null,
        label: row.label,
      },
      'mcp.token.deleted',
    );

    return { deletedTokenId: row.id };
  },

  /**
   * Resolve a presented plaintext credential, or `null` when it is unusable.
   *
   * One predicate for every rejection — unknown, malformed, revoked, expired —
   * on purpose: the holder of a stolen token learns nothing about why it
   * stopped working, and there is a single code path to keep correct
   * (api-design §3.1).
   */
  async verify(plaintext: string): Promise<ResolvedMcpToken | null> {
    if (!looksLikeToken(plaintext)) {
      return null;
    }

    const row = await mcpTokensRepository.findByHash(
      prisma,
      hashToken(plaintext),
    );

    if (!row || row.revokedAt !== null) {
      return null;
    }

    if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    return {
      tokenId: row.id,
      userId: row.userId,
      workspaceId: row.workspaceId,
      scopes: row.scopes,
    };
  },

  /**
   * Record that a credential was used (data-model D6): best-effort, throttled to
   * one write per window, and never able to fail the request it belongs to.
   *
   * Everything about it is deliberate:
   * - **best-effort** — `lastUsedAt` is a diagnostic, not a permission. A failed
   *   stamp must not turn a working agent call into an error, so the failure is
   *   logged and swallowed here, where no caller can accidentally propagate it;
   * - **throttled** — the condition lives in the `WHERE` of one statement
   *   (`repository.touchLastUsed`), so a busy agent costs at most one write a
   *   minute and concurrent calls cannot both write;
   * - **outside any transaction** — it is not part of the action the caller is
   *   performing, and it must not hold a lock or commit with it.
   *
   * Returns whether *this* call did the stamping, which is what the tests assert
   * on rather than on the timestamp alone.
   */
  async touchLastUsed(
    tokenId: string,
    seenAt: Date = new Date(),
  ): Promise<boolean> {
    try {
      const { count } = await mcpTokensRepository.touchLastUsed(
        prisma,
        tokenId,
        seenAt,
        MCP_LAST_USED_THROTTLE_MS,
      );

      return count > 0;
    } catch (error) {
      logger.warn({ err: error, tokenId }, 'mcp.token.last_used_failed');

      return false;
    }
  },
};
