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

import { errorResponseSchema } from '@shipyard/shared';
import { createTestApp } from '../../../helpers/app.js';
import { resetDatabase } from '../../../helpers/db.js';
import { prisma } from '../../../../src/common/db/client.js';
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

interface CycleProgress {
  total: number;
  completed: number;
  percent: number | null;
}

interface CycleDetail {
  id: string;
  workspaceId: string;
  name: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  startDate: string;
  endDate: string;
  archivedAt: string | null;
  progress: CycleProgress;
  goal: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MemberCard {
  id: string;
  userId: string;
  workspaceId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  createdAt: string;
}

interface InvitationCard {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  token: string;
  status: string;
  expiresAt: string;
  updatedAt: string;
  createdAt: string;
  createdById: string | null;
}

function cyclesUrl(slug: string): string {
  return `/api/v1/workspaces/${slug}/cycles`;
}
function cycleUrl(slug: string, id: string): string {
  return `/api/v1/workspaces/${slug}/cycles/${id}`;
}

// Far-future / fixed ranges keep tests independent of the server clock.
const RANGE_A = { startDate: '2027-01-01', endDate: '2027-01-14' };
const RANGE_B = { startDate: '2027-02-01', endDate: '2027-02-14' };

describe('cycles lifecycle (integration)', () => {
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
    const card = dataOf<{ member: MemberCard; workspaceSlug: string }>(
      accept,
    ).member;
    return {
      cookies: member.cookies,
      userId: member.userId,
      memberId: card.id,
    };
  }

  async function createCycle(
    cookies: string,
    body: Record<string, unknown>,
  ): Promise<{
    status: number;
    res: { status: number; body: unknown };
    detail: CycleDetail;
  }> {
    const res = await request
      .post(cyclesUrl(ws.slug))
      .set('Cookie', cookies)
      .send(body);
    return { status: res.status, res, detail: dataOf<CycleDetail>(res) };
  }

  // ── Create (#3) ────────────────────────────────────────────────────────

  it('creates a cycle landing PLANNED with empty progress', async () => {
    const { status, detail } = await createCycle(owner.cookies, {
      name: 'Sprint 13',
      goal: 'Checkout flow',
      ...RANGE_A,
    });
    expect(status).toBe(201);
    expect(detail.name).toBe('Sprint 13');
    expect(detail.goal).toBe('Checkout flow');
    expect(detail.status).toBe('PLANNED');
    expect(detail.startDate).toBe('2027-01-01');
    expect(detail.endDate).toBe('2027-01-14');
    expect(detail.archivedAt).toBeNull();
    expect(detail.progress).toEqual({ total: 0, completed: 0, percent: null });

    const dbRow = await prisma.cycle.findUnique({ where: { id: detail.id } });
    expect(dbRow?.workspaceId).toBeTruthy();
    expect(dbRow?.status).toBe('PLANNED');
  });

  it('trims the name and rejects an empty one (400)', async () => {
    const trimmed = await createCycle(owner.cookies, {
      name: '   Padded   ',
      ...RANGE_A,
    });
    expect(trimmed.status).toBe(201);
    expect(trimmed.detail.name).toBe('Padded');

    const empty = await createCycle(owner.cookies, {
      name: '   ',
      ...RANGE_A,
    });
    expect(empty.status).toBe(400);
    expect(errorCodeOf(empty.res)).toBe('VALIDATION_ERROR');
  });

  it('validates create body — dates required, endDate >= startDate (400)', async () => {
    const cases: Record<string, unknown>[] = [
      { name: 'NoDates' },
      { name: 'X', startDate: '2027-01-01' },
      { name: 'X', startDate: 'not-a-date', endDate: '2027-01-02' },
      { name: 'X', startDate: '2027-02-01', endDate: '2027-01-01' },
      { name: 'x'.repeat(121), ...RANGE_A },
      { name: 'X', goal: 'x'.repeat(10001), ...RANGE_A },
    ];
    for (const body of cases) {
      const res = await createCycle(owner.cookies, body);
      expect(res.status).toBe(400);
      expect(errorCodeOf(res.res)).toBe('VALIDATION_ERROR');
    }
    // Same-day range is a valid one-day iteration.
    const oneDay = await createCycle(owner.cookies, {
      name: 'OneDay',
      startDate: '2027-03-01',
      endDate: '2027-03-01',
    });
    expect(oneDay.status).toBe(201);
  });

  it('member cannot create (403 FORBIDDEN_ROLE); admin can', async () => {
    const member = await addMember(uniqueEmail('member'));
    const forbidden = await createCycle(member.cookies, {
      name: 'Blocked',
      ...RANGE_A,
    });
    expect(forbidden.status).toBe(403);
    expect(errorCodeOf(forbidden.res)).toBe('FORBIDDEN_ROLE');

    const admin = await addMember(uniqueEmail('admin'), 'ADMIN');
    const ok = await createCycle(admin.cookies, { name: 'Admin', ...RANGE_B });
    expect(ok.status).toBe(201);
  });

  // ── Detail (#2) ────────────────────────────────────────────────────────

  it('gets cycle detail incl. goal and progress', async () => {
    const created = await createCycle(owner.cookies, {
      name: 'Detailed',
      goal: 'Has a goal',
      ...RANGE_A,
    });
    const res = await request
      .get(cycleUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(200);
    const detail = dataOf<CycleDetail>(res);
    expect(detail.goal).toBe('Has a goal');
    expect(detail.progress).toEqual({ total: 0, completed: 0, percent: null });
  });

  it('unknown cycle id is 404 CYCLE_NOT_FOUND; cross-workspace is scoped', async () => {
    // ws.id is a real cuid but not a cycle — passes validation, misses scope.
    const res = await request
      .get(cycleUrl(ws.slug, ws.id))
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(404);
    expect(errorCodeOf(res)).toBe('CYCLE_NOT_FOUND');

    const created = await createCycle(owner.cookies, {
      name: 'Secret',
      ...RANGE_A,
    });
    const foreign = await (async () => {
      const user = await registerVerifiedUser(
        createTestApp(),
        uniqueEmail('foreign'),
      );
      const wres = await createTestApp()
        .post('/api/v1/workspaces')
        .set('Cookie', user.cookies)
        .send({ name: 'Foreign Workspace' });
      return { slug: dataOf<WsResp>(wres).slug, cookies: user.cookies };
    })();
    const cross = await createTestApp()
      .get(cycleUrl(foreign.slug, created.detail.id))
      .set('Cookie', foreign.cookies);
    expect(cross.status).toBe(404);
    expect(errorCodeOf(cross)).toBe('CYCLE_NOT_FOUND');
  });

  // ── Update (#4) ────────────────────────────────────────────────────────

  it('edits name/goal/dates and clears goal with explicit null', async () => {
    const created = await createCycle(owner.cookies, {
      name: 'Before',
      goal: 'temp',
      ...RANGE_A,
    });
    const res = await request
      .patch(cycleUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ name: 'After', goal: null, endDate: '2027-01-20' });
    expect(res.status).toBe(200);
    const detail = dataOf<CycleDetail>(res);
    expect(detail.name).toBe('After');
    expect(detail.goal).toBeNull();
    expect(detail.endDate).toBe('2027-01-20');
    expect(detail.status).toBe('PLANNED');
  });

  it('rejects an empty patch and an inverted range (400)', async () => {
    const created = await createCycle(owner.cookies, {
      name: 'Patchable',
      ...RANGE_A,
    });
    const empty = await request
      .patch(cycleUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({});
    expect(empty.status).toBe(400);
    expect(errorCodeOf(empty)).toBe('VALIDATION_ERROR');

    const inverted = await request
      .patch(cycleUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ startDate: '2027-05-01' });
    expect(inverted.status).toBe(400);
    expect(errorCodeOf(inverted)).toBe('VALIDATION_ERROR');
  });

  it('update on COMPLETED is 409 CYCLE_READ_ONLY; member cannot update (403)', async () => {
    const created = await createCycle(owner.cookies, {
      name: 'Flow',
      ...RANGE_A,
    });
    await request
      .post(`${cycleUrl(ws.slug, created.detail.id)}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    await request
      .post(`${cycleUrl(ws.slug, created.detail.id)}/complete`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const res = await request
      .patch(cycleUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ name: 'Try' });
    expect(res.status).toBe(409);
    expect(errorCodeOf(res)).toBe('CYCLE_READ_ONLY');

    const member = await addMember(uniqueEmail('editor'));
    const other = await createCycle(owner.cookies, {
      name: 'Other',
      ...RANGE_B,
    });
    const forbidden = await createTestApp()
      .patch(cycleUrl(ws.slug, other.detail.id))
      .set('Cookie', member.cookies)
      .send({ name: 'Nope' });
    expect(forbidden.status).toBe(403);
  });

  // ── Start / complete / reopen (#5–#7) ──────────────────────────────────

  it('runs the full PLANNED → ACTIVE → COMPLETED → ACTIVE journey, issues untouched', async () => {
    const created = await createCycle(owner.cookies, {
      name: 'Journey',
      ...RANGE_A,
    });
    const issueRes = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues`)
      .set('Cookie', owner.cookies)
      .send({ title: 'Cycle work' });
    const issueId = dataOf<{ id: string }>(issueRes).id;
    await request
      .patch(`/api/v1/workspaces/${ws.slug}/issues/${issueId}`)
      .set('Cookie', owner.cookies)
      .send({ cycleId: created.detail.id });

    const start = await request
      .post(`${cycleUrl(ws.slug, created.detail.id)}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(start.status).toBe(200);
    expect(dataOf<CycleDetail>(start).status).toBe('ACTIVE');

    const complete = await request
      .post(`${cycleUrl(ws.slug, created.detail.id)}/complete`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(complete.status).toBe(200);
    expect(dataOf<CycleDetail>(complete).status).toBe('COMPLETED');

    // Rule 9: completing changes no issue — open stays open, still assigned.
    const issue = await prisma.issue.findUnique({ where: { id: issueId } });
    expect(issue?.status).toBe('BACKLOG');
    expect(issue?.cycleId).toBe(created.detail.id);

    const reopen = await request
      .post(`${cycleUrl(ws.slug, created.detail.id)}/reopen`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(reopen.status).toBe(200);
    expect(dataOf<CycleDetail>(reopen).status).toBe('ACTIVE');
  });

  it('wrong-status transitions are 409 INVALID_CYCLE_TRANSITION', async () => {
    const planned = await createCycle(owner.cookies, {
      name: 'Planned',
      ...RANGE_A,
    });
    const completePlanned = await request
      .post(`${cycleUrl(ws.slug, planned.detail.id)}/complete`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(completePlanned.status).toBe(409);
    expect(errorCodeOf(completePlanned)).toBe('INVALID_CYCLE_TRANSITION');

    const reopenPlanned = await request
      .post(`${cycleUrl(ws.slug, planned.detail.id)}/reopen`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(reopenPlanned.status).toBe(409);

    await request
      .post(`${cycleUrl(ws.slug, planned.detail.id)}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const doubleStart = await request
      .post(`${cycleUrl(ws.slug, planned.detail.id)}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(doubleStart.status).toBe(409);
    expect(errorCodeOf(doubleStart)).toBe('INVALID_CYCLE_TRANSITION');
  });

  it('lifecycle without confirm is 400; member cannot lifecycle (403)', async () => {
    const created = await createCycle(owner.cookies, {
      name: 'Confirm',
      ...RANGE_A,
    });
    const noConfirm = await request
      .post(`${cycleUrl(ws.slug, created.detail.id)}/start`)
      .set('Cookie', owner.cookies)
      .send({});
    expect(noConfirm.status).toBe(400);
    expect(errorCodeOf(noConfirm)).toBe('VALIDATION_ERROR');

    const member = await addMember(uniqueEmail('lifer'));
    const forbidden = await createTestApp()
      .post(`${cycleUrl(ws.slug, created.detail.id)}/start`)
      .set('Cookie', member.cookies)
      .send({ confirm: true });
    expect(forbidden.status).toBe(403);
    expect(errorCodeOf(forbidden)).toBe('FORBIDDEN_ROLE');
  });

  // ── Archive / restore (#8 / #9) ───────────────────────────────────────

  it('archive → restore round-trips and preserves status', async () => {
    const created = await createCycle(owner.cookies, {
      name: 'RoundTrip',
      ...RANGE_A,
    });
    const archive = await request
      .post(`${cycleUrl(ws.slug, created.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(archive.status).toBe(200);
    const archived = dataOf<CycleDetail>(archive);
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.status).toBe('PLANNED');

    const restore = await request
      .post(`${cycleUrl(ws.slug, created.detail.id)}/restore`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(restore.status).toBe(200);
    const restored = dataOf<CycleDetail>(restore);
    expect(restored.archivedAt).toBeNull();
    expect(restored.status).toBe('PLANNED');
  });

  it('archive ACTIVE is 409 COMPLETE_FIRST; double-archive/restore-live codes', async () => {
    const active = await createCycle(owner.cookies, {
      name: 'Live',
      ...RANGE_A,
    });
    await request
      .post(`${cycleUrl(ws.slug, active.detail.id)}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const blocked = await request
      .post(`${cycleUrl(ws.slug, active.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(blocked.status).toBe(409);
    expect(errorCodeOf(blocked)).toBe('COMPLETE_FIRST');

    // Complete first, then archive succeeds.
    await request
      .post(`${cycleUrl(ws.slug, active.detail.id)}/complete`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const archived = await request
      .post(`${cycleUrl(ws.slug, active.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(archived.status).toBe(200);
    expect(dataOf<CycleDetail>(archived).status).toBe('COMPLETED');

    const double = await request
      .post(`${cycleUrl(ws.slug, active.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(double.status).toBe(409);
    expect(errorCodeOf(double)).toBe('ALREADY_ARCHIVED');

    const live = await createCycle(owner.cookies, {
      name: 'Live2',
      ...RANGE_B,
    });
    const notArchived = await request
      .post(`${cycleUrl(ws.slug, live.detail.id)}/restore`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(notArchived.status).toBe(409);
    expect(errorCodeOf(notArchived)).toBe('NOT_ARCHIVED');
  });

  it('update on an archived cycle is 409 CYCLE_ARCHIVED', async () => {
    const created = await createCycle(owner.cookies, {
      name: 'Frozen',
      ...RANGE_A,
    });
    await request
      .post(`${cycleUrl(ws.slug, created.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const res = await request
      .patch(cycleUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ name: 'Try' });
    expect(res.status).toBe(409);
    expect(errorCodeOf(res)).toBe('CYCLE_ARCHIVED');
  });

  // ── Delete (#10) ───────────────────────────────────────────────────────

  it('deletes a future PLANNED cycle — issues survive unassigned with history', async () => {
    const created = await createCycle(owner.cookies, {
      name: 'Doomed',
      ...RANGE_A,
    });
    const issueRes = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues`)
      .set('Cookie', owner.cookies)
      .send({ title: 'Cycle task' });
    const issueId = dataOf<{ id: string }>(issueRes).id;
    await request
      .patch(`/api/v1/workspaces/${ws.slug}/issues/${issueId}`)
      .set('Cookie', owner.cookies)
      .send({ cycleId: created.detail.id });

    const res = await request
      .delete(cycleUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(res.status).toBe(200);
    const payload = dataOf<{
      deletedCycleId: string;
      unassignedIssues: number;
    }>(res);
    expect(payload.deletedCycleId).toBe(created.detail.id);
    expect(payload.unassignedIssues).toBe(1);

    expect(
      await prisma.cycle.findUnique({ where: { id: created.detail.id } }),
    ).toBeNull();
    const issue = await prisma.issue.findUnique({ where: { id: issueId } });
    expect(issue?.cycleId).toBeNull();
    const history = await prisma.issueHistory.findMany({
      where: { issueId },
      select: { event: true, oldValue: true, newValue: true },
    });
    const changed = history.filter((h) => h.event === 'CYCLE_CHANGED');
    expect(changed.length).toBeGreaterThanOrEqual(2);
    expect(changed.at(-1)).toMatchObject({
      oldValue: created.detail.id,
      newValue: null,
    });

    // Name released for reuse.
    const reuse = await createCycle(owner.cookies, {
      name: 'doomed',
      ...RANGE_A,
    });
    expect(reuse.status).toBe(201);
  });

  it('delete rejects Active/Completed/started-PLANNED (409 CYCLE_NOT_DELETABLE)', async () => {
    const active = await createCycle(owner.cookies, {
      name: 'Act',
      ...RANGE_A,
    });
    await request
      .post(`${cycleUrl(ws.slug, active.detail.id)}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const delActive = await request
      .delete(cycleUrl(ws.slug, active.detail.id))
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(delActive.status).toBe(409);
    expect(errorCodeOf(delActive)).toBe('CYCLE_NOT_DELETABLE');

    // Started PLANNED (past start) is not "future".
    const started = await createCycle(owner.cookies, {
      name: 'Started',
      startDate: '2020-01-01',
      endDate: '2020-01-14',
    });
    // 2020 range overlaps nothing else, so creation succeeds; delete must fail.
    expect(started.status).toBe(201);
    const delStarted = await request
      .delete(cycleUrl(ws.slug, started.detail.id))
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(delStarted.status).toBe(409);
    expect(errorCodeOf(delStarted)).toBe('CYCLE_NOT_DELETABLE');

    // Completed is not deletable either.
    await request
      .post(`${cycleUrl(ws.slug, active.detail.id)}/complete`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const delCompleted = await request
      .delete(cycleUrl(ws.slug, active.detail.id))
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(delCompleted.status).toBe(409);
  });

  it('delete without confirm is 400; member cannot delete (403)', async () => {
    const created = await createCycle(owner.cookies, {
      name: 'Gated',
      ...RANGE_A,
    });
    const noConfirm = await request
      .delete(cycleUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({});
    expect(noConfirm.status).toBe(400);

    const member = await addMember(uniqueEmail('deleter'));
    const forbidden = await createTestApp()
      .delete(cycleUrl(ws.slug, created.detail.id))
      .set('Cookie', member.cookies)
      .send({ confirm: true });
    expect(forbidden.status).toBe(403);
  });

  // ── Guard / envelope ───────────────────────────────────────────────────

  it('rejects unauthenticated access to every cycle route (401)', async () => {
    const anon = createTestApp();
    const bogus = crypto.randomUUID();
    const res = await Promise.all([
      anon.get(cyclesUrl(ws.slug)),
      anon.get(cycleUrl(ws.slug, bogus)),
      anon.post(cyclesUrl(ws.slug)).send({ name: 'X' }),
      anon.patch(cycleUrl(ws.slug, bogus)).send({}),
      anon.post(`${cycleUrl(ws.slug, bogus)}/start`).send({ confirm: true }),
      anon.post(`${cycleUrl(ws.slug, bogus)}/complete`).send({ confirm: true }),
      anon.post(`${cycleUrl(ws.slug, bogus)}/reopen`).send({ confirm: true }),
      anon.post(`${cycleUrl(ws.slug, bogus)}/archive`).send({ confirm: true }),
      anon.post(`${cycleUrl(ws.slug, bogus)}/restore`).send({ confirm: true }),
      anon.delete(cycleUrl(ws.slug, bogus)).send({ confirm: true }),
    ]);
    for (const r of res) {
      expect(r.status).toBe(401);
      expect(errorResponseSchema.parse(r.body).error.code).toBe('UNAUTHORIZED');
    }
  });

  it('does not leak existence: non-member and unknown slug are identical 404', async () => {
    const outsider = await registerVerifiedUser(
      createTestApp(),
      uniqueEmail('outsider'),
    );
    const nonMemberRes = await createTestApp()
      .get(cyclesUrl(ws.slug))
      .set('Cookie', outsider.cookies);
    const unknownRes = await createTestApp()
      .get('/api/v1/workspaces/does-not-exist/cycles')
      .set('Cookie', outsider.cookies);

    expect(nonMemberRes.status).toBe(404);
    expect(unknownRes.status).toBe(404);
    const code = (r: { body: unknown }) =>
      bodyOf<{ error: { code: string; message: string } }>(r).error;
    expect(code(nonMemberRes).code).toBe('WORKSPACE_NOT_FOUND');
    expect(code(nonMemberRes).message).toBe(code(unknownRes).message);
  });

  it('member can read list and detail (any-role reads)', async () => {
    const member = await addMember(uniqueEmail('reader'));
    const created = await createCycle(owner.cookies, {
      name: 'ReadMe',
      ...RANGE_A,
    });
    const listed = await createTestApp()
      .get(cyclesUrl(ws.slug))
      .set('Cookie', member.cookies);
    expect(listed.status).toBe(200);
    expect(
      dataOf<{ cycles: CycleDetail[] }>(listed).cycles.some(
        (c) => c.id === created.detail.id,
      ),
    ).toBe(true);
  });

  it('archived workspace: writes rejected (409), reads allowed (200)', async () => {
    await createCycle(owner.cookies, { name: 'Readable', ...RANGE_A });
    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const write = await request
      .post(cyclesUrl(ws.slug))
      .set('Cookie', owner.cookies)
      .send({ name: 'Nope', ...RANGE_B });
    expect(write.status).toBe(409);
    expect(errorCodeOf(write as unknown as { body: unknown })).toBe(
      'WORKSPACE_ARCHIVED',
    );

    const read = await request
      .get(cyclesUrl(ws.slug))
      .set('Cookie', owner.cookies);
    expect(read.status).toBe(200);
  });
});
