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
}

interface IssueCard {
  id: string;
  identifier: string;
  title: string;
  archivedAt: string | null;
  viewedAt?: string;
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
const ISSUE = (slug: string, id: string) =>
  `/api/v1/workspaces/${slug}/issues/${id}`;

/** Small pause so successive views get distinct viewedAt values. */
const step = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 6));

describe('dashboard recently-viewed trail (integration)', () => {
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
    title: string,
  ): Promise<{ id: string; identifier: string; title: string }> {
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues`)
      .set('Cookie', cookies)
      .send({ title });
    expect(res.status).toBe(201);
    return dataOf(res);
  }

  /** The real recording hook — a detail read, never a direct insert. */
  async function viewIssue(cookies: string, issueId: string): Promise<number> {
    const res = await request
      .get(ISSUE(ws.slug, issueId))
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    return res.status;
  }

  async function recentlyViewed(cookies: string): Promise<IssueCard[]> {
    const res = await request.get(DASH(ws.slug)).set('Cookie', cookies);
    expect(res.status).toBe(200);
    return dataOf<DashboardPayload>(res).myWork.recentlyViewed;
  }

  async function trailCount(userId: string): Promise<number> {
    return prisma.issueView.count({ where: { userId, workspaceId: ws.id } });
  }

  it('detail views populate the trail in bump order; revisit re-bumps', async () => {
    const a = await createIssue(owner.cookies, 'Issue A');
    const b = await createIssue(owner.cookies, 'Issue B');
    const c = await createIssue(owner.cookies, 'Issue C');

    await viewIssue(member.cookies, a.id);
    await step();
    await viewIssue(member.cookies, b.id);
    await step();
    await viewIssue(member.cookies, c.id);

    let trail = await recentlyViewed(member.cookies);
    expect(trail.map((card) => card.title)).toEqual([
      'Issue C',
      'Issue B',
      'Issue A',
    ]);
    for (const card of trail) {
      expect(card.viewedAt).toBeTruthy();
      expect(card.archivedAt).toBeNull();
    }

    // Revisit A — bumps back to the top, no duplicate entry.
    await step();
    await viewIssue(member.cookies, a.id);
    trail = await recentlyViewed(member.cookies);
    expect(trail.map((card) => card.title)).toEqual([
      'Issue A',
      'Issue C',
      'Issue B',
    ]);
    expect(await trailCount(member.userId)).toBe(3);

    // Personal: the owner's trail is untouched by the member's views.
    expect(await recentlyViewed(owner.cookies)).toEqual([]);
  });

  it('51st distinct view prunes the oldest (cap 50)', async () => {
    const issues: { id: string }[] = [];
    for (let i = 0; i < 51; i++) {
      issues.push(await createIssue(owner.cookies, `Soak ${i}`));
    }
    for (const issue of issues) {
      await viewIssue(member.cookies, issue.id);
    }
    // Cap holds per (user, workspace) — the service pruned the oldest.
    expect(await trailCount(member.userId)).toBe(50);

    const trail = await recentlyViewed(member.cookies);
    expect(trail).toHaveLength(10);
    // Newest-first window of the 50: the last-created issue on top, the
    // first-viewed issue pruned out of existence.
    expect(trail[0]!.title).toBe('Soak 50');
    expect(trail.map((card) => card.title)).not.toContain('Soak 0');
  });

  it('deleted issue drops out of the trail (cascade)', async () => {
    const doomed = await createIssue(owner.cookies, 'Doomed issue');
    const other = await createIssue(owner.cookies, 'Survivor');
    await viewIssue(member.cookies, doomed.id);
    await step();
    await viewIssue(member.cookies, other.id);

    const del = await request
      .delete(ISSUE(ws.slug, doomed.id))
      .set('Cookie', owner.cookies)
      .send({ confirmIdentifier: doomed.identifier });
    expect(del.status).toBe(200);

    const trail = await recentlyViewed(member.cookies);
    expect(trail.map((card) => card.title)).toEqual(['Survivor']);
    expect(await trailCount(member.userId)).toBe(1);
  });

  it('archived issue stays in the trail with its flag (personal history)', async () => {
    const archivedIssue = await createIssue(owner.cookies, 'Archived issue');
    await viewIssue(member.cookies, archivedIssue.id);

    const res = await request
      .post(`${ISSUE(ws.slug, archivedIssue.id)}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(res.status).toBe(200);

    const trail = await recentlyViewed(member.cookies);
    expect(trail.map((card) => card.title)).toEqual(['Archived issue']);
    expect(trail[0]!.archivedAt).toBeTruthy();
  });

  it('trail is isolated per workspace', async () => {
    const wsIssue = await createIssue(owner.cookies, 'WS1 view');
    await viewIssue(member.cookies, wsIssue.id);

    const wres = await request
      .post('/api/v1/workspaces')
      .set('Cookie', owner.cookies)
      .send({ name: 'Second Team' });
    const ws2 = dataOf<WsResp>(wres);
    const ws2Res = await request
      .get(`/api/v1/workspaces/${ws2.slug}/dashboard`)
      .set('Cookie', owner.cookies);
    expect(dataOf<DashboardPayload>(ws2Res).myWork.recentlyViewed).toEqual([]);
  });
});
