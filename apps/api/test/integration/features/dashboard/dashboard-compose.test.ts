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

interface IssueCard {
  id: string;
  identifier: string;
  title: string;
  status: string;
  blocked: boolean;
  blockedReason: string | null;
  dueDate: string | null;
  archivedAt: string | null;
  viewedAt?: string;
}

interface Progress {
  total: number;
  completed: number;
  percent: number | null;
}

interface CycleCard {
  id: string;
  name: string;
  status: string;
  progress: Progress;
}

interface ProjectCard {
  id: string;
  name: string;
  status: string;
  progress: Progress;
}

interface ActivityItem {
  kind: string;
  actor: { userId: string; name: string } | null;
  issue: { id: string; identifier: string; title: string };
  workspaceId: string;
  commentId: string | null;
  text: string;
  createdAt: string;
}

interface DashboardPayload {
  workspaceId: string;
  myWork: {
    assigned: IssueCard[];
    created: IssueCard[];
    recentlyViewed: IssueCard[];
  };
  currentCycle: CycleCard | null;
  activeProjects: ProjectCard[];
  recentActivity: ActivityItem[];
}

interface MemberCard {
  id: string;
  userId: string;
  role: string;
}

interface InvitationCard {
  token: string;
}

const DASH = (slug: string) => `/api/v1/workspaces/${slug}/dashboard`;

