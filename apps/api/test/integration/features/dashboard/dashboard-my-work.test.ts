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
}

interface DashboardPayload {
  workspaceId: string;
  myWork: {
    assigned: IssueCard[];
    created: IssueCard[];
    recentlyViewed: IssueCard[];
  };
}

interface InvitationCard {
  token: string;
}

const DASH = (slug: string) => `/api/v1/workspaces/${slug}/dashboard`;

/** Small pause so successive writes get distinct updatedAt/createdAt values. */
const step = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 6));

describe('dashboard My Work (integration)', () => {
  const uniqueEmail = (prefix: string) =>
    `${prefix}-${crypto.randomUUID()}@example.com`;

  let request: Request;
  let owner: { cookies: string; userId: string };
  let member: { cookies: string; userId: string };
  let ws: WsResp;

  beforeEach(async () => {
    await resetDatabase();
    request = createTestApp();
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue({ status: 'logged' });

    owner = {
      ...(await registerVerifiedUser(request, uniqueEmail('owner'))),
    };

    const wres = await request
      .post('/api/v1/workspaces')
      .set('Cookie', owner.cookies)
      .send({ name: 'Shipyard Team' });
    expect(wres.status).toBe(201);
    ws = dataOf<WsResp>(wres);
    member = await addMember(uniqueEmail('member'));
  });

  async function addMember(
    email: string,
  ): Promise<{ cookies: string; userId: string }> {
    const user = await registerVerifiedUser(createTestApp(), email);
    const inv = await request
      .post(`/api/v1/workspaces/${ws.slug}/invitations`)
      .set('Cookie', owner.cookies)
      .send({ emails: [email], role: 'MEMBER' });
    const token = dataOf<{ invitations: InvitationCard[] }>(inv).invitations[0]!
      .token;
    await createTestApp()
      .post(`/api/v1/invitations/${token}/accept`)
      .set('Cookie', user.cookies)
      .send({});
    return { cookies: user.cookies, userId: user.userId };
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

  async function myWork(cookies: string): Promise<DashboardPayload['myWork']> {
    const res = await request.get(DASH(ws.slug)).set('Cookie', cookies);
    expect(res.status).toBe(200);
    return dataOf<DashboardPayload>(res).myWork;
  }

  it('bounds: 15 assigned open ⇒ 10 returned, most recently updated first', async () => {
    const created: { id: string }[] = [];
    for (let i = 0; i < 15; i++) {
      await step();
      created.push(
        await createIssue(owner.cookies, {
          title: `Assigned ${i}`,
          assigneeId: member.userId,
        }),
      );
    }
    // Touch the oldest so it bumps to the top of updatedAt DESC.
    await step();
    await patchIssue(owner.cookies, created[0]!.id, { priority: 'HIGH' });

    const work = await myWork(member.cookies);
    expect(work.assigned).toHaveLength(10);
    expect(work.assigned[0]!.id).toBe(created[0]!.id);
    expect(work.assigned.every((card) => card.status !== 'DONE')).toBe(true);
    expect(work.assigned.every((card) => card.archivedAt === null)).toBe(true);
  });

  it('bounds: 15 created open ⇒ 10 returned', async () => {
    for (let i = 0; i < 15; i++) {
      await createIssue(member.cookies, { title: `Created ${i}` });
    }
    const work = await myWork(member.cookies);
    expect(work.created).toHaveLength(10);
  });

  it('"open" excludes DONE and archived issues but keeps blocked ones', async () => {
    const keepDone = await createIssue(member.cookies, {
      title: 'To complete',
    });
    const keepArchived = await createIssue(member.cookies, {
      title: 'To archive',
    });
    const blocked = await createIssue(member.cookies, { title: 'Blocked one' });
    await createIssue(member.cookies, { title: 'Plain one' });

    await patchIssue(owner.cookies, keepDone.id, { status: 'DONE' });
    await request
      .post(`/api/v1/workspaces/${ws.slug}/issues/${keepArchived.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    await patchIssue(owner.cookies, blocked.id, {
      blocked: true,
      blockedReason: 'waiting on API',
    });

    const work = await myWork(member.cookies);
    const created = work.created.map((card) => card.title);
    expect(created).toContain('Blocked one');
    expect(created).toContain('Plain one');
    expect(created).not.toContain('To complete');
    expect(created).not.toContain('To archive');

    const blockedCard = work.created.find(
      (card) => card.title === 'Blocked one',
    );
    expect(blockedCard!.blocked).toBe(true);
    expect(blockedCard!.blockedReason).toBe('waiting on API');
  });

  it('overdue rides as a row flag: past dueDate ships on the card', async () => {
    await createIssue(member.cookies, {
      title: 'Overdue one',
      dueDate: '2020-01-01',
    });
    const work = await myWork(member.cookies);
    expect(work.created).toHaveLength(1);
    expect(work.created[0]!.dueDate).toBe('2020-01-01');
  });

  it('personal isolation: teammate issues absent from my groups', async () => {
    await createIssue(owner.cookies, {
      title: 'Owner self-assigned',
      assigneeId: owner.userId,
    });
    await createIssue(owner.cookies, { title: 'Owner created only' });
    await createIssue(owner.cookies, {
      title: 'Assigned to member',
      assigneeId: member.userId,
    });

    const memberWork = await myWork(member.cookies);
    expect(memberWork.assigned.map((card) => card.title)).toEqual([
      'Assigned to member',
    ]);
    expect(memberWork.created.map((card) => card.title)).toEqual([]);

    const ownerWork = await myWork(owner.cookies);
    expect(ownerWork.assigned.map((card) => card.title)).toEqual([
      'Owner self-assigned',
    ]);
    // Owner created all three (one is assigned away, still "created by me").
    expect(ownerWork.created.map((card) => card.title)).toEqual([
      'Assigned to member',
      'Owner created only',
      'Owner self-assigned',
    ]);
  });
});
