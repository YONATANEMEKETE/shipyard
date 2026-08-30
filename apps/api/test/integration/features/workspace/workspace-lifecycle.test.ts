import { describe, it, expect, beforeEach, vi } from 'vitest';
import { errorResponseSchema } from '@shipyard/shared';

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

import { createTestApp } from '../../../helpers/app.js';
import { resetDatabase } from '../../../helpers/db.js';
import { prisma } from '../../../../src/common/db/client.js';
import { env } from '../../../../src/common/config/env.js';

const WEB_URL = env.WEB_URL;
const PASSWORD = 'sup3r-secret-pass';

type Request = ReturnType<typeof createTestApp>;

function bodyOf<T = Record<string, unknown>>(response: { body: unknown }): T {
  return response.body as T;
}

/**
 * Success responses use the repo's canonical `{ data }` envelope
 * (common/http/responses.ts sendSuccess); error envelopes are `{ error }`.
 */
function dataOf<T>(response: { body: unknown }): T {
  return bodyOf<{ data: T }>(response).data;
}

function errorCodeOf(response: { body: unknown }): string {
  return bodyOf<{ error: { code: string } }>(response).error.code;
}

function statusOf(response: { body: unknown }): string {
  return dataOf<{ status: string }>(response).status;
}

function cookieHeader(response: { headers: Record<string, unknown> }): string {
  const raw: unknown = response.headers['set-cookie'];
  const list: string[] =
    typeof raw === 'string'
      ? [raw]
      : Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === 'string')
        : [];
  return list.map((c) => c.split(';')[0] ?? '').join('; ');
}

/** Registers + verifies a fresh user and returns their session cookie. */
async function registerUser(request: Request, email: string): Promise<string> {
  await request
    .post('/api/v1/auth/sign-up/email')
    .set('Origin', WEB_URL)
    .send({ name: 'Workspace Tester', email, password: PASSWORD });

  const last = sendEmailMock.mock.calls.at(-1)![0];
  const linkMatch = /https?:\/\/\S+/u.exec(last.text ?? last.html);
  const token = new URL(linkMatch![0]).searchParams.get('token');

  const response = await createTestApp()
    .get(`/api/v1/auth/verify-email?token=${token}&callbackURL=%2F`)
    .set('Origin', WEB_URL);
  return cookieHeader(response);
}

interface WsResp {
  id?: string;
  slug?: string;
  name?: string;
  icon?: string | null;
  status?: string;
  role?: string;
  memberCount?: number;
  createdAt?: string;
  archivedAt?: string | null;
}

