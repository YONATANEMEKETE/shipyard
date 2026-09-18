import type { Request } from 'express';
import type { McpTokenScope } from '@shipyard/shared';
import {
  resolveMemberWorkspaceContext,
  type WorkspaceRequestContext,
} from '../../common/guards/workspace-context.js';
import { logger } from '../../common/logger/index.js';
import { McpUnauthorizedError } from './errors.js';
import { mcpTokensService } from './service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Credential resolution for `/mcp` (F13, M4 — api-design §3.1)
//
// The step between "this request is a well-formed modern request" and "dispatch
// it": read the bearer token, resolve it to its owner, load the owner's **live**
// membership, and hand back the same `WorkspaceRequestContext` the cookie guards
// produce. Two doors, one room — a service downstream cannot tell which door a
// request came through, which is the property the milestone's gate is really
// asking for.
//
// What lives here and what does not:
// - the token mechanics (hash, shape, one-predicate rejection) are the service's
//   (`mcpTokensService.verify`), not this file's;
// - the context shape belongs to `common/guards/workspace-context.ts`, so it is
//   *built* there, never re-assembled here;
// - this file owns the HTTP concerns: which header, which scheme, and the single
//   answer every refusal gets.
//
// Cookies are never read. Not here, not anywhere on this surface: a browser
// sends them, an agent cannot, and accepting both would mean two credential
// models with two failure modes (spec §3.1). The request is authenticated by the
// `Authorization` header or it is not authenticated at all.
//
// Deliberately **not** here: the per-token rate limit (§10). It keys on the
// resolved token, so it runs immediately after this step — but it is a policy
// with its own configuration, and keeping it separate keeps this file a resolver.
// ─────────────────────────────────────────────────────────────────────────────

/** Who a presented credential is, and where it may act. */
export interface McpCredential {
  readonly tokenId: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly scopes: readonly McpTokenScope[];
}

/** The resolved identity of an `/mcp` caller: its credential and its context. */
export interface McpAuth {
  readonly credential: McpCredential;
  /** The context the cookie path would have produced for this member. */
  readonly context: WorkspaceRequestContext;
}

/**
 * Why a credential was refused. **Log-only**: the response is one message for
 * every case, so nothing here may reach the client (api-design §3.1 — a stolen
 * token's holder learns nothing about why it stopped working).
 */
export type McpAuthRejection =
  'missing_header' | 'malformed_header' | 'unusable_token' | 'membership_gone';

// `Bearer <token>`, scheme case-insensitive, one or more spaces as the
// separator, and nothing else in the value: a token is base64url plus its
// `shp_` prefix, so any whitespace inside means this is not one.
const BEARER_PATTERN = /^bearer[ \t]+(\S+)$/iu;

/**
 * The plaintext credential from an `Authorization` header, or `null` when the
 * header is absent or is not a well-formed bearer credential.
 *
 * Extracted and exported so the parsing rules are unit-testable on their own —
 * "what counts as presenting a token" is exactly the kind of rule that quietly
 * drifts when it lives inside a request handler.
 */
export function parseBearerToken(
  headerValue: string | undefined,
): string | null {
  if (headerValue === undefined) {
    return null;
  }

  const match = BEARER_PATTERN.exec(headerValue.trim());
  const value = match?.[1]?.trim() ?? '';

  return value.length > 0 ? value : null;
}

/** The scheme a caller attempted, for the log line only — never its value. */
function schemeOf(headerValue: string | undefined): string | undefined {
  const [scheme] = headerValue?.trim().split(/[ \t]+/u, 1) ?? [];

  return scheme !== undefined && scheme !== ''
    ? scheme.toLowerCase()
    : undefined;
}

function requestIdOf(request: Request): string | undefined {
  return typeof request.id === 'string' ? request.id : undefined;
}

/**
 * Refuses, in one shape, and says why only in the log.
 *
 * Declared `never` so the caller narrows: after a refusal there is nothing left
 * to check, which is what keeps the rejection cases from growing a branch each.
 */
function refuse(
  reason: McpAuthRejection,
  request: Request,
  details: Record<string, unknown> = {},
): never {
  logger.warn(
    { requestId: requestIdOf(request), reason, ...details },
    'mcp.auth.refused',
  );

  throw new McpUnauthorizedError();
}

/**
 * Resolves the credential on this request, or throws {@link McpUnauthorizedError}.
 *
 * The order is the one api-design §3.1 draws, and every step that can fail
 * answers identically:
 *
 *   1. `Authorization` header — present, `Bearer`, one value;
 *   2. the token itself — shape, then the single predicate (unknown, malformed,
 *      revoked, expired and deleted are one answer);
 *   3. the **live** membership — a removed member's credential stops working on
 *      its next request, which is why this check exists here rather than being
 *      implied by the token row (`data-model` invariant 2);
 *   4. `lastUsedAt` — best-effort, after the caller is known to be legitimate, so
 *      a refused request never writes anything.
 */
export async function resolveMcpAuth(request: Request): Promise<McpAuth> {
  const header = request.get('authorization');
  const presented = parseBearerToken(header);

  if (presented === null) {
    refuse(
      header === undefined || header.trim() === ''
        ? 'missing_header'
        : 'malformed_header',
      request,
      { scheme: schemeOf(header) },
    );
  }

  const resolved = await mcpTokensService.verify(presented);

  if (resolved === null) {
    // No token id is logged here on purpose: at this point we do not know it,
    // and the value we were given is exactly what must never be logged.
    refuse('unusable_token', request, { tokenShape: 'shp_' });
  }

  const context = await resolveMemberWorkspaceContext({
    userId: resolved.userId,
    workspaceId: resolved.workspaceId,
  });

  if (context === null) {
    refuse('membership_gone', request, { tokenId: resolved.tokenId });
  }

  // Stamped only for a request that will actually be dispatched (data-model D6).
  const stamped = await mcpTokensService.touchLastUsed(resolved.tokenId);

  logger.info(
    {
      requestId: requestIdOf(request),
      tokenId: resolved.tokenId,
      userId: resolved.userId,
      workspaceId: context.workspaceId,
      role: context.role,
      scopes: resolved.scopes,
      stampedLastUsed: stamped,
    },
    'mcp.auth.resolved',
  );

  return {
    credential: {
      tokenId: resolved.tokenId,
      userId: resolved.userId,
      workspaceId: resolved.workspaceId,
      scopes: resolved.scopes,
    },
    context,
  };
}
