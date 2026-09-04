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

interface IssueDetail {
  id: string;
  title: string;
  status: string;
  cycleId: string | null;
  blocked: boolean;
  archivedAt: string | null;
}

interface IssueHistoryRow {
  event: string;
  oldValue: string | null;
  newValue: string | null;
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

function issuesUrl(slug: string): string {
  return `/api/v1/workspaces/${slug}/issues`;
}

describe('cycles issues-leg (integration)', () => {
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
    name: string,
    startDate = '2027-01-01',
    endDate = '2027-01-14',
  ): Promise<string> {
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/cycles`)
      .set('Cookie', owner.cookies)
      .send({ name, startDate, endDate });
    expect(res.status).toBe(201);
    return dataOf<{ id: string }>(res).id;
  }

  async function createIssue(title: string): Promise<string> {
    const res = await request
      .post(issuesUrl(ws.slug))
      .set('Cookie', owner.cookies)
      .send({ title });
    expect(res.status).toBe(201);
    return dataOf<{ id: string }>(res).id;
  }

  async function patchIssue(
    issueId: string,
    body: Record<string, unknown>,
    cookies: string = owner.cookies,
  ): Promise<{
    status: number;
    res: { status: number; body: unknown };
    detail: IssueDetail;
  }> {
    const res = await request
      .patch(`${issuesUrl(ws.slug)}/${issueId}`)
      .set('Cookie', cookies)
      .send(body);
    return { status: res.status, res, detail: dataOf<IssueDetail>(res) };
  }

  async function historyOf(issueId: string): Promise<IssueHistoryRow[]> {
    return prisma.issueHistory.findMany({
      where: { issueId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { event: true, oldValue: true, newValue: true },
    });
  }

  // ── Attach / detach via PATCH ──────────────────────────────────────────

  it('attaches, reassigns, detaches with CYCLE_CHANGED history', async () => {
    const first = await createCycle('Sprint 1');
    const second = await createCycle('Sprint 2', '2027-02-01', '2027-02-14');
    const issueId = await createIssue('Task');

    const attached = await patchIssue(issueId, { cycleId: first });
    expect(attached.status).toBe(200);
    expect(attached.detail.cycleId).toBe(first);

    const reassigned = await patchIssue(issueId, { cycleId: second });
    expect(reassigned.detail.cycleId).toBe(second);

    const detached = await patchIssue(issueId, { cycleId: null });
    expect(detached.detail.cycleId).toBeNull();

    const events = (await historyOf(issueId)).filter(
      (h) => h.event === 'CYCLE_CHANGED',
    );
    expect(
      events.map((h) => `${h.oldValue ?? '∅'}→${h.newValue ?? '∅'}`),
    ).toEqual([`∅→${first}`, `${first}→${second}`, `${second}→∅`]);
  });

  it('same-cycle set is a no-op (no write, no history)', async () => {
    const cycleId = await createCycle('Sprint');
    const issueId = await createIssue('Task');
    await patchIssue(issueId, { cycleId });

    const before = await historyOf(issueId);
    const noop = await patchIssue(issueId, { cycleId });
    expect(noop.status).toBe(200);
    expect(noop.detail.cycleId).toBe(cycleId);
    expect(await historyOf(issueId)).toHaveLength(before.length);
  });

  it('member can attach (issues RBAC — any member, not cycles RBAC)', async () => {
    const member = await addMember(uniqueEmail('worker'));
    const cycleId = await createCycle('Sprint');
    const issueId = await createIssue('Task');
    const res = await patchIssue(issueId, { cycleId }, member.cookies);
    expect(res.status).toBe(200);
    expect(res.detail.cycleId).toBe(cycleId);
  });

  it('rejects cross-workspace cycles (404) and archived cycles (409)', async () => {
    const foreign = await (async () => {
      const user = await registerVerifiedUser(
        createTestApp(),
        uniqueEmail('foreign'),
      );
      const wres = await createTestApp()
        .post('/api/v1/workspaces')
        .set('Cookie', user.cookies)
        .send({ name: 'Foreign Workspace' });
      const slug = dataOf<WsResp>(wres).slug;
      const cres = await createTestApp()
        .post(`/api/v1/workspaces/${slug}/cycles`)
        .set('Cookie', user.cookies)
        .send({
          name: 'Foreign',
          startDate: '2027-01-01',
          endDate: '2027-01-14',
        });
      return dataOf<{ id: string }>(cres).id;
    })();

    const issueId = await createIssue('Task');
    const cross = await patchIssue(issueId, { cycleId: foreign });
    expect(cross.status).toBe(404);
    expect(errorCodeOf(cross.res)).toBe('CYCLE_NOT_IN_WORKSPACE');

    const archived = await createCycle('Old');
    await request
      .post(`/api/v1/workspaces/${ws.slug}/cycles/${archived}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const toArchived = await patchIssue(issueId, { cycleId: archived });
    expect(toArchived.status).toBe(409);
    expect(errorCodeOf(toArchived.res)).toBe('CYCLE_ARCHIVED');

    // Bogus cuid (valid shape, no cycle) is also 404 scoped.
    const bogus = await patchIssue(issueId, { cycleId: ws.id });
    expect(bogus.status).toBe(404);
    expect(errorCodeOf(bogus.res)).toBe('CYCLE_NOT_IN_WORKSPACE');
  });

