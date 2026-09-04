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
  workspaceId: string;
  seqNumber: number;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  assignee: { userId: string } | null;
  projectId: string | null;
  dueDate: string | null;
  blocked: boolean;
  labels: { id: string; name: string }[];
  archivedAt: string | null;
}

interface ListPage {
  issues: IssueCard[];
  nextCursor: string | null;
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

describe('issues list (integration)', () => {
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
      .post(issuesUrl(ws.slug))
      .set('Cookie', cookies)
      .send(body);
    expect(res.status).toBe(201);
    return dataOf<IssueCard>(res);
  }

  async function list(
    query: string,
    cookies: string = owner.cookies,
  ): Promise<{ status: number; page: ListPage; raw: { body: unknown } }> {
    const res = await request
      .get(`${issuesUrl(ws.slug)}${query}`)
      .set('Cookie', cookies);
    return {
      status: res.status,
      page: dataOf<ListPage>(res),
      raw: res as unknown as { body: unknown },
    };
  }

  async function createLabel(name: string): Promise<string> {
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/labels`)
      .set('Cookie', owner.cookies)
      .send({ name });
    expect(res.status).toBe(201);
    return dataOf<{ id: string }>(res).id;
  }

  // ── Archived split ─────────────────────────────────────────────────────

  it('lists non-archived by default; ?archived=true returns only archived', async () => {
    const live = await createIssue({ title: 'Live' });
    const gone = await createIssue({ title: 'Gone' });
    await request
      .post(`${issuesUrl(ws.slug)}/${gone.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const fresh = await list('');
    expect(fresh.status).toBe(200);
    expect(fresh.page.issues.map((i) => i.id)).toEqual([live.id]);
    expect(fresh.page.nextCursor).toBeNull();

    const archived = await list('?archived=true');
    expect(archived.page.issues.map((i) => i.id)).toEqual([gone.id]);
  });

  // ── Filters ────────────────────────────────────────────────────────────

  it('filters by status, priority, blocked — comma-separated and repeatable', async () => {
    await createIssue({ title: 'A', status: 'TODO', priority: 'HIGH' });
    await createIssue({ title: 'B', status: 'DONE', priority: 'LOW' });
    const blocked = await createIssue({ title: 'C', status: 'TODO' });
    await request
      .patch(`${issuesUrl(ws.slug)}/${blocked.id}`)
      .set('Cookie', owner.cookies)
      .send({ blocked: true, blockedReason: 'stuck' });

    expect(
      (await list('?status=TODO')).page.issues.map((i) => i.title),
    ).toEqual(['C', 'A']);
    // Repeatable params and comma-separated are equivalent.
    const repeated = await list('?status=TODO&status=DONE');
    const csv = await list('?status=TODO,DONE');
    expect(repeated.page.issues).toHaveLength(3);
    expect(csv.page.issues).toHaveLength(3);

    expect(
      (await list('?priority=HIGH')).page.issues.map((i) => i.title),
    ).toEqual(['A']);
    expect(
      (await list('?priority=HIGH,LOW')).page.issues.map((i) => i.title).sort(),
    ).toEqual(['A', 'B']);
    expect(
      (await list('?blocked=true')).page.issues.map((i) => i.title),
    ).toEqual(['C']);
    expect((await list('?blocked=false')).page.issues).toHaveLength(2);
    // AND-combination across dimensions.
    expect(
      (await list('?status=TODO&blocked=true')).page.issues.map((i) => i.title),
    ).toEqual(['C']);
  });

  it('filters by assignee incl. the me alias', async () => {
    const member = await addMember(uniqueEmail('worker'));
    const mine = await createIssue({
      title: 'Mine',
      assigneeId: member.userId,
    });
    await createIssue({ title: 'Unassigned' });

    const byId = await list(`?assigneeId=${member.userId}`, member.cookies);
    expect(byId.page.issues.map((i) => i.id)).toEqual([mine.id]);

    const byMe = await list('?assigneeId=me', member.cookies);
    expect(byMe.page.issues.map((i) => i.id)).toEqual([mine.id]);

    // `me` resolves to the caller — the owner has nothing assigned.
    expect((await list('?assigneeId=me')).page.issues).toHaveLength(0);
  });

  it('filters by project and due-date range', async () => {
    const projectRes = await request
      .post(`/api/v1/workspaces/${ws.slug}/projects`)
      .set('Cookie', owner.cookies)
      .send({ name: 'Roadmap' });
    const projectId = dataOf<{ id: string }>(projectRes).id;

    const inProject = await createIssue({ title: 'Scoped', projectId });
    await createIssue({ title: 'Free', dueDate: '2026-06-15' });
    await createIssue({ title: 'Later', dueDate: '2026-09-01' });

    expect(
      (await list(`?projectId=${projectId}`)).page.issues.map((i) => i.id),
    ).toEqual([inProject.id]);
    expect(
      (
        await list('?dueDateFrom=2026-06-01&dueDateTo=2026-07-01')
      ).page.issues.map((i) => i.title),
    ).toEqual(['Free']);
  });

  it('labels filter uses AND semantics — issue must carry every label', async () => {
    const bug = await createLabel('bug');
    const ui = await createLabel('ui');
    const both = await createIssue({ title: 'Both', labelIds: [bug, ui] });
    await createIssue({ title: 'BugOnly', labelIds: [bug] });
    await createIssue({ title: 'Plain' });

    const filtered = await list(`?labels=${bug},${ui}`);
    expect(filtered.page.issues.map((i) => i.id)).toEqual([both.id]);

    const single = await list(`?labels=${bug}`);
    expect(single.page.issues.map((i) => i.title).sort()).toEqual([
      'Both',
      'BugOnly',
    ]);
  });

  // ── Search ─────────────────────────────────────────────────────────────

  it('searches text case-insensitively and matches SHIP-### exactly', async () => {
    await createIssue({
      title: 'Fix Login Redirect',
      description: 'oauth loop',
    });
    await createIssue({ title: 'Unrelated', description: 'nothing here' });

    expect((await list('?q=login')).page.issues.map((i) => i.title)).toEqual([
      'Fix Login Redirect',
    ]);
    expect((await list('?q=OAUTH')).page.issues).toHaveLength(1);
    expect(
      (await list('?q=SHIP-1')).page.issues.map((i) => i.identifier),
    ).toEqual(['SHIP-1']);
    expect((await list('?q=ship-999')).page.issues).toHaveLength(0);
  });

  it('ignores a single-char query; rejects an overlong one', async () => {
    await createIssue({ title: 'Something' });
    const ignored = await list('?q=x');
    expect(ignored.status).toBe(200);
    expect(ignored.page.issues).toHaveLength(1);

    const tooLong = await list(`?q=${'y'.repeat(201)}`);
    expect(tooLong.status).toBe(400);
    expect(errorCodeOf(tooLong.raw)).toBe('VALIDATION_ERROR');
  });

  // ── Sort / order ───────────────────────────────────────────────────────

  it('sorts by priority rank Urgent > High > Medium > Low > No Priority', async () => {
    await createIssue({ title: 'low', priority: 'LOW' });
    await createIssue({ title: 'none' });
    await createIssue({ title: 'urgent', priority: 'URGENT' });
    await createIssue({ title: 'medium', priority: 'MEDIUM' });

    const asc = await list('?sort=priority&order=asc');
    expect(asc.page.issues.map((i) => i.title)).toEqual([
      'urgent',
      'medium',
      'low',
      'none',
    ]);
    const desc = await list('?sort=priority&order=desc');
    expect(desc.page.issues.map((i) => i.title)).toEqual([
      'none',
      'low',
      'medium',
      'urgent',
    ]);
  });

  it('sorts by seqNumber and honors order', async () => {
    await createIssue({ title: 'first' });
    await createIssue({ title: 'second' });
    expect(
      (await list('?sort=seqNumber&order=asc')).page.issues.map((i) => i.title),
    ).toEqual(['first', 'second']);
    expect(
      (await list('?sort=seqNumber&order=desc')).page.issues.map(
        (i) => i.title,
      ),
    ).toEqual(['second', 'first']);
  });

  it('rejects bad sort/order/limit (400 VALIDATION_ERROR)', async () => {
    for (const query of [
      '?sort=bogus',
      '?order=sideways',
      '?limit=0',
      '?limit=101',
      '?blocked=yes',
    ]) {
      const res = await list(query);
      expect(res.status).toBe(400);
      expect(errorCodeOf(res.raw)).toBe('VALIDATION_ERROR');
    }
  });

  // ── Pagination ─────────────────────────────────────────────────────────

  it('walks forward with cursors until nextCursor is null', async () => {
    await createIssue({ title: 'one' });
    await createIssue({ title: 'two' });
    await createIssue({ title: 'three' });

    const first = await list('?limit=2&sort=seqNumber&order=asc');
    expect(first.page.issues.map((i) => i.title)).toEqual(['one', 'two']);
    expect(first.page.nextCursor).toBeTruthy();

    const second = await list(
      `?limit=2&sort=seqNumber&order=asc&cursor=${first.page.nextCursor}`,
    );
    expect(second.page.issues.map((i) => i.title)).toEqual(['three']);
    expect(second.page.nextCursor).toBeNull();
  });

  it('rejects malformed cursors and sort-mismatched cursors (400)', async () => {
    await createIssue({ title: 'only' });
    const malformed = await list('?cursor=!!!not-a-cursor!!!');
    expect(malformed.status).toBe(400);
    expect(errorCodeOf(malformed.raw)).toBe('VALIDATION_ERROR');

    const first = await list('?limit=1&sort=createdAt&order=desc');
    // Create a second issue so a second page exists and the cursor is real.
    await createIssue({ title: 'second' });
    const headed = await list('?limit=1&sort=createdAt&order=desc');
    expect(headed.page.nextCursor).toBeTruthy();
    void first;

    const mismatched = await list(
      `?limit=1&sort=seqNumber&order=asc&cursor=${headed.page.nextCursor}`,
    );
    expect(mismatched.status).toBe(400);
    expect(errorCodeOf(mismatched.raw)).toBe('VALIDATION_ERROR');
  });

  // ── View preference (reused F4 endpoints, scope=ISSUE) ─────────────────

  it('ISSUE view preference defaults to LIST and is independent of PROJECT', async () => {
    const get = await request
      .get(`/api/v1/workspaces/${ws.slug}/view-preferences/ISSUE`)
      .set('Cookie', owner.cookies);
    expect(get.status).toBe(200);
    expect(dataOf<{ view: string }>(get).view).toBe('LIST');

    const set = await request
      .put(`/api/v1/workspaces/${ws.slug}/view-preferences/ISSUE`)
      .set('Cookie', owner.cookies)
      .send({ scope: 'ISSUE', view: 'KANBAN' });
    expect(dataOf<{ view: string }>(set).view).toBe('KANBAN');

    const project = await request
      .get(`/api/v1/workspaces/${ws.slug}/view-preferences/PROJECT`)
      .set('Cookie', owner.cookies);
    expect(dataOf<{ view: string }>(project).view).toBe('LIST');
  });

  // ── Guards ─────────────────────────────────────────────────────────────

  it('does not leak existence: non-member and unknown slug are identical 404', async () => {
    const outsider = await registerVerifiedUser(
      createTestApp(),
      uniqueEmail('outsider'),
    );
    const nonMemberRes = await createTestApp()
      .get(issuesUrl(ws.slug))
      .set('Cookie', outsider.cookies);
    const unknownRes = await createTestApp()
      .get('/api/v1/workspaces/does-not-exist/issues')
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
    const created = await createIssue({ title: 'ReadMe' });

    const listed = await createTestApp()
      .get(issuesUrl(ws.slug))
      .set('Cookie', member.cookies);
    expect(listed.status).toBe(200);
    expect(
      dataOf<ListPage>(listed).issues.some((i) => i.id === created.id),
    ).toBe(true);

    const detail = await createTestApp()
      .get(`${issuesUrl(ws.slug)}/${created.id}`)
      .set('Cookie', member.cookies);
    expect(detail.status).toBe(200);
  });

  it('archived workspace: writes rejected (409), reads allowed (200)', async () => {
    await createIssue({ title: 'Readable' });
    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const write = await request
      .post(issuesUrl(ws.slug))
      .set('Cookie', owner.cookies)
      .send({ title: 'Nope' });
    expect(write.status).toBe(409);
    expect(errorCodeOf(write as unknown as { body: unknown })).toBe(
      'WORKSPACE_ARCHIVED',
    );

    const read = await list('');
    expect(read.status).toBe(200);
    expect(read.page.issues).toHaveLength(1);
  });
});
