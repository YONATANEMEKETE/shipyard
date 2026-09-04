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

interface IssueCard {
  id: string;
  assignee: { userId: string } | null;
  projectId: string | null;
  archivedAt: string | null;
}

describe('issues cross-module wiring (integration)', () => {
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

  async function createIssue(
    body: Record<string, unknown>,
    cookies: string = owner.cookies,
  ): Promise<IssueCard> {
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues`)
      .set('Cookie', cookies)
      .send(body);
    expect(res.status).toBe(201);
    return dataOf<IssueCard>(res);
  }

  async function createProject(name: string): Promise<{ id: string }> {
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/projects`)
      .set('Cookie', owner.cookies)
      .send({ name });
    expect(res.status).toBe(201);
    return dataOf<{ id: string }>(res);
  }

  async function historyEvents(
    issueId: string,
  ): Promise<
    { event: string; actorId: string | null; oldValue: string | null }[]
  > {
    const rows = await prisma.issueHistory.findMany({
      where: { issueId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { event: true, actorId: true, oldValue: true },
    });
    return rows;
  }

  // ── F3 ↔ F5: remove member unassigns (archived included) ───────────────

  it('remove member unassigns their issues incl. archived + UNASSIGNED rows by the remover', async () => {
    const departing = await addMember(uniqueEmail('leaving'));
    const staying = await addMember(uniqueEmail('staying'));

    const active = await createIssue({
      title: 'Active task',
      assigneeId: departing.userId,
    });
    const archived = await createIssue({
      title: 'Archived task',
      assigneeId: departing.userId,
    });
    await request
      .post(`/api/v1/workspaces/${ws.slug}/issues/${archived.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const others = await createIssue({
      title: 'Stays assigned',
      assigneeId: staying.userId,
    });

    const res = await request
      .post(
        `/api/v1/workspaces/${ws.slug}/members/${departing.memberId}/remove`,
      )
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(res.status).toBe(200);
    const payload = dataOf<{
      removedMemberId: string;
      transferredProjects: number;
      unassignedIssues: number;
    }>(res);
    expect(payload.removedMemberId).toBe(departing.memberId);
    expect(payload.unassignedIssues).toBe(2);

    for (const id of [active.id, archived.id]) {
      const row = await prisma.issue.findUnique({ where: { id } });
      expect(row?.assigneeId).toBeNull();
      // Archived state is untouched by the unassign.
      const events = await historyEvents(id);
      const unassigned = events.filter((h) => h.event === 'UNASSIGNED');
      expect(unassigned).toHaveLength(1);
      expect(unassigned[0]!.oldValue).toBe(departing.userId);
      expect(unassigned[0]!.actorId).toBe(owner.userId);
    }
    // Archived issue stays archived.
    expect(
      (await prisma.issue.findUnique({ where: { id: archived.id } }))
        ?.archivedAt,
    ).not.toBeNull();

    // Other members' assignments are untouched.
    expect(
      (await prisma.issue.findUnique({ where: { id: others.id } }))?.assigneeId,
    ).toBe(staying.userId);
  });

  it('remove with no assigned issues returns unassignedIssues 0', async () => {
    const departing = await addMember(uniqueEmail('clean'));
    const res = await request
      .post(
        `/api/v1/workspaces/${ws.slug}/members/${departing.memberId}/remove`,
      )
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(res.status).toBe(200);
    expect(dataOf<{ unassignedIssues: number }>(res).unassignedIssues).toBe(0);
  });

  it('member leaves — their issues are unassigned, actor is the leaver', async () => {
    const leaver = await addMember(uniqueEmail('quitter'));
    const task = await createIssue({
      title: 'My task',
      assigneeId: leaver.userId,
    });

    const res = await createTestApp()
      .post(`/api/v1/workspaces/${ws.slug}/leave`)
      .set('Cookie', leaver.cookies)
      .send({ confirm: true });
    expect(res.status).toBe(200);
    expect(dataOf<{ unassignedIssues: number }>(res).unassignedIssues).toBe(1);
    expect(
      (await prisma.issue.findUnique({ where: { id: task.id } }))?.assigneeId,
    ).toBeNull();

    const events = await historyEvents(task.id);
    const unassigned = events.filter((h) => h.event === 'UNASSIGNED');
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0]!.actorId).toBe(leaver.userId);
  });

  // ── F4 ↔ F5: project delete detaches issues + history ──────────────────

  it('project delete detaches its issues with PROJECT_CHANGED rows — issues survive', async () => {
    const project = await createProject('Doomed');
    const first = await createIssue({ title: 'One', projectId: project.id });
    const second = await createIssue({ title: 'Two', projectId: project.id });
    const free = await createIssue({ title: 'Free' });

    const res = await request
      .delete(`/api/v1/workspaces/${ws.slug}/projects/${project.id}`)
      .set('Cookie', owner.cookies)
      .send({ confirmName: 'Doomed' });
    expect(res.status).toBe(200);
    const payload = dataOf<{
      deletedProjectId: string;
      unassignedIssues: number;
    }>(res);
    expect(payload.deletedProjectId).toBe(project.id);
    expect(payload.unassignedIssues).toBe(2);

    for (const id of [first.id, second.id]) {
      const row = await prisma.issue.findUnique({ where: { id } });
      expect(row?.projectId).toBeNull();
      const events = await historyEvents(id);
      const changed = events.filter((h) => h.event === 'PROJECT_CHANGED');
      expect(changed).toHaveLength(1);
      expect(changed[0]!.oldValue).toBe(project.id);
      expect(changed[0]!.actorId).toBe(owner.userId);
    }
    // Unrelated issue untouched — no history written for it.
    expect(
      (await prisma.issue.findUnique({ where: { id: free.id } }))?.projectId,
    ).toBeNull();
    expect(
      (await historyEvents(free.id)).filter(
        (h) => h.event === 'PROJECT_CHANGED',
      ),
    ).toHaveLength(0);
  });

  it('deleting an archived project still detaches its issues', async () => {
    const project = await createProject('Old');
    const task = await createIssue({
      title: 'Attached',
      projectId: project.id,
    });
    await request
      .post(`/api/v1/workspaces/${ws.slug}/projects/${project.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const res = await request
      .delete(`/api/v1/workspaces/${ws.slug}/projects/${project.id}`)
      .set('Cookie', owner.cookies)
      .send({ confirmName: 'Old' });
    expect(res.status).toBe(200);
    expect(dataOf<{ unassignedIssues: number }>(res).unassignedIssues).toBe(1);
    expect(
      (await prisma.issue.findUnique({ where: { id: task.id } }))?.projectId,
    ).toBeNull();
  });

  it('project delete with no issues returns unassignedIssues 0', async () => {
    const project = await createProject('Empty');
    const res = await request
      .delete(`/api/v1/workspaces/${ws.slug}/projects/${project.id}`)
      .set('Cookie', owner.cookies)
      .send({ confirmName: 'Empty' });
    expect(res.status).toBe(200);
    expect(dataOf<{ unassignedIssues: number }>(res).unassignedIssues).toBe(0);
  });
});