  it('attach to an archived issue is 409 ISSUE_ARCHIVED (F5 matrix wins)', async () => {
    const cycleId = await createCycle('Sprint');
    const issueId = await createIssue('Task');
    await request
      .post(`${issuesUrl(ws.slug)}/${issueId}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const res = await patchIssue(issueId, { cycleId });
    expect(res.status).toBe(409);
    expect(errorCodeOf(res.res)).toBe('ISSUE_ARCHIVED');
  });

  it('COMPLETED cycles accept attach and detach (correction path)', async () => {
    const cycleId = await createCycle('Done Sprint');
    await request
      .post(`/api/v1/workspaces/${ws.slug}/cycles/${cycleId}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    await request
      .post(`/api/v1/workspaces/${ws.slug}/cycles/${cycleId}/complete`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const issueId = await createIssue('Late fix');
    const attached = await patchIssue(issueId, { cycleId });
    expect(attached.status).toBe(200);
    expect(attached.detail.cycleId).toBe(cycleId);

    const detached = await patchIssue(issueId, { cycleId: null });
    expect(detached.status).toBe(200);
    expect(detached.detail.cycleId).toBeNull();
  });

  // ── Filter + progress ──────────────────────────────────────────────────

  it('?cycleId= filters the issue list and composes with archived', async () => {
    const cycleId = await createCycle('Sprint');
    const otherId = await createCycle('Other', '2027-02-01', '2027-02-14');
    const inCycle = await createIssue('In cycle');
    await patchIssue(inCycle, { cycleId });
    await createIssue('Free');
    const archivedInCycle = await createIssue('Archived in cycle');
    await patchIssue(archivedInCycle, { cycleId: otherId });
    await request
      .post(`${issuesUrl(ws.slug)}/${archivedInCycle}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const filtered = await request
      .get(`${issuesUrl(ws.slug)}?cycleId=${cycleId}`)
      .set('Cookie', owner.cookies);
    expect(
      dataOf<{ issues: IssueDetail[] }>(filtered).issues.map((i) => i.id),
    ).toEqual([inCycle]);

    const archivedView = await request
      .get(`${issuesUrl(ws.slug)}?cycleId=${otherId}&archived=true`)
      .set('Cookie', owner.cookies);
    expect(
      dataOf<{ issues: IssueDetail[] }>(archivedView).issues.map((i) => i.id),
    ).toEqual([archivedInCycle]);
  });

  it('progress counts DONE/total, null when empty, blocked and archived excluded', async () => {
    const cycleId = await createCycle('Measured');

    // Empty cycle → zeros with null percent.
    const emptyDetail = await request
      .get(`/api/v1/workspaces/${ws.slug}/cycles/${cycleId}`)
      .set('Cookie', owner.cookies);
    expect(dataOf<{ progress: unknown }>(emptyDetail).progress).toEqual({
      total: 0,
      completed: 0,
      percent: null,
    });

    const done = await createIssue('Done');
    await patchIssue(done, { cycleId, status: 'DONE' });
    const open = await createIssue('Open');
    await patchIssue(open, { cycleId });
    const blockedOpen = await createIssue('Blocked open');
    await patchIssue(blockedOpen, { cycleId });
    await request
      .patch(`${issuesUrl(ws.slug)}/${blockedOpen}`)
      .set('Cookie', owner.cookies)
      .send({ blocked: true, blockedReason: 'stuck' });
    const archivedDone = await createIssue('Archived done');
    await patchIssue(archivedDone, { cycleId, status: 'DONE' });
    await request
      .post(`${issuesUrl(ws.slug)}/${archivedDone}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    // total = 3 (done + open + blocked-open); archived excluded.
    // completed = 1 — blocked-open is open, so blocked never inflates it.
    const detail = await request
      .get(`/api/v1/workspaces/${ws.slug}/cycles/${cycleId}`)
      .set('Cookie', owner.cookies);
    expect(dataOf<{ progress: unknown }>(detail).progress).toEqual({
      total: 3,
      completed: 1,
      percent: 33,
    });
  });
});
