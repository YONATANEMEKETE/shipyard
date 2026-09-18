import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import { resetDatabase } from '../../../helpers/db.js';
import { prisma } from '../../../../src/common/db/client.js';
import { logger } from '../../../../src/common/logger/index.js';
import {
  resolveWorkspaceContext,
  type WorkspaceRequestContext,
} from '../../../../src/common/guards/workspace-context.js';
import { resolveMcpAuth } from '../../../../src/features/mcp/auth.js';
import { McpUnauthorizedError } from '../../../../src/features/mcp/errors.js';
import { mcpTokensService } from '../../../../src/features/mcp/service.js';
import {
  hashToken,
  MCP_LAST_USED_THROTTLE_MS,
} from '../../../../src/features/mcp/tokens.js';
import { MCP_TOKEN_PREFIX } from '@shipyard/shared';

/**
 * Credential resolution for `/mcp` (F13, M4) — api-design §3.1.
 *
 * Tested against the real database because the whole point of this step is what
 * it *reads*: the token row and the live membership. The rows are seeded
 * directly rather than through the HTTP fixture chain — this layer reads, and
 * how a row got there is the token-management tests' business (agent-tokens).
 *
 * The three properties under test are the milestone's gate:
 *   1. every unusable credential gets **one** answer, byte for byte;
 *   2. a valid token yields the **same context** the cookie path yields — not a
 *      similar one;
 *   3. the membership is checked live, so removing the member kills the token.
 */

type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

let seeded = 0;

function nonce(): string {
  seeded += 1;

  return `${Date.now()}-${seeded}`;
}

/** A workspace with one member, and the context the cookie path would build. */
async function seedMember(
  role: Role = 'MEMBER',
  status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE',
) {
  const suffix = nonce();
  const user = await prisma.user.create({
    data: {
      id: `user_${suffix}`,
      name: 'Token Owner',
      email: `owner-${suffix}@example.com`,
      emailVerified: true,
    },
  });
  const workspace = await prisma.workspace.create({
    data: { name: 'Harbor', slug: `harbor-${suffix}`, status },
  });
  const member = await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role },
  });

  const context: WorkspaceRequestContext = {
    workspaceId: workspace.id,
    memberId: member.id,
    slug: workspace.slug,
    status,
    role,
  };

  return { user, workspace, member, context };
}

async function issueToken(
  context: WorkspaceRequestContext,
  userId: string,
  scopes?: ('READ' | 'ISSUES_WRITE' | 'COMMENTS_WRITE' | 'ISSUES_DELETE')[],
) {
  return mcpTokensService.create(context, userId, {
    label: 'laptop',
    ...(scopes === undefined ? {} : { scopes }),
  });
}

/**
 * A request stub carrying only what the resolver reads: the `Authorization`
 * header and the request id. Using a stub is the point — it proves the resolver
 * touches nothing else (no cookies, no session).
 */
