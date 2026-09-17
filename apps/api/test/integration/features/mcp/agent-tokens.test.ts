import { describe, it, expect, beforeEach, vi } from 'vitest';

interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn<(message: CapturedEmail) => Promise<unknown>>(),
}));

vi.mock('../../../../src/lib/mailer.js', () => ({ sendEmail: sendEmailMock }));

import { MCP_TOKEN_PREFIX } from '@shipyard/shared';
import { createTestApp } from '../../../helpers/app.js';
import { resetDatabase } from '../../../helpers/db.js';
import { prisma } from '../../../../src/common/db/client.js';
import { env } from '../../../../src/common/config/env.js';
import { mcpTokensService } from '../../../../src/features/mcp/service.js';
import { hashToken } from '../../../../src/features/mcp/tokens.js';

const WEB_URL = env.WEB_URL;
const PASSWORD = 'sup3r-secret-pass';
type Request = ReturnType<typeof createTestApp>;

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}
function dataOf<T>(res: { body: unknown }): T {
  return bodyOf<{ data: T }>(res).data;
}
function errorCodeOf(res: { body: unknown }): string {
  return bodyOf<{ error: { code: string } }>(res).error.code;
}

function cookieHeader(res: { headers: Record<string, unknown> }): string {
  const raw: unknown = res.headers['set-cookie'];
  const list: string[] =
    typeof raw === 'string'
      ? [raw]
      : Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === 'string')
        : [];
  return list.map((c) => c.split(';')[0] ?? '').join('; ');
}

async function registerVerifiedUser(
  request: Request,
  email: string,
): Promise<{ cookies: string; userId: string }> {
  await request
    .post('/api/v1/auth/sign-up/email')
    .set('Origin', WEB_URL)
    .send({ name: 'Test User', email, password: PASSWORD });

  // last sendEmail call is the verification email; extract the token
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const last = sendEmailMock.mock.calls.at(-1)![0] as unknown as CapturedEmail;
  const linkMatch = /https?:\/\/\S+/u.exec(last.text ?? last.html);
  const token = new URL(linkMatch![0]).searchParams.get('token');
  expect(token).toBeTruthy();

  const response = await createTestApp()
    .get(`/api/v1/auth/verify-email?token=${token}&callbackURL=%2F`)
    .set('Origin', WEB_URL);

  const cookies = cookieHeader(response);
  expect(cookies).toBeTruthy();

  const session = await createTestApp()
    .get('/api/v1/auth/get-session')
    .set('Cookie', cookies);
  const userId = bodyOf<{ user?: { id?: string } }>(session).user?.id;
  expect(userId).toBeTruthy();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return { cookies: cookies!, userId: userId! };
}

// ── Shared shapes ────────────────────────────────────────────────────────

interface WsResp {
  id: string;
  slug: string;
  name: string;
  status: string;
  role: string;
}

interface InvitationCard {
  id: string;
  token: string;
  role: string;
}

interface MemberCard {
  id: string;
  userId: string;
  role: string;
}

