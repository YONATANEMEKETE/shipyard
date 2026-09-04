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

import { createTestApp } from '../../../helpers/app.js';
import { resetDatabase } from '../../../helpers/db.js';
import { env } from '../../../../src/common/config/env.js';

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
function conflictingIdOf(res: { body: unknown }): string | undefined {
  return bodyOf<{
    error: { details?: { conflictingCycle?: { id: string } } };
  }>(res).error.details?.conflictingCycle?.id;
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

interface CycleDetail {
  id: string;
  workspaceId: string;
  name: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  startDate: string;
  endDate: string;
  archivedAt: string | null;
}

function cyclesUrl(slug: string): string {
  return `/api/v1/workspaces/${slug}/cycles`;
}
function cycleUrl(slug: string, id: string): string {
  return `/api/v1/workspaces/${slug}/cycles/${id}`;
}

describe('cycles scheduling (integration)', () => {
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

  async function createCycle(body: Record<string, unknown>): Promise<{
    status: number;
    res: { status: number; body: unknown };
    detail: CycleDetail;
  }> {
    const res = await request
      .post(cyclesUrl(ws.slug))
      .set('Cookie', owner.cookies)
      .send(body);
    return { status: res.status, res, detail: dataOf<CycleDetail>(res) };
  }

  // ── Names ──────────────────────────────────────────────────────────────

  it('rejects duplicate names case-insensitively, archived rows reserve', async () => {
    const first = await createCycle({
      name: 'Sprint',
      startDate: '2027-01-01',
      endDate: '2027-01-14',
    });
    expect(first.status).toBe(201);

    const dup = await createCycle({
      name: 'sprint',
      startDate: '2027-03-01',
      endDate: '2027-03-14',
    });
    expect(dup.status).toBe(409);
    expect(errorCodeOf(dup.res)).toBe('CYCLE_NAME_CONFLICT');
    expect(conflictingIdOf(dup.res)).toBe(first.detail.id);

    // Archived rows still reserve the name.
    await request
      .post(`${cycleUrl(ws.slug, first.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const afterArchive = await createCycle({
      name: 'SPRINT',
      startDate: '2027-05-01',
      endDate: '2027-05-14',
    });
    expect(afterArchive.status).toBe(409);
    expect(errorCodeOf(afterArchive.res)).toBe('CYCLE_NAME_CONFLICT');
  });

  it('rename collision is 409 with the conflicting card', async () => {
    await createCycle({
      name: 'Alpha',
      startDate: '2027-01-01',
      endDate: '2027-01-14',
    });
    const beta = await createCycle({
      name: 'Beta',
      startDate: '2027-02-01',
      endDate: '2027-02-14',
    });
    const res = await request
      .patch(cycleUrl(ws.slug, beta.detail.id))
      .set('Cookie', owner.cookies)
      .send({ name: 'alpha' });
    expect(res.status).toBe(409);
    expect(errorCodeOf(res)).toBe('CYCLE_NAME_CONFLICT');
  });

  // ── Overlap (inclusive bounds) ─────────────────────────────────────────

  it('inclusive bounds: touching on the same day conflicts, next day is fine', async () => {
    const first = await createCycle({
      name: 'First',
      startDate: '2027-01-01',
      endDate: '2027-01-10',
    });
    expect(first.status).toBe(201);

    // Start == previous end → overlap (inclusive).
    const touching = await createCycle({
      name: 'Touching',
      startDate: '2027-01-10',
      endDate: '2027-01-20',
    });
    expect(touching.status).toBe(409);
    expect(errorCodeOf(touching.res)).toBe('CYCLE_OVERLAP');
    expect(conflictingIdOf(touching.res)).toBe(first.detail.id);

    // Start == previous end + 1 → no overlap.
    const adjacent = await createCycle({
      name: 'Adjacent',
      startDate: '2027-01-11',
      endDate: '2027-01-20',
    });
    expect(adjacent.status).toBe(201);

    // Containment both directions conflicts.
    const outer = await createCycle({
      name: 'Outer',
      startDate: '2026-12-01',
      endDate: '2027-12-31',
    });
    expect(outer.status).toBe(409);
  });

  it('archived siblings neither block nor are blocked', async () => {
    const first = await createCycle({
      name: 'Old',
      startDate: '2027-01-01',
      endDate: '2027-01-14',
    });
    await request
      .post(`${cycleUrl(ws.slug, first.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    // Overlapping an archived range succeeds.
    const over = await createCycle({
      name: 'New',
      startDate: '2027-01-05',
      endDate: '2027-01-20',
    });
    expect(over.status).toBe(201);

    // Restoring into the now-occupied range fails and stays archived.
    const restore = await request
      .post(`${cycleUrl(ws.slug, first.detail.id)}/restore`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(restore.status).toBe(409);
    expect(errorCodeOf(restore)).toBe('CYCLE_OVERLAP');
    expect(conflictingIdOf(restore)).toBe(over.detail.id);

    const stillArchived = await request
      .get(cycleUrl(ws.slug, first.detail.id))
      .set('Cookie', owner.cookies);
    expect(dataOf<CycleDetail>(stillArchived).archivedAt).not.toBeNull();
  });

  it('concurrent conflicting creates: one 201, one 409 (exclusion backstop)', async () => {
    const results = await Promise.all([
      createCycle({
        name: 'RaceA',
        startDate: '2027-06-01',
        endDate: '2027-06-14',
      }),
      createCycle({
        name: 'RaceB',
        startDate: '2027-06-10',
        endDate: '2027-06-20',
      }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(errorCodeOf(loser.res)).toBe('CYCLE_OVERLAP');
  });

  it('ACTIVE date edit into a sibling range is 409; clean extension succeeds', async () => {
    const active = await createCycle({
      name: 'Active',
      startDate: '2027-01-01',
      endDate: '2027-01-14',
    });
    await createCycle({
      name: 'Sibling',
      startDate: '2027-02-01',
      endDate: '2027-02-14',
    });
    await request
      .post(`${cycleUrl(ws.slug, active.detail.id)}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const clash = await request
      .patch(cycleUrl(ws.slug, active.detail.id))
      .set('Cookie', owner.cookies)
      .send({ endDate: '2027-02-05' });
    expect(clash.status).toBe(409);
    expect(errorCodeOf(clash)).toBe('CYCLE_OVERLAP');

    const extend = await request
      .patch(cycleUrl(ws.slug, active.detail.id))
      .set('Cookie', owner.cookies)
      .send({ endDate: '2027-01-20' });
    expect(extend.status).toBe(200);
    expect(dataOf<CycleDetail>(extend).endDate).toBe('2027-01-20');
  });

  // ── Single active ──────────────────────────────────────────────────────

  it('start while another ACTIVE exists is 409 with the conflicting card', async () => {
    const first = await createCycle({
      name: 'One',
      startDate: '2027-01-01',
      endDate: '2027-01-14',
    });
    const second = await createCycle({
      name: 'Two',
      startDate: '2027-02-01',
      endDate: '2027-02-14',
    });
    await request
      .post(`${cycleUrl(ws.slug, first.detail.id)}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const blocked = await request
      .post(`${cycleUrl(ws.slug, second.detail.id)}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(blocked.status).toBe(409);
    expect(errorCodeOf(blocked)).toBe('ANOTHER_ACTIVE_EXISTS');
    expect(conflictingIdOf(blocked)).toBe(first.detail.id);
  });

  it('concurrent starts: one 200, one 409 (partial-index backstop)', async () => {
    const first = await createCycle({
      name: 'ConA',
      startDate: '2027-01-01',
      endDate: '2027-01-14',
    });
    const second = await createCycle({
      name: 'ConB',
      startDate: '2027-02-01',
      endDate: '2027-02-14',
    });
    const results = await Promise.all([
      request
        .post(`${cycleUrl(ws.slug, first.detail.id)}/start`)
        .set('Cookie', owner.cookies)
        .send({ confirm: true }),
      request
        .post(`${cycleUrl(ws.slug, second.detail.id)}/start`)
        .set('Cookie', owner.cookies)
        .send({ confirm: true }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(errorCodeOf(loser)).toBe('ANOTHER_ACTIVE_EXISTS');
    expect(conflictingIdOf(loser)).toBeTruthy();
  });

  it('reopen while another ACTIVE exists is 409; works once the slot frees', async () => {
    const first = await createCycle({
      name: 'First',
      startDate: '2027-01-01',
      endDate: '2027-01-14',
    });
    const second = await createCycle({
      name: 'Second',
      startDate: '2027-02-01',
      endDate: '2027-02-14',
    });
    // Deterministic path: start + complete `first`, start `second`, reopen attempt.
    await request
      .post(`${cycleUrl(ws.slug, first.detail.id)}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    await request
      .post(`${cycleUrl(ws.slug, first.detail.id)}/complete`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    await request
      .post(`${cycleUrl(ws.slug, second.detail.id)}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const blocked = await request
      .post(`${cycleUrl(ws.slug, first.detail.id)}/reopen`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(blocked.status).toBe(409);
    expect(errorCodeOf(blocked)).toBe('ANOTHER_ACTIVE_EXISTS');

    await request
      .post(`${cycleUrl(ws.slug, second.detail.id)}/complete`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const reopened = await request
      .post(`${cycleUrl(ws.slug, first.detail.id)}/reopen`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(reopened.status).toBe(200);
    expect(dataOf<CycleDetail>(reopened).status).toBe('ACTIVE');
  });

  // ── List ───────────────────────────────────────────────────────────────

  it('lists chronological (startDate asc) by default; status filter finds ACTIVE', async () => {
    await createCycle({
      name: 'Later',
      startDate: '2027-03-01',
      endDate: '2027-03-14',
    });
    const earlier = await createCycle({
      name: 'Earlier',
      startDate: '2027-01-01',
      endDate: '2027-01-14',
    });
    const list = await request
      .get(cyclesUrl(ws.slug))
      .set('Cookie', owner.cookies);
    expect(
      dataOf<{ cycles: CycleDetail[] }>(list).cycles.map((c) => c.name),
    ).toEqual(['Earlier', 'Later']);

    // Dashboard lookup: zero cards before any start.
    const noneActive = await request
      .get(`${cyclesUrl(ws.slug)}?status=ACTIVE`)
      .set('Cookie', owner.cookies);
    expect(dataOf<{ cycles: CycleDetail[] }>(noneActive).cycles).toHaveLength(
      0,
    );

    await request
      .post(`${cycleUrl(ws.slug, earlier.detail.id)}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const oneActive = await request
      .get(`${cyclesUrl(ws.slug)}?status=ACTIVE`)
      .set('Cookie', owner.cookies);
    const cards = dataOf<{ cycles: CycleDetail[] }>(oneActive).cycles;
    expect(cards).toHaveLength(1);
    expect(cards[0]!.id).toBe(earlier.detail.id);
  });

  it('archived flag returns only archived; bad query params are 400', async () => {
    const gone = await createCycle({
      name: 'Gone',
      startDate: '2027-01-01',
      endDate: '2027-01-14',
    });
    await createCycle({
      name: 'Live',
      startDate: '2027-02-01',
      endDate: '2027-02-14',
    });
    await request
      .post(`${cycleUrl(ws.slug, gone.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const def = await request
      .get(cyclesUrl(ws.slug))
      .set('Cookie', owner.cookies);
    expect(
      dataOf<{ cycles: CycleDetail[] }>(def).cycles.map((c) => c.name),
    ).toEqual(['Live']);
    const arch = await request
      .get(`${cyclesUrl(ws.slug)}?archived=true`)
      .set('Cookie', owner.cookies);
    expect(
      dataOf<{ cycles: CycleDetail[] }>(arch).cycles.map((c) => c.name),
    ).toEqual(['Gone']);

    for (const query of [
      '?status=BOGUS',
      '?sort=bogus',
      '?order=sideways',
      '?limit=10',
    ]) {
      const bad = await request
        .get(`${cyclesUrl(ws.slug)}${query}`)
        .set('Cookie', owner.cookies);
      expect(bad.status).toBe(400);
      expect(errorCodeOf(bad)).toBe('VALIDATION_ERROR');
    }
  });
});
