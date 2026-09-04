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

interface UserCard {
  userId: string;
  name: string;
  email: string;
  image: string | null;
}

interface LabelCard {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
}

interface IssueDetail {
  id: string;
  workspaceId: string;
  seqNumber: number;
  identifier: string;
  title: string;
  status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'DONE';
  priority: 'NO_PRIORITY' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  assignee: UserCard | null;
  projectId: string | null;
  dueDate: string | null;
  blocked: boolean;
  blockedReason: string | null;
  labels: LabelCard[];
  archivedAt: string | null;
  description: string | null;
  creator: UserCard;
  createdAt: string;
  updatedAt: string;
}

interface HistoryItem {
  id: string;
  event: string;
  actor: UserCard | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
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

interface ProjectCard {
  id: string;
  workspaceId: string;
  name: string;
}

function issuesUrl(slug: string): string {
  return `/api/v1/workspaces/${slug}/issues`;
}
function issueUrl(slug: string, id: string): string {
  return `/api/v1/workspaces/${slug}/issues/${id}`;
}

describe('issues lifecycle (integration)', () => {
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

  /** Creates a verified user + separate workspace (for cross-workspace tests). */
  async function createForeignWorkspace(): Promise<{
    slug: string;
    cookies: string;
    userId: string;
  }> {
    const foreign = await registerVerifiedUser(
      createTestApp(),
      uniqueEmail('foreign'),
    );
    const res = await createTestApp()
      .post('/api/v1/workspaces')
      .set('Cookie', foreign.cookies)
      .send({ name: 'Foreign Workspace' });
    return {
      slug: dataOf<WsResp>(res).slug,
      cookies: foreign.cookies,
      userId: foreign.userId,
    };
  }

  async function createIssue(
    cookies: string,
    body: Record<string, unknown>,
  ): Promise<{
    status: number;
    res: { status: number; body: unknown };
    detail: IssueDetail;
  }> {
    const res = await request
      .post(issuesUrl(ws.slug))
      .set('Cookie', cookies)
      .send(body);
    return { status: res.status, res, detail: dataOf<IssueDetail>(res) };
  }

  async function createProject(
    cookies: string,
    name: string,
  ): Promise<ProjectCard> {
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/projects`)
      .set('Cookie', cookies)
      .send({ name });
    expect(res.status).toBe(201);
    return dataOf<ProjectCard>(res);
  }

  async function historyOf(
    cookies: string,
    issueId: string,
  ): Promise<HistoryItem[]> {
    const res = await request
      .get(`${issueUrl(ws.slug, issueId)}/history`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    return dataOf<{ history: HistoryItem[]; nextCursor: string | null }>(res)
      .history;
  }

  // ── Create (#3) ────────────────────────────────────────────────────────

  it('creates an issue with defaults — BACKLOG / NO_PRIORITY / unblocked / SHIP-1', async () => {
    const { status, detail } = await createIssue(owner.cookies, {
      title: 'Fix login redirect',
    });
    expect(status).toBe(201);
    expect(detail.title).toBe('Fix login redirect');
    expect(detail.status).toBe('BACKLOG');
    expect(detail.priority).toBe('NO_PRIORITY');
    expect(detail.blocked).toBe(false);
    expect(detail.blockedReason).toBeNull();
    expect(detail.seqNumber).toBe(1);
    expect(detail.identifier).toBe('SHIP-1');
    expect(detail.assignee).toBeNull();
    expect(detail.projectId).toBeNull();
    expect(detail.dueDate).toBeNull();
    expect(detail.labels).toEqual([]);
    expect(detail.archivedAt).toBeNull();
    expect(detail.description).toBeNull();
    expect(detail.creator.userId).toBe(owner.userId);

    const dbRow = await prisma.issue.findUnique({ where: { id: detail.id } });
    expect(dbRow?.seqNumber).toBe(1);
    expect(dbRow?.creatorId).toBe(owner.userId);
  });

  it('creates with every optional field incl. create-into-column status', async () => {
    const member = await addMember(uniqueEmail('assignee'));
    const project = await createProject(owner.cookies, 'Website');
    const { status, detail } = await createIssue(owner.cookies, {
      title: 'Ship it',
      description: 'Full spec',
      priority: 'HIGH',
      status: 'TODO',
      assigneeId: member.userId,
      projectId: project.id,
      dueDate: '2026-12-01',
    });
    expect(status).toBe(201);
    expect(detail.status).toBe('TODO');
    expect(detail.priority).toBe('HIGH');
    expect(detail.assignee?.userId).toBe(member.userId);
    expect(detail.projectId).toBe(project.id);
    expect(detail.dueDate).toBe('2026-12-01');
    expect(detail.description).toBe('Full spec');

    const events = (await historyOf(owner.cookies, detail.id)).map(
      (h) => h.event,
    );
    expect(events).toEqual(['CREATED']);
  });

  it('trims the title and rejects an empty one (400)', async () => {
    const trimmed = await createIssue(owner.cookies, {
      title: '   Padded title   ',
    });
    expect(trimmed.status).toBe(201);
    expect(trimmed.detail.title).toBe('Padded title');

    const empty = await createIssue(owner.cookies, { title: '   ' });
    expect(empty.status).toBe(400);
    expect(errorCodeOf(empty.res)).toBe('VALIDATION_ERROR');
  });

  it('validates create body bounds and enums (400 VALIDATION_ERROR)', async () => {
    const cases: Record<string, unknown>[] = [
      {},
      { title: 'x'.repeat(256) },
      { title: 'ok', description: 'x'.repeat(10001) },
      { title: 'ok', status: 'ARCHIVED' },
      { title: 'ok', priority: 'CRITICAL' },
      { title: 'ok', dueDate: 'not-a-date' },
      { title: 'ok', projectId: 'not-a-cuid' },
      // 21 label ids pass cuid but breach the max(20) bound.
      { title: 'ok', labelIds: Array.from({ length: 21 }, () => ws.id) },
    ];
    for (const body of cases) {
      const res = await createIssue(owner.cookies, body);
      expect(res.status).toBe(400);
      expect(errorCodeOf(res.res)).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects unknown assignee / project / labels (404, scoped)', async () => {
    const badAssignee = await createIssue(owner.cookies, {
      title: 'x',
      assigneeId: 'ghost-user-id',
    });
    expect(badAssignee.status).toBe(404);
    expect(errorCodeOf(badAssignee.res)).toBe('ASSIGNEE_NOT_MEMBER');

    // ws.id is a valid cuid but not a project/label in this workspace.
    const badProject = await createIssue(owner.cookies, {
      title: 'x',
      projectId: ws.id,
    });
    expect(badProject.status).toBe(404);
    expect(errorCodeOf(badProject.res)).toBe('PROJECT_NOT_IN_WORKSPACE');

    const badLabels = await createIssue(owner.cookies, {
      title: 'x',
      labelIds: [ws.id],
    });
    expect(badLabels.status).toBe(404);
    expect(errorCodeOf(badLabels.res)).toBe('LABEL_NOT_IN_WORKSPACE');
  });

  it('rejects cross-workspace assignee and project (404, no leak)', async () => {
    const foreign = await createForeignWorkspace();
    const crossAssignee = await createIssue(owner.cookies, {
      title: 'x',
      assigneeId: foreign.userId,
    });
    expect(crossAssignee.status).toBe(404);
    expect(errorCodeOf(crossAssignee.res)).toBe('ASSIGNEE_NOT_MEMBER');

    const foreignProject = await createTestApp()
      .post(`/api/v1/workspaces/${foreign.slug}/projects`)
      .set('Cookie', foreign.cookies)
      .send({ name: 'Foreign Project' });
    const crossProject = await createIssue(owner.cookies, {
      title: 'x',
      projectId: dataOf<ProjectCard>(foreignProject).id,
    });
    expect(crossProject.status).toBe(404);
    expect(errorCodeOf(crossProject.res)).toBe('PROJECT_NOT_IN_WORKSPACE');
  });

  it('rejects attaching to an archived project (409 PROJECT_ARCHIVED)', async () => {
    const project = await createProject(owner.cookies, 'Frozen');
    await request
      .post(`/api/v1/workspaces/${ws.slug}/projects/${project.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const res = await createIssue(owner.cookies, {
      title: 'x',
      projectId: project.id,
    });
    expect(res.status).toBe(409);
    expect(errorCodeOf(res.res)).toBe('PROJECT_ARCHIVED');
  });

  it('concurrent creates get distinct sequential seqNumbers', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createIssue(owner.cookies, { title: `Parallel ${i}` }),
      ),
    );
    for (const r of results) expect(r.status).toBe(201);
    const seqs = results.map((r) => r.detail.seqNumber).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
    const identifiers = new Set(results.map((r) => r.detail.identifier));
    expect(identifiers.size).toBe(5);
  });

  it('member can create (any-role writes — only delete is gated)', async () => {
    const member = await addMember(uniqueEmail('creator'));
    const { status, detail } = await createIssue(member.cookies, {
      title: 'Member issue',
    });
    expect(status).toBe(201);
    expect(detail.identifier).toBe('SHIP-1');
  });

  // ── Detail (#2) ────────────────────────────────────────────────────────

  it('gets issue detail incl. description and creator', async () => {
    const created = await createIssue(owner.cookies, {
      title: 'Detailed',
      description: 'Has a description',
    });
    const res = await request
      .get(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(200);
    const detail = dataOf<IssueDetail>(res);
    expect(detail.description).toBe('Has a description');
    expect(detail.creator.userId).toBe(owner.userId);
    expect(detail.identifier).toBe('SHIP-1');
  });

  it('detail returns an archived issue', async () => {
    const created = await createIssue(owner.cookies, { title: 'ArchivedD' });
    await request
      .post(`${issueUrl(ws.slug, created.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const res = await request
      .get(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(200);
    expect(dataOf<IssueDetail>(res).archivedAt).not.toBeNull();
  });

  it('unknown issue id is 404 ISSUE_NOT_FOUND', async () => {
    // ws.id is a real cuid but not an issue id — passes validation while
    // scoping to an issue that does not exist in this workspace.
    const res = await request
      .get(issueUrl(ws.slug, ws.id))
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(404);
    expect(errorCodeOf(res)).toBe('ISSUE_NOT_FOUND');
  });

  it('cross-workspace issue id is 404 (scoped, no leak)', async () => {
    const created = await createIssue(owner.cookies, { title: 'Secret' });
    const foreign = await createForeignWorkspace();
    const res = await createTestApp()
      .get(issueUrl(foreign.slug, created.detail.id))
      .set('Cookie', foreign.cookies);
    expect(res.status).toBe(404);
    expect(errorCodeOf(res)).toBe('ISSUE_NOT_FOUND');
  });

  // ── Update (#4) ────────────────────────────────────────────────────────

  it('edits title/priority/due date and records one history row per concern', async () => {
    const created = await createIssue(owner.cookies, { title: 'Before' });
    const res = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ title: 'After', priority: 'URGENT', dueDate: '2026-11-01' });
    expect(res.status).toBe(200);
    const detail = dataOf<IssueDetail>(res);
    expect(detail.title).toBe('After');
    expect(detail.priority).toBe('URGENT');
    expect(detail.dueDate).toBe('2026-11-01');

    const history = await historyOf(owner.cookies, created.detail.id);
    expect(history.map((h) => h.event)).toEqual([
      'CREATED',
      'TITLE_CHANGED',
      'PRIORITY_CHANGED',
      'DUE_DATE_CHANGED',
    ]);
    const titleRow = history.find((h) => h.event === 'TITLE_CHANGED')!;
    expect(titleRow.oldValue).toBe('Before');
    expect(titleRow.newValue).toBe('After');
  });

  it('switches status freely in any direction incl. reopen', async () => {
    const created = await createIssue(owner.cookies, { title: 'Flow' });
    for (const status of ['TODO', 'IN_PROGRESS', 'DONE', 'BACKLOG'] as const) {
      const res = await request
        .patch(issueUrl(ws.slug, created.detail.id))
        .set('Cookie', owner.cookies)
        .send({ status });
      expect(res.status).toBe(200);
      expect(dataOf<IssueDetail>(res).status).toBe(status);
    }
    const history = await historyOf(owner.cookies, created.detail.id);
    const transitions = history.filter((h) => h.event === 'STATUS_CHANGED');
    expect(transitions.map((h) => `${h.oldValue}->${h.newValue}`)).toEqual([
      'BACKLOG->TODO',
      'TODO->IN_PROGRESS',
      'IN_PROGRESS->DONE',
      'DONE->BACKLOG',
    ]);
  });

  it('description edits write the column but emit no history', async () => {
    const created = await createIssue(owner.cookies, { title: 'Desc' });
    const res = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ description: 'v2' });
    expect(dataOf<IssueDetail>(res).description).toBe('v2');

    const cleared = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ description: null });
    expect(dataOf<IssueDetail>(cleared).description).toBeNull();

    expect(
      (await historyOf(owner.cookies, created.detail.id)).map((h) => h.event),
    ).toEqual(['CREATED']);
  });

  it('assigns, reassigns, unassigns — same-person set is a no-op', async () => {
    const alice = await addMember(uniqueEmail('alice'));
    const bob = await addMember(uniqueEmail('bob'));
    const created = await createIssue(owner.cookies, { title: 'Task' });

    const assigned = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ assigneeId: alice.userId });
    expect(dataOf<IssueDetail>(assigned).assignee?.userId).toBe(alice.userId);

    // Same-person reassign: 200 but no write, no history.
    const noop = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ assigneeId: alice.userId });
    expect(noop.status).toBe(200);
    expect(
      (await historyOf(owner.cookies, created.detail.id)).map((h) => h.event),
    ).toEqual(['CREATED', 'ASSIGNED']);

    const reassigned = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ assigneeId: bob.userId });
    expect(dataOf<IssueDetail>(reassigned).assignee?.userId).toBe(bob.userId);

    const unassigned = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ assigneeId: null });
    expect(dataOf<IssueDetail>(unassigned).assignee).toBeNull();

    const events = (await historyOf(owner.cookies, created.detail.id)).map(
      (h) => `${h.event}:${h.oldValue ?? '∅'}→${h.newValue ?? '∅'}`,
    );
    expect(events).toEqual([
      'CREATED:∅→∅',
      `ASSIGNED:∅→${alice.userId}`,
      `ASSIGNED:${alice.userId}→${bob.userId}`,
      `UNASSIGNED:${bob.userId}→∅`,
    ]);
  });

  it('attaches and detaches a project with PROJECT_CHANGED history', async () => {
    const project = await createProject(owner.cookies, 'Planned');
    const created = await createIssue(owner.cookies, { title: 'Scoped' });

    const attached = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ projectId: project.id });
    expect(dataOf<IssueDetail>(attached).projectId).toBe(project.id);

    const detached = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ projectId: null });
    expect(dataOf<IssueDetail>(detached).projectId).toBeNull();

    const history = await historyOf(owner.cookies, created.detail.id);
    const projectRows = history.filter((h) => h.event === 'PROJECT_CHANGED');
    expect(projectRows).toHaveLength(2);
    expect(projectRows[0]!.newValue).toBe(project.id);
    expect(projectRows[1]!.newValue).toBeNull();
  });

  it('update validates body (400) incl. overlong blocked reason', async () => {
    const created = await createIssue(owner.cookies, { title: 'Valid' });
    const bad = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ status: 'ARCHIVED', dueDate: 'nope' });
    expect(bad.status).toBe(400);
    expect(errorCodeOf(bad)).toBe('VALIDATION_ERROR');

    const longReason = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ blocked: true, blockedReason: 'x'.repeat(501) });
    expect(longReason.status).toBe(400);
  });

  it('update on an archived issue is 409 ISSUE_ARCHIVED', async () => {
    const created = await createIssue(owner.cookies, { title: 'Frozen' });
    await request
      .post(`${issueUrl(ws.slug, created.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const res = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ title: 'Try' });
    expect(res.status).toBe(409);
    expect(errorCodeOf(res)).toBe('ISSUE_ARCHIVED');
  });

  it('member can update; archived workspace rejects writes (409)', async () => {
    const member = await addMember(uniqueEmail('editor'));
    const created = await createIssue(owner.cookies, { title: 'Editable' });

    const edited = await createTestApp()
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', member.cookies)
      .send({ title: 'Member edit' });
    expect(edited.status).toBe(200);

    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const frozen = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ title: 'Nope' });
    expect(frozen.status).toBe(409);
    expect(errorCodeOf(frozen)).toBe('WORKSPACE_ARCHIVED');
  });

  // ── Blocked (#4 subset, spec §3.3) ─────────────────────────────────────

  it('blocks an unfinished issue, then Done clears the flag (recorded)', async () => {
    const created = await createIssue(owner.cookies, {
      title: 'Blocked work',
      status: 'TODO',
    });

    const blocked = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ blocked: true, blockedReason: 'Waiting on API key' });
    expect(blocked.status).toBe(200);
    const blockedDetail = dataOf<IssueDetail>(blocked);
    expect(blockedDetail.blocked).toBe(true);
    expect(blockedDetail.blockedReason).toBe('Waiting on API key');
    // Still in its column — blocked never moves status.
    expect(blockedDetail.status).toBe('TODO');

    const done = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ status: 'DONE' });
    const doneDetail = dataOf<IssueDetail>(done);
    expect(doneDetail.blocked).toBe(false);
    expect(doneDetail.blockedReason).toBeNull();

    // Re-activating never restores the flag.
    const reopened = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ status: 'TODO' });
    expect(dataOf<IssueDetail>(reopened).blocked).toBe(false);

    const events = (await historyOf(owner.cookies, created.detail.id)).map(
      (h) => h.event,
    );
    expect(events).toEqual([
      'CREATED',
      'BLOCKED_SET',
      'STATUS_CHANGED',
      'BLOCKED_CLEARED',
      'STATUS_CHANGED',
    ]);
  });

  it('cannot block a DONE issue (409 CANNOT_BLOCK_DONE)', async () => {
    const created = await createIssue(owner.cookies, {
      title: 'Done work',
      status: 'DONE',
    });
    const res = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ blocked: true });
    expect(res.status).toBe(409);
    expect(errorCodeOf(res)).toBe('CANNOT_BLOCK_DONE');

    // Same-PATCH status:DONE + blocked:true is also rejected.
    const active = await createIssue(owner.cookies, { title: 'Active' });
    const combo = await request
      .patch(issueUrl(ws.slug, active.detail.id))
      .set('Cookie', owner.cookies)
      .send({ status: 'DONE', blocked: true });
    expect(combo.status).toBe(409);
    expect(errorCodeOf(combo)).toBe('CANNOT_BLOCK_DONE');
  });

  it('edits the blocked reason in place; explicit unblock clears it', async () => {
    const created = await createIssue(owner.cookies, { title: 'Reasoned' });
    await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ blocked: true, blockedReason: 'v1' });

    const edited = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ blockedReason: 'v2' });
    expect(dataOf<IssueDetail>(edited).blockedReason).toBe('v2');

    const cleared = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ blocked: false });
    const clearedDetail = dataOf<IssueDetail>(cleared);
    expect(clearedDetail.blocked).toBe(false);
    expect(clearedDetail.blockedReason).toBeNull();
  });

  it('blocked reason without the blocked flag is 400', async () => {
    const created = await createIssue(owner.cookies, { title: 'Unblocked' });
    const res = await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ blockedReason: 'dangling' });
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  // ── Archive / restore (#5 / #6) ───────────────────────────────────────

  it('archive → restore round-trips and preserves status + blocked', async () => {
    const created = await createIssue(owner.cookies, {
      title: 'Lifecycle',
      status: 'IN_PROGRESS',
    });
    await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ blocked: true, blockedReason: 'paused' });

    const archive = await request
      .post(`${issueUrl(ws.slug, created.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(archive.status).toBe(200);
    const archived = dataOf<IssueDetail>(archive);
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.status).toBe('IN_PROGRESS');
    expect(archived.blocked).toBe(true);

    const restore = await request
      .post(`${issueUrl(ws.slug, created.detail.id)}/restore`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(restore.status).toBe(200);
    const restored = dataOf<IssueDetail>(restore);
    expect(restored.archivedAt).toBeNull();
    expect(restored.status).toBe('IN_PROGRESS');
    expect(restored.blocked).toBe(true);
    expect(restored.blockedReason).toBe('paused');

    const events = (await historyOf(owner.cookies, created.detail.id)).map(
      (h) => h.event,
    );
    expect(events).toContain('ARCHIVED');
    expect(events).toContain('RESTORED');
  });

  it('archive an archived issue → ALREADY_ARCHIVED; restore a live → NOT_ARCHIVED', async () => {
    const created = await createIssue(owner.cookies, { title: 'Stateful' });
    await request
      .post(`${issueUrl(ws.slug, created.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const double = await request
      .post(`${issueUrl(ws.slug, created.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(double.status).toBe(409);
    expect(errorCodeOf(double)).toBe('ALREADY_ARCHIVED');

    const live = await createIssue(owner.cookies, { title: 'Live' });
    const notArchived = await request
      .post(`${issueUrl(ws.slug, live.detail.id)}/restore`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(notArchived.status).toBe(409);
    expect(errorCodeOf(notArchived)).toBe('NOT_ARCHIVED');
  });

  it('archive/restore without confirm is 400', async () => {
    const created = await createIssue(owner.cookies, { title: 'Confirm' });
    const res = await request
      .post(`${issueUrl(ws.slug, created.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({});
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  it('member can archive and restore (any-role writes)', async () => {
    const member = await addMember(uniqueEmail('archiver'));
    const created = await createIssue(owner.cookies, { title: 'Ar' });
    const archive = await createTestApp()
      .post(`${issueUrl(ws.slug, created.detail.id)}/archive`)
      .set('Cookie', member.cookies)
      .send({ confirm: true });
    expect(archive.status).toBe(200);
    const restore = await createTestApp()
      .post(`${issueUrl(ws.slug, created.detail.id)}/restore`)
      .set('Cookie', member.cookies)
      .send({ confirm: true });
    expect(restore.status).toBe(200);
  });

  // ── Delete (#7) ────────────────────────────────────────────────────────

  it('deletes with typed SHIP-### — joins + history die, project/label survive, seq never reused', async () => {
    const member = await addMember(uniqueEmail('doer'));
    const project = await createProject(owner.cookies, 'Keepsake');
    const labelRes = await request
      .post(`/api/v1/workspaces/${ws.slug}/labels`)
      .set('Cookie', owner.cookies)
      .send({ name: 'bug' });
    const labelId = dataOf<{ id: string }>(labelRes).id;

    const created = await createIssue(owner.cookies, {
      title: 'Doomed',
      assigneeId: member.userId,
      projectId: project.id,
    });
    await request
      .post(`${issueUrl(ws.slug, created.detail.id)}/labels`)
      .set('Cookie', owner.cookies)
      .send({ labelId });
    await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ status: 'DONE' });

    const res = await request
      .delete(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ confirmIdentifier: created.detail.identifier });
    expect(res.status).toBe(200);
    const body = dataOf<{ deletedIssueId: string; identifier: string }>(res);
    expect(body.deletedIssueId).toBe(created.detail.id);
    expect(body.identifier).toBe('SHIP-1');

    expect(
      await prisma.issue.findUnique({ where: { id: created.detail.id } }),
    ).toBeNull();
    expect(
      await prisma.issueLabel.count({
        where: { issueId: created.detail.id },
      }),
    ).toBe(0);
    expect(
      await prisma.issueHistory.count({
        where: { issueId: created.detail.id },
      }),
    ).toBe(0);
    // Project + label rows survive the issue delete.
    expect(
      await prisma.project.findUnique({ where: { id: project.id } }),
    ).not.toBeNull();
    expect(
      await prisma.label.findUnique({ where: { id: labelId } }),
    ).not.toBeNull();

    // The identifier is never reused.
    const next = await createIssue(owner.cookies, { title: 'Next' });
    expect(next.detail.identifier).toBe('SHIP-2');
    expect(next.detail.seqNumber).toBe(2);
  });

  it('delete with wrong identifier is 400 and keeps the issue', async () => {
    const created = await createIssue(owner.cookies, { title: 'Keep me' });
    const res = await request
      .delete(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ confirmIdentifier: 'SHIP-999' });
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('CONFIRM_IDENTIFIER_MISMATCH');
    expect(
      await prisma.issue.findUnique({ where: { id: created.detail.id } }),
    ).not.toBeNull();
  });

  it('delete without a body is 400', async () => {
    const created = await createIssue(owner.cookies, { title: 'NoBody' });
    const res = await request
      .delete(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({});
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  it('delete can remove an archived issue', async () => {
    const created = await createIssue(owner.cookies, { title: 'DelArch' });
    await request
      .post(`${issueUrl(ws.slug, created.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const res = await request
      .delete(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ confirmIdentifier: created.detail.identifier });
    expect(res.status).toBe(200);
  });

  it('member cannot delete (403) but admin can', async () => {
    const member = await addMember(uniqueEmail('del-member'));
    const admin = await addMember(uniqueEmail('del-admin'), 'ADMIN');
    const created = await createIssue(owner.cookies, { title: 'Keep' });
    const forbidden = await createTestApp()
      .delete(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', member.cookies)
      .send({ confirmIdentifier: created.detail.identifier });
    expect(forbidden.status).toBe(403);
    expect(errorCodeOf(forbidden)).toBe('FORBIDDEN_ROLE');

    const allowed = await createTestApp()
      .delete(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', admin.cookies)
      .send({ confirmIdentifier: created.detail.identifier });
    expect(allowed.status).toBe(200);
  });

  // ── History (#8) ───────────────────────────────────────────────────────

  it('history is chronological and readable on archived issues', async () => {
    const created = await createIssue(owner.cookies, { title: 'H1' });
    await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ title: 'H2' });
    await request
      .patch(issueUrl(ws.slug, created.detail.id))
      .set('Cookie', owner.cookies)
      .send({ status: 'TODO' });

    const history = await historyOf(owner.cookies, created.detail.id);
    expect(history.map((h) => h.event)).toEqual([
      'CREATED',
      'TITLE_CHANGED',
      'STATUS_CHANGED',
    ]);
    const createdAts = history.map((h) => h.createdAt);
    expect([...createdAts].sort()).toEqual(createdAts);
    expect(history[0]!.actor?.userId).toBe(owner.userId);

    await request
      .post(`${issueUrl(ws.slug, created.detail.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const archivedRead = await request
      .get(`${issueUrl(ws.slug, created.detail.id)}/history`)
      .set('Cookie', owner.cookies);
    expect(archivedRead.status).toBe(200);
  });

  it('history paginates forward with cursors', async () => {
    const created = await createIssue(owner.cookies, { title: 'P0' });
    for (let i = 1; i <= 4; i += 1) {
      await request
        .patch(issueUrl(ws.slug, created.detail.id))
        .set('Cookie', owner.cookies)
        .send({ title: `P${i}` });
    }
    // 1 CREATED + 4 TITLE_CHANGED = 5 rows.
    const first = await request
      .get(`${issueUrl(ws.slug, created.detail.id)}/history?limit=2`)
      .set('Cookie', owner.cookies);
    const firstPage = dataOf<{
      history: HistoryItem[];
      nextCursor: string | null;
    }>(first);
    expect(firstPage.history).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();

    const second = await request
      .get(
        `${issueUrl(ws.slug, created.detail.id)}/history?limit=2&cursor=${firstPage.nextCursor}`,
      )
      .set('Cookie', owner.cookies);
    const secondPage = dataOf<{
      history: HistoryItem[];
      nextCursor: string | null;
    }>(second);
    expect(secondPage.history).toHaveLength(2);

    const third = await request
      .get(
        `${issueUrl(ws.slug, created.detail.id)}/history?limit=2&cursor=${secondPage.nextCursor}`,
      )
      .set('Cookie', owner.cookies);
    const thirdPage = dataOf<{
      history: HistoryItem[];
      nextCursor: string | null;
    }>(third);
    expect(thirdPage.history).toHaveLength(1);
    expect(thirdPage.nextCursor).toBeNull();

    const all = [
      ...firstPage.history,
      ...secondPage.history,
      ...thirdPage.history,
    ];
    expect(all.map((h) => h.newValue ?? h.event)).toEqual([
      'CREATED',
      'P1',
      'P2',
      'P3',
      'P4',
    ]);
  });

  it('history rejects a bogus cursor (400)', async () => {
    const created = await createIssue(owner.cookies, { title: 'Cur' });
    const res = await request
      .get(`${issueUrl(ws.slug, created.detail.id)}/history?cursor=bogus`)
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  // ── Guard / envelope ───────────────────────────────────────────────────

  it('rejects unauthenticated access to every issue route (401)', async () => {
    const anon = createTestApp();
    const bogus = crypto.randomUUID();
    const res = await Promise.all([
      anon.get(issuesUrl(ws.slug)),
      anon.get(issueUrl(ws.slug, bogus)),
      anon.post(issuesUrl(ws.slug)).send({ title: 'X' }),
      anon.patch(issueUrl(ws.slug, bogus)).send({}),
      anon.post(`${issueUrl(ws.slug, bogus)}/archive`).send({ confirm: true }),
      anon.post(`${issueUrl(ws.slug, bogus)}/restore`).send({ confirm: true }),
      anon
        .delete(issueUrl(ws.slug, bogus))
        .send({ confirmIdentifier: 'SHIP-1' }),
      anon.get(`${issueUrl(ws.slug, bogus)}/history`),
      anon.post(`${issueUrl(ws.slug, bogus)}/labels`).send({}),
    ]);
    for (const r of res) {
      expect(r.status).toBe(401);
      expect(errorResponseSchema.parse(r.body).error.code).toBe('UNAUTHORIZED');
    }
  });
});