describe('dashboard compose (integration)', () => {
  const uniqueEmail = (prefix: string) =>
    `${prefix}-${crypto.randomUUID()}@example.com`;

  let request: Request;
  let owner: { cookies: string; userId: string; email: string };
  let member: { cookies: string; userId: string; memberId: string };
  let ws: WsResp;

  beforeEach(async () => {
    await resetDatabase();
    request = createTestApp();
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue({ status: 'logged' });

    const email = uniqueEmail('owner');
    owner = { ...(await registerVerifiedUser(request, email)), email };

    const wres = await request
      .post('/api/v1/workspaces')
      .set('Cookie', owner.cookies)
      .send({ name: 'Shipyard Team', icon: 'rocket' });
    expect(wres.status).toBe(201);
    ws = dataOf<WsResp>(wres);
    member = await addMember(uniqueEmail('member'));
  });

  /** Registers a verified user and adds them to the workspace as MEMBER. */
  async function addMember(
    email: string,
  ): Promise<{ cookies: string; userId: string; memberId: string }> {
    const user = await registerVerifiedUser(createTestApp(), email);
    const inv = await request
      .post(`/api/v1/workspaces/${ws.slug}/invitations`)
      .set('Cookie', owner.cookies)
      .send({ emails: [email], role: 'MEMBER' });
    const token = dataOf<{ invitations: InvitationCard[] }>(inv).invitations[0]!
      .token;
    const accept = await createTestApp()
      .post(`/api/v1/invitations/${token}/accept`)
      .set('Cookie', user.cookies)
      .send({});
    const card = dataOf<{ member: MemberCard }>(accept).member;
    return { cookies: user.cookies, userId: user.userId, memberId: card.id };
  }

  async function createIssue(
    cookies: string,
    input: Record<string, unknown>,
  ): Promise<{ id: string; identifier: string; title: string }> {
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues`)
      .set('Cookie', cookies)
      .send(input);
    expect(res.status).toBe(201);
    return dataOf(res);
  }

  async function patchIssue(
    cookies: string,
    issueId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    const res = await request
      .patch(`/api/v1/workspaces/${ws.slug}/issues/${issueId}`)
      .set('Cookie', cookies)
      .send(input);
    expect(res.status).toBe(200);
  }

  async function getDashboard(cookies: string): Promise<{
    status: number;
    body: DashboardPayload;
  }> {
    const res = await request.get(DASH(ws.slug)).set('Cookie', cookies);
    return { status: res.status, body: dataOf<DashboardPayload>(res) };
  }

  async function startCycle(name: string): Promise<string> {
    const created = await request
      .post(`/api/v1/workspaces/${ws.slug}/cycles`)
      .set('Cookie', owner.cookies)
      .send({
        name,
        startDate: '2030-01-01',
        endDate: '2030-01-14',
      });
    expect(created.status).toBe(201);
    const cycleId = dataOf<{ id: string }>(created).id;
    const start = await request
      .post(`/api/v1/workspaces/${ws.slug}/cycles/${cycleId}/start`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(start.status).toBe(200);
    return cycleId;
  }

  async function createProject(name: string): Promise<string> {
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/projects`)
      .set('Cookie', owner.cookies)
      .send({ name });
    expect(res.status).toBe(201);
    return dataOf<{ id: string }>(res).id;
  }

  // ── Happy path — four panels composed in one 200 ────────────────────────

  it('composes all four panels in one request', async () => {
    // My Work: one assigned + one created by the member.
    const assigned = await createIssue(owner.cookies, {
      title: 'Assigned work',
      assigneeId: member.userId,
    });
    await createIssue(member.cookies, { title: 'Created work' });

    // Current cycle: active cycle with completed progress.
    const cycleId = await startCycle('Sprint 13');
    const cycleIssue = await createIssue(member.cookies, {
      title: 'Cycle issue',
    });
    await patchIssue(owner.cookies, cycleIssue.id, { cycleId });
    await patchIssue(owner.cookies, cycleIssue.id, { status: 'DONE' });

    // Active project with progress.
    const projectId = await createProject('Ship Payroll');
    const projectIssue = await createIssue(member.cookies, {
      title: 'Project issue',
    });
    await patchIssue(owner.cookies, projectIssue.id, { projectId });
    await patchIssue(owner.cookies, projectIssue.id, { status: 'DONE' });

    // Feed sources: one issue event + one comment.
    await createIssue(owner.cookies, { title: 'Feed issue' });

    const { status, body } = await getDashboard(member.cookies);
    expect(status).toBe(200);

    expect(body.workspaceId).toBe(ws.id);
    expect(body.myWork.assigned.map((card) => card.id)).toEqual([assigned.id]);
    expect(body.myWork.created.map((card) => card.title)).toContain(
      'Created work',
    );
    expect(body.myWork.recentlyViewed).toEqual([]);

    expect(body.currentCycle).not.toBeNull();
    expect(body.currentCycle!.status).toBe('ACTIVE');
    expect(body.currentCycle!.progress).toEqual({
      total: 1,
      completed: 1,
      percent: 100,
    });

    expect(body.activeProjects).toHaveLength(1);
    expect(body.activeProjects[0]!.id).toBe(projectId);
    expect(body.activeProjects[0]!.progress).toEqual({
      total: 1,
      completed: 1,
      percent: 100,
    });

    expect(body.recentActivity.length).toBeGreaterThanOrEqual(1);
    for (const item of body.recentActivity) {
      expect(item.workspaceId).toBe(ws.id);
      expect(item.issue.identifier).toMatch(/^SHIP-\d+$/);
      expect(typeof item.text).toBe('string');
    }
  });

  it('empty workspace: all panels empty/null with 200 — never 404', async () => {
    const { status, body } = await getDashboard(member.cookies);
    expect(status).toBe(200);
    expect(body).toEqual({
      workspaceId: ws.id,
      myWork: { assigned: [], created: [], recentlyViewed: [] },
      currentCycle: null,
      activeProjects: [],
      recentActivity: [],
    });
  });

  // ── Guards ──────────────────────────────────────────────────────────────

  it('unauthenticated → 401 UNAUTHENTICATED', async () => {
    const res = await request.get(DASH(ws.slug));
    expect(res.status).toBe(401);
    expect(errorCodeOf(res)).toBe('UNAUTHORIZED');
  });

  it('non-member with a real slug is byte-equal to unknown slug (no leak)', async () => {
    const outsider = await registerVerifiedUser(
      createTestApp(),
      uniqueEmail('outsider'),
    );

    const realSlug = await request
      .get(DASH(ws.slug))
      .set('Cookie', outsider.cookies);
    const unknownSlug = await request
      .get(DASH('no-such-workspace'))
      .set('Cookie', outsider.cookies);

    expect(realSlug.status).toBe(404);
    expect(unknownSlug.status).toBe(404);
    // Deliberately identical envelope (no existence leak) — same code, same
    // message; only the per-request id differs.
    const errorOf = (res: { body: unknown }) =>
      bodyOf<{ error: { code: string; message: string } }>(res).error;
    expect(errorOf(realSlug).code).toBe('WORKSPACE_NOT_FOUND');
    expect(errorOf(realSlug).code).toBe(errorOf(unknownSlug).code);
    expect(errorOf(realSlug).message).toBe(errorOf(unknownSlug).message);
    errorResponseSchema.parse(realSlug.body);
  });

  it('role-irrelevant: member sees the same shared panels as owner', async () => {
    const cycleId = await startCycle('Shared sprint');
    await createProject('Shared project');
    await createIssue(owner.cookies, { title: 'Shared feed event' });

    const ownerView = await getDashboard(owner.cookies);
    const memberView = await getDashboard(member.cookies);

    expect(ownerView.status).toBe(200);
    expect(memberView.status).toBe(200);
    expect(memberView.body.currentCycle!.id).toBe(cycleId);
    expect(memberView.body.activeProjects.map((card) => card.id)).toEqual(
      ownerView.body.activeProjects.map((card) => card.id),
    );
    // Personal panels differ by user, not role.
    expect(ownerView.body.myWork.created.length).toBe(1); // the feed event
    expect(memberView.body.myWork.created).toEqual([]);
  });

  // ── Archived workspace — frozen but browsable ───────────────────────────

  it('archived workspace: 200 with all panels; trail still records', async () => {
    const issue = await createIssue(owner.cookies, {
      title: 'Frozen work',
      assigneeId: member.userId,
    });

    const archived = await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(archived.status).toBe(200);

    // Detail read still 200 on the archived workspace and still records.
    const detail = await request
      .get(`/api/v1/workspaces/${ws.slug}/issues/${issue.id}`)
      .set('Cookie', member.cookies);
    expect(detail.status).toBe(200);

    const { status, body } = await getDashboard(member.cookies);
    expect(status).toBe(200);
    expect(body.myWork.assigned.map((card) => card.id)).toEqual([issue.id]);
    expect(body.myWork.recentlyViewed.map((card) => card.id)).toEqual([
      issue.id,
    ]);
  });

  // ── Cross-workspace isolation ───────────────────────────────────────────

  it('cross-workspace isolation: other workspace rows never appear', async () => {
    await createIssue(owner.cookies, { title: 'WS1 issue' });

    const wres = await request
      .post('/api/v1/workspaces')
      .set('Cookie', owner.cookies)
      .send({ name: 'Second Team' });
    const ws2 = dataOf<WsResp>(wres);
    await request
      .post(`/api/v1/workspaces/${ws2.slug}/issues`)
      .set('Cookie', owner.cookies)
      .send({ title: 'WS2 issue' });

    const ws1Dash = await getDashboard(member.cookies);
    expect(ws1Dash.status).toBe(200);
    expect(ws1Dash.body.workspaceId).toBe(ws.id);
    const ws1Issues = [
      ...ws1Dash.body.myWork.created,
      ...ws1Dash.body.recentActivity.map((item) => item.issue.title),
    ];
    expect(ws1Issues).not.toContain('WS2 issue');
    expect(ws1Issues).toContain('WS1 issue');

    // The owner's second-workspace dashboard is scoped to ws2 only.
    const ws2Dash = await request
      .get(DASH(ws2.slug))
      .set('Cookie', owner.cookies);
    const ws2Body = dataOf<DashboardPayload>(ws2Dash);
    expect(ws2Body.workspaceId).toBe(ws2.id);
    expect(ws2Body.myWork.created.map((card) => card.title)).toEqual([
      'WS2 issue',
    ]);
    expect(
      ws2Body.recentActivity.map((item) => item.issue.title),
    ).not.toContain('WS1 issue');
  });
});