interface TokenCard {
  id: string;
  workspaceId: string;
  label: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

type TokenWithSecret = TokenCard & { token: string };

function tokensUrl(slug: string): string {
  return `/api/v1/workspaces/${slug}/agent-tokens`;
}

describe('agent access tokens (integration)', () => {
  const uniqueEmail = (prefix: string) =>
    `${prefix}-${crypto.randomUUID()}@example.com`;

  let request: Request;
  let owner: { cookies: string; userId: string; email: string };
  let ws: WsResp;

  beforeEach(async () => {
    await resetDatabase();
    request = createTestApp();
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue({ status: 'logged' });

    const email = uniqueEmail('owner');
    owner = { ...(await registerVerifiedUser(request, email)), email };

    const res = await request
      .post('/api/v1/workspaces')
      .set('Cookie', owner.cookies)
      .send({ name: 'Shipyard Team', icon: 'rocket' });
    expect(res.status).toBe(201);
    ws = dataOf<WsResp>(res);
  });

  /** Registers a verified user and adds them to the workspace as `role`. */
  async function addMember(
    email: string,
    role: 'MEMBER' | 'ADMIN' = 'MEMBER',
  ): Promise<{ cookies: string; userId: string; memberId: string }> {
    const member = await registerVerifiedUser(createTestApp(), email);
    const inv = await request
      .post(`/api/v1/workspaces/${ws.slug}/invitations`)
      .set('Cookie', owner.cookies)
      .send({ emails: [email], role });
    const token = dataOf<{ invitations: InvitationCard[] }>(inv).invitations[0]!
      .token;
    const accept = await createTestApp()
      .post(`/api/v1/invitations/${token}/accept`)
      .set('Cookie', member.cookies)
      .send({});
    const card = dataOf<{ member: MemberCard }>(accept).member;
    return {
      cookies: member.cookies,
      userId: member.userId,
      memberId: card.id,
    };
  }

  /** A verified user with their own workspace — for isolation tests. */
  async function createForeignWorkspace(): Promise<{
    slug: string;
    cookies: string;
    tokenId: string;
  }> {
    const foreign = await registerVerifiedUser(
      createTestApp(),
      uniqueEmail('foreign'),
    );
    const created = await createTestApp()
      .post('/api/v1/workspaces')
      .set('Cookie', foreign.cookies)
      .send({ name: 'Foreign Workspace' });
    const foreignWs = dataOf<WsResp>(created);

    const token = await createTestApp()
      .post(tokensUrl(foreignWs.slug))
      .set('Cookie', foreign.cookies)
      .send({ label: 'foreign agent' });

    return {
      slug: foreignWs.slug,
      cookies: foreign.cookies,
      tokenId: dataOf<TokenWithSecret>(token).id,
    };
  }

  async function createToken(
    cookies: string,
    body: Record<string, unknown>,
  ): Promise<{
    status: number;
    res: { status: number; body: unknown };
    card: TokenWithSecret;
  }> {
    const res = await request
      .post(tokensUrl(ws.slug))
      .set('Cookie', cookies)
      .send(body);
    return {
      status: res.status,
      res,
      card:
        res.status < 300
          ? dataOf<TokenWithSecret>(res)
          : ({} as TokenWithSecret),
    };
  }

  // ── Create ─────────────────────────────────────────────────────────────

  it('issues a token once, storing only its hash', async () => {
    const { status, card } = await createToken(owner.cookies, {
      label: '  my laptop  ',
    });

    expect(status).toBe(201);
    expect(card.label).toBe('my laptop');
    expect(card.token.startsWith(MCP_TOKEN_PREFIX)).toBe(true);
    expect(card.token).toMatch(/^shp_[A-Za-z0-9_-]{43}$/u);
    expect(card.tokenPrefix).toBe(card.token.slice(0, 12));
    expect(card.workspaceId).toBe(ws.id);
    expect(card.scopes).toEqual(['READ']);
    expect(card.revokedAt).toBeNull();
    expect(card.expiresAt).toBeNull();
    // lastUsedAt is M4's field (the /mcp auth path touches it), not this one.
    expect(card.lastUsedAt).toBeNull();

    const row = await prisma.mcpToken.findUniqueOrThrow({
      where: { id: card.id },
    });
    expect(row.tokenHash).toBe(hashToken(card.token));
    expect(row.tokenPrefix).toBe(card.tokenPrefix);
    expect(row.userId).toBe(owner.userId);
    expect(row.workspaceId).toBe(ws.id);
    expect(row.scopes).toEqual(['READ']);
    // The plaintext exists nowhere in the stored row.
    expect(JSON.stringify(row)).not.toContain(card.token);
    expect(row.tokenHash).not.toContain(card.token);
  });

  it('accepts explicit scopes and a future expiry', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { status, card } = await createToken(owner.cookies, {
      label: 'deploy bot',
      scopes: ['READ', 'ISSUES_WRITE'],
      expiresAt,
    });

    expect(status).toBe(201);
    expect(card.scopes).toEqual(['READ', 'ISSUES_WRITE']);
    expect(card.expiresAt).toBe(expiresAt);
  });

  it('rejects an expiry that has already passed (400 TOKEN_EXPIRY_INVALID)', async () => {
    const { status, res } = await createToken(owner.cookies, {
      label: 'dead on arrival',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(status).toBe(400);
    expect(errorCodeOf(res)).toBe('TOKEN_EXPIRY_INVALID');
    expect(await prisma.mcpToken.count()).toBe(0);
  });

  it('validates the body — label bounds and unknown keys', async () => {
    const blank = await createToken(owner.cookies, { label: '   ' });
    expect(blank.status).toBe(400);
    expect(errorCodeOf(blank.res)).toBe('VALIDATION_ERROR');

    const missing = await createToken(owner.cookies, {});
    expect(missing.status).toBe(400);

    const unknownScope = await createToken(owner.cookies, {
      label: 'x',
      scopes: ['SUPERUSER'],
    });
    expect(unknownScope.status).toBe(400);

    const emptyScopes = await createToken(owner.cookies, {
      label: 'x',
      scopes: [],
    });
    expect(emptyScopes.status).toBe(400);

    const badDate = await createToken(owner.cookies, {
      label: 'x',
      expiresAt: 'next tuesday',
    });
    expect(badDate.status).toBe(400);
  });

  it('refuses to accept its own scope or binding from the body (strict)', async () => {
    const withWorkspace = await createToken(owner.cookies, {
      label: 'sneaky',
      workspaceId: ws.id,
    });
    expect(withWorkspace.status).toBe(400);
    expect(errorCodeOf(withWorkspace.res)).toBe('VALIDATION_ERROR');

    const withUser = await createToken(owner.cookies, {
      label: 'sneaky',
      userId: owner.userId,
    });
    expect(withUser.status).toBe(400);

    // Nothing was created by either attempt.
    expect(await prisma.mcpToken.count()).toBe(0);
  });

  // ── The issuance ceiling ───────────────────────────────────────────────

  it('lets a member issue READ and ISSUES_WRITE', async () => {
    const member = await addMember(uniqueEmail('member'));

    const read = await createToken(member.cookies, { label: 'mine' });
    expect(read.status).toBe(201);
    expect(read.card.scopes).toEqual(['READ']);

    const write = await createToken(member.cookies, {
      label: 'mine too',
      scopes: ['READ', 'ISSUES_WRITE', 'COMMENTS_WRITE'],
    });
    expect(write.status).toBe(201);
  });

  it('refuses ISSUES_DELETE for a member (403 SCOPE_NOT_PERMITTED)', async () => {
    const member = await addMember(uniqueEmail('member-delete'));

    const { status, res } = await createToken(member.cookies, {
      label: 'delete bot',
      scopes: ['READ', 'ISSUES_DELETE'],
    });

    expect(status).toBe(403);
    expect(errorCodeOf(res)).toBe('SCOPE_NOT_PERMITTED');
    // The message names the offending scope and the role, so the surface can explain itself.
    expect(bodyOf<{ error: { message: string } }>(res).error.message).toContain(
      'ISSUES_DELETE',
    );
    expect(await prisma.mcpToken.count()).toBe(0);
  });

  it('lets an admin issue ISSUES_DELETE', async () => {
    const admin = await addMember(uniqueEmail('admin-delete'), 'ADMIN');

    const { status, card } = await createToken(admin.cookies, {
      label: 'admin bot',
      scopes: ['READ', 'ISSUES_DELETE'],
    });

    expect(status).toBe(201);
    expect(card.scopes).toEqual(['READ', 'ISSUES_DELETE']);
  });

  // ── Guards ─────────────────────────────────────────────────────────────

  it('requires a session (401)', async () => {
    const res = await createTestApp()
      .post(tokensUrl(ws.slug))
      .send({ label: 'anon' });
    expect(res.status).toBe(401);
    expect(errorCodeOf(res)).toBe('UNAUTHORIZED');
  });

  it('answers a non-member with the generic workspace 404', async () => {
    const stranger = await registerVerifiedUser(
      createTestApp(),
      uniqueEmail('stranger'),
    );

    const res = await createTestApp()
      .post(tokensUrl(ws.slug))
      .set('Cookie', stranger.cookies)
      .send({ label: 'not mine' });

    expect(res.status).toBe(404);
    expect(errorCodeOf(res)).toBe('WORKSPACE_NOT_FOUND');
  });

  // ── Archived workspace matrix ──────────────────────────────────────────

  it('rejects creation in an archived workspace but still lists and revokes', async () => {
    const { card } = await createToken(owner.cookies, {
      label: 'before archiving',
    });

    const archived = await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(archived.status).toBe(200);

    const blocked = await createToken(owner.cookies, { label: 'too late' });
    expect(blocked.status).toBe(409);
    expect(errorCodeOf(blocked.res)).toBe('WORKSPACE_ARCHIVED');

    // A member must always be able to see and kill existing credentials.
    const list = await request
      .get(tokensUrl(ws.slug))
      .set('Cookie', owner.cookies);
    expect(list.status).toBe(200);
    expect(dataOf<{ tokens: TokenCard[] }>(list).tokens).toHaveLength(1);

    const revoke = await request
      .post(`${tokensUrl(ws.slug)}/${card.id}/revoke`)
      .set('Cookie', owner.cookies);
    expect(revoke.status).toBe(200);
    expect(dataOf<TokenCard>(revoke).revokedAt).not.toBeNull();
  });

  // ── Listing ────────────────────────────────────────────────────────────

  it('shows a member only their own tokens', async () => {
    const member = await addMember(uniqueEmail('member-list'));
    await createToken(owner.cookies, { label: 'owner token' });
    await createToken(member.cookies, { label: 'member token' });

    const ownerList = await request
      .get(tokensUrl(ws.slug))
      .set('Cookie', owner.cookies);
    const ownerTokens = dataOf<{ tokens: TokenCard[] }>(ownerList).tokens;
    expect(ownerTokens.map((t) => t.label)).toEqual(['owner token']);

    const memberList = await request
      .get(tokensUrl(ws.slug))
      .set('Cookie', member.cookies);
    const memberTokens = dataOf<{ tokens: TokenCard[] }>(memberList).tokens;
    expect(memberTokens.map((t) => t.label)).toEqual(['member token']);
  });

  it('lets OWNER|ADMIN see the whole workspace with ?all=true, and nobody else', async () => {
    const member = await addMember(uniqueEmail('member-all'));
    await createToken(owner.cookies, { label: 'owner token' });
    await createToken(member.cookies, { label: 'member token' });

    const ownerAll = await request
      .get(`${tokensUrl(ws.slug)}?all=true`)
      .set('Cookie', owner.cookies);
    expect(
      dataOf<{ tokens: TokenCard[] }>(ownerAll)
        .tokens.map((t) => t.label)
        .sort(),
    ).toEqual(['member token', 'owner token']);

    // A member asking for all still receives only their own — the flag is a view
    // request, never a permission claim.
    const memberAll = await request
      .get(`${tokensUrl(ws.slug)}?all=true`)
      .set('Cookie', member.cookies);
    expect(
      dataOf<{ tokens: TokenCard[] }>(memberAll).tokens.map((t) => t.label),
    ).toEqual(['member token']);
  });

  it('never exposes the token or its hash on any read path', async () => {
    const { card } = await createToken(owner.cookies, { label: 'secret' });

    const list = await request
      .get(tokensUrl(ws.slug))
      .set('Cookie', owner.cookies);

    expect(JSON.stringify(list.body)).not.toContain(card.token);
    expect(JSON.stringify(list.body)).not.toContain(hashToken(card.token));
    expect(JSON.stringify(list.body)).toContain(card.tokenPrefix);
  });

  // ── Revocation ─────────────────────────────────────────────────────────

  it('revokes idempotently and keeps the row', async () => {
    const { card } = await createToken(owner.cookies, { label: 'rotating' });

    const first = await request
      .post(`${tokensUrl(ws.slug)}/${card.id}/revoke`)
      .set('Cookie', owner.cookies);
    expect(first.status).toBe(200);
    const firstRevokedAt = dataOf<TokenCard>(first).revokedAt;
    expect(firstRevokedAt).not.toBeNull();

    const second = await request
      .post(`${tokensUrl(ws.slug)}/${card.id}/revoke`)
      .set('Cookie', owner.cookies);
    expect(second.status).toBe(200);
    // Second call is a no-op, not a re-stamp.
    expect(dataOf<TokenCard>(second).revokedAt).toBe(firstRevokedAt);

    const row = await prisma.mcpToken.findUnique({ where: { id: card.id } });
    expect(row).not.toBeNull();
  });

  it('lets a member revoke their own token but not another member’s', async () => {
    const member = await addMember(uniqueEmail('member-revoker'));
    const other = await addMember(uniqueEmail('other-member'));

    const mine = await createToken(member.cookies, { label: 'mine' });
    const theirs = await createToken(other.cookies, { label: 'theirs' });

    const ownRevoke = await request
      .post(`${tokensUrl(ws.slug)}/${mine.card.id}/revoke`)
      .set('Cookie', member.cookies);
    expect(ownRevoke.status).toBe(200);

    const foreignRevoke = await request
      .post(`${tokensUrl(ws.slug)}/${theirs.card.id}/revoke`)
      .set('Cookie', member.cookies);
    // Identical to an unknown id — revocation cannot probe other members' credentials.
    expect(foreignRevoke.status).toBe(404);
    expect(errorCodeOf(foreignRevoke)).toBe('TOKEN_NOT_FOUND');

    const stillActive = await prisma.mcpToken.findUnique({
      where: { id: theirs.card.id },
    });
    expect(stillActive?.revokedAt).toBeNull();
  });

  it('lets an admin revoke a member’s token', async () => {
    const admin = await addMember(uniqueEmail('admin-revoker'), 'ADMIN');
    const member = await addMember(uniqueEmail('victim'));
    const { card } = await createToken(member.cookies, { label: 'member bot' });

    const revoke = await request
      .post(`${tokensUrl(ws.slug)}/${card.id}/revoke`)
      .set('Cookie', admin.cookies);

    expect(revoke.status).toBe(200);
    expect(dataOf<TokenCard>(revoke).revokedAt).not.toBeNull();
  });

  it('answers unknown, malformed and foreign-workspace ids identically (404)', async () => {
    const foreign = await createForeignWorkspace();

    const unknown = await request
      .post(`${tokensUrl(ws.slug)}/clx0000000000000000000000/revoke`)
      .set('Cookie', owner.cookies);
    expect(unknown.status).toBe(404);
    expect(errorCodeOf(unknown)).toBe('TOKEN_NOT_FOUND');

    const malformed = await request
      .post(`${tokensUrl(ws.slug)}/not-a-cuid/revoke`)
      .set('Cookie', owner.cookies);
    expect(malformed.status).toBe(400);
    expect(errorCodeOf(malformed)).toBe('VALIDATION_ERROR');

    const crossWorkspace = await request
      .post(`${tokensUrl(ws.slug)}/${foreign.tokenId}/revoke`)
      .set('Cookie', owner.cookies);
    expect(crossWorkspace.status).toBe(404);
    expect(errorCodeOf(crossWorkspace)).toBe('TOKEN_NOT_FOUND');

    // The foreign token is untouched.
    const foreignRow = await prisma.mcpToken.findUnique({
      where: { id: foreign.tokenId },
    });
    expect(foreignRow?.revokedAt).toBeNull();
  });

  // ── Resolution (the read side M4 builds on) ────────────────────────────

  it('resolves a live token and refuses every unusable credential identically', async () => {
    const { card } = await createToken(owner.cookies, {
      label: 'resolvable',
      scopes: ['READ', 'COMMENTS_WRITE'],
    });

    const resolved = await mcpTokensService.verify(card.token);
    expect(resolved).toEqual({
      tokenId: card.id,
      userId: owner.userId,
      workspaceId: ws.id,
      scopes: ['READ', 'COMMENTS_WRITE'],
    });

    // Unknown but well-formed.
    expect(await mcpTokensService.verify(`shp_${'a'.repeat(43)}`)).toBeNull();
    // Malformed / not our shape.
    expect(await mcpTokensService.verify('not-a-token')).toBeNull();
    expect(await mcpTokensService.verify('')).toBeNull();

    // Revoked.
    await request
      .post(`${tokensUrl(ws.slug)}/${card.id}/revoke`)
      .set('Cookie', owner.cookies);
    expect(await mcpTokensService.verify(card.token)).toBeNull();
  });

  it('refuses an expired token without revoking it', async () => {
    const { card } = await createToken(owner.cookies, {
      label: 'expiring',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    expect(await mcpTokensService.verify(card.token)).not.toBeNull();

    // Simulate the clock passing — the API refuses to mint an already-expired
    // token, so expiry has to be reached the way it really happens.
    await prisma.mcpToken.update({
      where: { id: card.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await mcpTokensService.verify(card.token)).toBeNull();
    const row = await prisma.mcpToken.findUniqueOrThrow({
      where: { id: card.id },
    });
    expect(row.revokedAt).toBeNull();
  });

  it('stops resolving after the owning membership is gone', async () => {
    const member = await addMember(uniqueEmail('member-removed'));
    const { card } = await createToken(member.cookies, {
      label: 'ex-member bot',
    });

    // The token itself still resolves at this layer — membership liveness is
    // enforced by the /mcp auth step (M4), which is exactly why it is asserted
    // here as a documented boundary rather than assumed.
    expect(await mcpTokensService.verify(card.token)).not.toBeNull();

    const removed = await request
      .post(`/api/v1/workspaces/${ws.slug}/members/${member.memberId}/remove`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(removed.status).toBe(200);

    const row = await prisma.mcpToken.findUnique({ where: { id: card.id } });
    expect(row?.revokedAt).toBeNull();
    expect(row?.userId).toBe(member.userId);
  });
});