describe('workspace lifecycle (integration)', () => {
  let request: Request;
  let ownerCookies: string;

  const uniqueEmail = () => `ws-lifecycle-${crypto.randomUUID()}@example.com`;

  function createWorkspace(
    auth: Request,
    cookies: string,
    body: Record<string, unknown>,
  ) {
    return auth.post('/api/v1/workspaces').set('Cookie', cookies).send(body);
  }

  async function makeOwnerWorkspace(cookies: string): Promise<WsResp> {
    const res = await createWorkspace(request, cookies, {
      name: 'Shipyard Team',
      icon: 'rocket',
    });
    expect(res.status).toBe(201);
    return dataOf<WsResp>(res);
  }

  beforeEach(async () => {
    await resetDatabase();
    request = createTestApp();
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue({ status: 'logged' });
    ownerCookies = await registerUser(request, uniqueEmail());
  });

  it('creates a workspace and makes the caller its Owner', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);

    expect(ws.id).toBeTruthy();
    expect(ws.slug).toBeTruthy();
    expect(ws.name).toBe('Shipyard Team');
    expect(ws.icon).toBe('rocket');
    expect(ws.status).toBe('ACTIVE');
    expect(ws.role).toBe('OWNER');
    expect(ws.memberCount).toBe(1);
    expect(ws.createdAt).toBeTruthy();
    expect(ws.archivedAt).toBeNull();
  });

  it('lists the workspaces the user belongs to', async () => {
    await makeOwnerWorkspace(ownerCookies);

    const res = await request
      .get('/api/v1/workspaces')
      .set('Cookie', ownerCookies);
    expect(res.status).toBe(200);
    const list = dataOf<{ workspaces: WsResp[] }>(res);
    expect(list.workspaces).toHaveLength(1);
    expect(list.workspaces[0]?.name).toBe('Shipyard Team');
  });

  it('list is empty when the user has no workspaces', async () => {
    const res = await request
      .get('/api/v1/workspaces')
      .set('Cookie', ownerCookies);
    expect(res.status).toBe(200);
    expect(dataOf<{ workspaces: unknown[] }>(res).workspaces).toEqual([]);
  });

  it('gets workspace detail by slug', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);

    const res = await request
      .get(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', ownerCookies);
    expect(res.status).toBe(200);
    const detail = dataOf<WsResp>(res);
    expect(detail.name).toBe('Shipyard Team');
    expect(detail.slug).toBe(ws.slug);
  });

  it('renames and changes the icon', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);

    const res = await request
      .patch(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', ownerCookies)
      .send({ name: '  Renamed Team  ', icon: 'boxes' });
    expect(res.status).toBe(200);
    const updated = dataOf<WsResp>(res);
    expect(updated.name).toBe('Renamed Team'); // trimmed server-side
    expect(updated.icon).toBe('boxes');
  });

  it('preserves history across archive → restore', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);

    const archived = dataOf<WsResp>(
      await request
        .post(`/api/v1/workspaces/${ws.slug}/archive`)
        .set('Cookie', ownerCookies)
        .send({ confirm: true }),
    );
    expect(archived.status).toBe('ARCHIVED');
    expect(archived.archivedAt).toBeTruthy();

    const restored = dataOf<WsResp>(
      await request
        .post(`/api/v1/workspaces/${ws.slug}/restore`)
        .set('Cookie', ownerCookies)
        .send({ confirm: true }),
    );
    expect(restored.status).toBe('ACTIVE');
    // archivedAt retained to preserve the historical record (spec rule 9)
    expect(restored.archivedAt).toBe(archived.archivedAt);
  });

  it('permanently deletes only from the archived state with the exact name', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);

    // Must archive first
    const premature = await request
      .delete(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', ownerCookies)
      .send({ confirmName: 'Shipyard Team' });
    expect(premature.status).toBe(409);
    expect(bodyOf<{ error: { code: string } }>(premature).error.code).toBe(
      'INVALID_STATUS_TRANSITION',
    );

    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', ownerCookies)
      .send({ confirm: true });

    // Wrong name is rejected, workspace survives
    const wrongName = await request
      .delete(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', ownerCookies)
      .send({ confirmName: 'Not The Name' });
    expect(wrongName.status).toBe(400);
    expect(bodyOf<{ error: { code: string } }>(wrongName).error.code).toBe(
      'NAME_MISMATCH',
    );

    // Correct name deletes
    const deleted = await request
      .delete(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', ownerCookies)
      .send({ confirmName: 'Shipyard Team' });
    expect(deleted.status).toBe(204);

    const gone = await request
      .get(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', ownerCookies);
    expect(gone.status).toBe(404);
  });

  it('rejects archive/restore without confirmation', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);

    const archive = await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', ownerCookies)
      .send({});
    expect(archive.status).toBe(400);
    expect(bodyOf<{ error: { code: string } }>(archive).error.code).toBe(
      'CONFIRMATION_REQUIRED',
    );
  });

  it('rejects re-archiving an archived workspace and restoring an active one', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);

    const archived = dataOf<WsResp>(
      await request
        .post(`/api/v1/workspaces/${ws.slug}/archive`)
        .set('Cookie', ownerCookies)
        .send({ confirm: true }),
    );
    expect(archived.status).toBe('ARCHIVED');

    const rearchive = await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', ownerCookies)
      .send({ confirm: true });
    expect(rearchive.status).toBe(409);
    expect(errorCodeOf(rearchive)).toBe('INVALID_STATUS_TRANSITION');

    const restored = await request
      .post(`/api/v1/workspaces/${ws.slug}/restore`)
      .set('Cookie', ownerCookies)
      .send({ confirm: true });
    expect(restored.status).toBe(200);

    // Restoring an already-active workspace is rejected
    const restoreActive = await request
      .post(`/api/v1/workspaces/${ws.slug}/restore`)
      .set('Cookie', ownerCookies)
      .send({ confirm: true });
    expect(restoreActive.status).toBe(409);
    expect(errorCodeOf(restoreActive)).toBe('INVALID_STATUS_TRANSITION');
  });

  it('validates request bodies (invalid name, bad icon, empty patch)', async () => {
    const tooLong = await createWorkspace(request, ownerCookies, {
      name: 'x'.repeat(81),
    });
    expect(tooLong.status).toBe(400);
    expect(errorCodeOf(tooLong)).toBe('VALIDATION_ERROR');

    const emptyName = await createWorkspace(request, ownerCookies, {
      name: '',
    });
    expect(emptyName.status).toBe(400);

    const badIcon = await createWorkspace(request, ownerCookies, {
      name: 'Valid',
      icon: 'not-a-real-icon',
    });
    expect(badIcon.status).toBe(400);

    const ws = await makeOwnerWorkspace(ownerCookies);
    const emptyPatch = await request
      .patch(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', ownerCookies)
      .send({});
    expect(emptyPatch.status).toBe(400);
  });
  it('rejects all endpoints without a session (401)', async () => {
    const anon = createTestApp();
    const results = await Promise.all([
      anon.post('/api/v1/workspaces').send({ name: 'x' }),
      anon.get('/api/v1/workspaces'),
      anon.get('/api/v1/workspaces/anything'),
      anon.patch('/api/v1/workspaces/anything').send({ name: 'x' }),
      anon.post('/api/v1/workspaces/anything/archive').send({ confirm: true }),
      anon.post('/api/v1/workspaces/anything/restore').send({ confirm: true }),
      anon.delete('/api/v1/workspaces/anything').send({ confirmName: 'x' }),
    ]);
    for (const result of results) {
      expect(result.status).toBe(401);
      expect(errorResponseSchema.parse(result.body).error.code).toBe(
        'UNAUTHORIZED',
      );
    }
  });

  it('does not leak existence: non-member and unknown slug are identical 404', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);

    const outsider = createTestApp();
    const outsiderCookies = await registerUser(outsider, uniqueEmail());

    const nonMemberRes = await outsider
      .get(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', outsiderCookies);
    const unknownRes = await outsider
      .get('/api/v1/workspaces/does-not-exist')
      .set('Cookie', outsiderCookies);

    expect(nonMemberRes.status).toBe(404);
    expect(unknownRes.status).toBe(404);
    // Identical envelope modulo the per-request id → no existence leak.
    const envelopeOf = (response: { body: unknown }) => {
      const error = bodyOf<{
        error: { code: string; message: string; requestId?: string };
      }>(response).error;
      return { code: error.code, message: error.message };
    };
    expect(envelopeOf(nonMemberRes)).toEqual(envelopeOf(unknownRes));
    expect(errorCodeOf(nonMemberRes)).toBe('WORKSPACE_NOT_FOUND');
  });

  it('rejects mutating an archived workspace with 409, but GET still works', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);
    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', ownerCookies)
      .send({ confirm: true });

    const patch = await request
      .patch(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', ownerCookies)
      .send({ name: 'Should Fail' });
    expect(patch.status).toBe(409);
    expect(errorCodeOf(patch)).toBe('WORKSPACE_ARCHIVED');

    // GET on the archived workspace is still allowed (read-only view)
    const get = await request
      .get(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', ownerCookies);
    expect(get.status).toBe(200);
    expect(statusOf(get)).toBe('ARCHIVED');
  });

  it('keeps the user account when a workspace is deleted (cascade contract)', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);
    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', ownerCookies)
      .send({ confirm: true });
    const deleted = await request
      .delete(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', ownerCookies)
      .send({ confirmName: 'Shipyard Team' });
    expect(deleted.status).toBe(204);

    // Session still valid → user account untouched (spec rule 8)
    const session = await createTestApp()
      .get('/api/v1/auth/get-session')
      .set('Cookie', ownerCookies);
    expect(session.status).toBe(200);
    expect(bodyOf<{ user?: unknown }>(session).user).toBeTruthy();
  });

  it('allows duplicate workspace names (names are never identifiers)', async () => {
    const first = await makeOwnerWorkspace(ownerCookies);

    const duplicate = await createWorkspace(request, ownerCookies, {
      name: 'Shipyard Team',
    });
    expect(duplicate.status).toBe(201);
    const second = dataOf<WsResp>(duplicate);
    expect(second.slug).toBeTruthy();
    expect(second.slug).not.toBe(first.slug);

    const list = dataOf<{ workspaces: WsResp[] }>(
      await request.get('/api/v1/workspaces').set('Cookie', ownerCookies),
    );
    expect(list.workspaces).toHaveLength(2);
  });

  it('keeps the slug stable across renames (references never break)', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);

    const renamed = dataOf<WsResp>(
      await request
        .patch(`/api/v1/workspaces/${ws.slug}`)
        .set('Cookie', ownerCookies)
        .send({ name: 'New Name' }),
    );
    expect(renamed.slug).toBe(ws.slug);

    // The pre-rename slug still resolves afterwards (spec rule 10)
    const fetched = await request
      .get(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', ownerCookies);
    expect(fetched.status).toBe(200);
    expect(dataOf<WsResp>(fetched).name).toBe('New Name');
  });

  it('trims confirmName before comparing, so padded input still deletes', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);
    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', ownerCookies)
      .send({ confirm: true });

    const deleted = await request
      .delete(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', ownerCookies)
      .send({ confirmName: '  Shipyard Team  ' });
    expect(deleted.status).toBe(204);
    const gone = await request
      .get(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', ownerCookies);
    expect(gone.status).toBe(404);
  });

  it('patches icon-only without touching name or slug', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);
    const updated = dataOf<WsResp>(
      await request
        .patch(`/api/v1/workspaces/${ws.slug}`)
        .set('Cookie', ownerCookies)
        .send({ icon: 'ship' }),
    );
    expect(updated.icon).toBe('ship');
    expect(updated.name).toBe('Shipyard Team');
    expect(updated.slug).toBe(ws.slug);
  });

  it('returns 403 FORBIDDEN_ROLE for a non-owner member on owner-only routes', async () => {
    const ws = await makeOwnerWorkspace(ownerCookies);

    // F2 only ever writes OWNER memberships, so a MEMBER row is seeded here to
    // exercise the guard chain end to end (api-design.md §10.1). The MEMBER enum
    // value is forward-shipped so Prisma deserializes it.
    const outsiderCookies = await registerUser(request, uniqueEmail());
    const session = await createTestApp()
      .get('/api/v1/auth/get-session')
      .set('Cookie', outsiderCookies);
    const outsiderId = bodyOf<{ user?: { id?: string } }>(session).user?.id;
    expect(outsiderId).toBeTruthy();

    await prisma.$executeRawUnsafe(
      `INSERT INTO workspace_member (id, "workspaceId", "userId", role, "createdAt")
       VALUES ($1, $2, $3, 'MEMBER', NOW())`,
      crypto.randomUUID(),
      ws.id,
      outsiderId,
    );

    const patch = await request
      .patch(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', outsiderCookies)
      .send({ name: 'Not Allowed' });
    expect(patch.status).toBe(403);
    expect(errorCodeOf(patch)).toBe('FORBIDDEN_ROLE');

    const archive = await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', outsiderCookies)
      .send({ confirm: true });
    expect(archive.status).toBe(403);
    expect(errorCodeOf(archive)).toBe('FORBIDDEN_ROLE');
  });
});