function stubRequest(
  headers: Record<string, string | undefined>,
  id = 'req-mcp-auth',
): Request {
  return {
    id,
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function bearer(token: string): Request {
  return stubRequest({ authorization: `Bearer ${token}` });
}

/** The same context, produced by the cookie path's resolver. */
async function cookiePathContext(
  slug: string,
  userId: string,
): Promise<WorkspaceRequestContext | undefined> {
  const request = {
    params: { slug },
    session: { userId },
  } as unknown as Request;

  let failure: unknown;
  await resolveWorkspaceContext()(
    request,
    {} as Response,
    (error?: unknown) => {
      failure = error;
    },
  );

  expect(failure).toBeUndefined();

  return request.workspaceContext;
}

interface Refusal {
  status: number;
  code: string;
  message: string;
}

async function refusalOf(request: Request): Promise<Refusal> {
  try {
    await resolveMcpAuth(request);
  } catch (error) {
    expect(error).toBeInstanceOf(McpUnauthorizedError);

    const refusal = error as McpUnauthorizedError;

    return {
      status: refusal.statusCode,
      code: refusal.code,
      message: refusal.message,
    };
  }

  throw new Error('expected resolveMcpAuth to refuse this request');
}

describe('resolveMcpAuth', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  // ── Resolution ──────────────────────────────────────────────────────────

  it('resolves a valid token into the context the cookie path produces', async () => {
    const { user, workspace, context } = await seedMember('ADMIN');
    const created = await issueToken(context, user.id, [
      'READ',
      'COMMENTS_WRITE',
    ]);

    const auth = await resolveMcpAuth(bearer(created.token));

    // Credential: what the token is.
    expect(auth.credential).toEqual({
      tokenId: created.id,
      userId: user.id,
      workspaceId: workspace.id,
      scopes: ['READ', 'COMMENTS_WRITE'],
    });

    // Context: what the caller may do — assembled by the same guard the cookie
    // path uses, so this is an equality assertion, not a similarity one.
    expect(auth.context).toEqual(
      await cookiePathContext(workspace.slug, user.id),
    );
    expect(auth.context).toEqual(context);
  });

  it('resolves in an archived workspace — reads are allowed there', async () => {
    const { user, workspace, context } = await seedMember('OWNER', 'ARCHIVED');
    const created = await issueToken(context, user.id);

    const auth = await resolveMcpAuth(bearer(created.token));

    // The status travels in the context and the surface decides: M4 refuses
    // nothing here, because a member must still be able to read.
    expect(auth.context.status).toBe('ARCHIVED');
    expect(auth.context).toEqual(
      await cookiePathContext(workspace.slug, user.id),
    );
  });

  // ── The one answer ──────────────────────────────────────────────────────

  it('refuses every unusable credential with the identical answer', async () => {
    const { user, workspace, context } = await seedMember();

    const live = await issueToken(context, user.id);

    const revoked = await issueToken(context, user.id, ['READ']);
    await mcpTokensService.revoke(context, user.id, revoked.id);

    const expired = await issueToken(context, user.id, ['READ']);
    await prisma.mcpToken.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const deleted = await issueToken(context, user.id, ['READ']);
    await mcpTokensService.remove(context, user.id, deleted.id);

    const removed = await issueToken(context, user.id, ['READ']);
    await prisma.workspaceMember.delete({ where: { id: context.memberId } });

    const refusals = {
      missingHeader: await refusalOf(stubRequest({})),
      emptyHeader: await refusalOf(stubRequest({ authorization: '' })),
      wrongScheme: await refusalOf(
        stubRequest({ authorization: 'Basic dXNlcjpwYXNz' }),
      ),
      notAToken: await refusalOf(bearer('not-a-shipyard-token')),
      unknownHash: await refusalOf(
        bearer(`${MCP_TOKEN_PREFIX}${'a'.repeat(43)}`),
      ),
      revoked: await refusalOf(bearer(revoked.token)),
      expired: await refusalOf(bearer(expired.token)),
      deleted: await refusalOf(bearer(deleted.token)),
      membershipGone: await refusalOf(bearer(removed.token)),
    };

    for (const refusal of Object.values(refusals)) {
      expect(refusal).toEqual({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'A valid agent access token is required for this request',
      });
    }

    // Restore the membership: the credential follows the membership, so the
    // same token works again once the person is back in the workspace.
    await prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: user.id, role: 'MEMBER' },
    });

    expect((await resolveMcpAuth(bearer(live.token))).credential.tokenId).toBe(
      live.id,
    );
  });

  it('never authenticates from a cookie', async () => {
    // There is no cookie path on this surface: an agent has no cookie jar, so a
    // session cookie must count for nothing here (spec §3.1).
    const { user, context } = await seedMember();
    await issueToken(context, user.id);

    const refusal = await refusalOf(
      stubRequest({
        cookie: 'better-auth.session_token=an-actual-looking-session-token',
      }),
    );

    expect(refusal.status).toBe(401);
  });

  // ── lastUsedAt (data-model D6) ──────────────────────────────────────────

  it('stamps lastUsedAt once, then throttles until the window passes', async () => {
    const { user, context } = await seedMember();
    const created = await issueToken(context, user.id);

    expect(
      (await prisma.mcpToken.findUniqueOrThrow({ where: { id: created.id } }))
        .lastUsedAt,
    ).toBeNull();

    await resolveMcpAuth(bearer(created.token));
    const first = await prisma.mcpToken.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(first.lastUsedAt).not.toBeNull();

    // Inside the window: no second write, so the stamp does not move.
    await resolveMcpAuth(bearer(created.token));
    const second = await prisma.mcpToken.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(second.lastUsedAt).toEqual(first.lastUsedAt);

    // Outside it: the next use re-stamps.
    await prisma.mcpToken.update({
      where: { id: created.id },
      data: {
        lastUsedAt: new Date(Date.now() - MCP_LAST_USED_THROTTLE_MS - 1_000),
      },
    });
    const stale = await prisma.mcpToken.findUniqueOrThrow({
      where: { id: created.id },
    });

    await resolveMcpAuth(bearer(created.token));
    const third = await prisma.mcpToken.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(third.lastUsedAt?.getTime()).toBeGreaterThan(
      stale.lastUsedAt?.getTime() ?? 0,
    );
  });

  it('writes nothing for a refused request', async () => {
    const { context, user } = await seedMember();
    const created = await issueToken(context, user.id);

    await refusalOf(bearer(`${MCP_TOKEN_PREFIX}${'b'.repeat(43)}`));

    const row = await prisma.mcpToken.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.lastUsedAt).toBeNull();
  });

  // ── What must never be logged (§10) ─────────────────────────────────────

  it('never logs the token or its hash', async () => {
    const { context, user } = await seedMember();
    const created = await issueToken(context, user.id);

    const info = vi.spyOn(logger, 'info');
    const warn = vi.spyOn(logger, 'warn');
    const error = vi.spyOn(logger, 'error');

    try {
      await resolveMcpAuth(bearer(created.token));
      await refusalOf(bearer(`${MCP_TOKEN_PREFIX}${'c'.repeat(43)}`));
      await refusalOf(stubRequest({ authorization: 'Bearer' }));

      const logged = JSON.stringify([
        ...info.mock.calls,
        ...warn.mock.calls,
        ...error.mock.calls,
      ]);

      // The secret and its hash stay out of every record, on the success path
      // and on every refusal path; the token *id* is the join key support and
      // the audit need, and it does appear.
      expect(logged).not.toContain(created.token);
      expect(logged).not.toContain(hashToken(created.token));
      expect(logged).not.toContain(created.tokenPrefix);
      expect(logged).toContain(created.id);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
