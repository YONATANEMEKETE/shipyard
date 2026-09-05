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
  recentActivity: ActivityItem[];
}

interface InvitationCard {
  token: string;
}

const DASH = (slug: string) => `/api/v1/workspaces/${slug}/dashboard`;

/** Small pause so successive writes get distinct createdAt values. */
const step = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 6));

/** The closed kind set the hub feed is allowed to surface (D4). */
const PANEL_KINDS = new Set([
  'ISSUE_STATUS_CHANGED',
  'ISSUE_BLOCKED_SET',
  'ISSUE_BLOCKED_CLEARED',
  'ISSUE_ASSIGNED',
  'ISSUE_UNASSIGNED',
  'ISSUE_PLANNING_CHANGED',
  'ISSUE_ARCHIVED',
  'ISSUE_RESTORED',
  'ISSUE_CREATED',
  'COMMENT_CREATED',
]);

describe('dashboard recent activity (integration)', () => {
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

  async function recentActivity(cookies: string): Promise<ActivityItem[]> {
    const res = await request.get(DASH(ws.slug)).set('Cookie', cookies);
    expect(res.status).toBe(200);
    return dataOf<DashboardPayload>(res).recentActivity;
  }

  it('bounded at 20, newest-first, kind-whitelisted', async () => {
    for (let i = 0; i < 25; i++) {
      await step();
      await createIssue(owner.cookies, `Feed ${i}`);
    }

    const items = await recentActivity(member.cookies);
    expect(items).toHaveLength(20);
    expect(items[0]!.issue.identifier).toBe('SHIP-25');
    expect(items[19]!.issue.identifier).toBe('SHIP-6');
    for (const item of items) {
      expect(PANEL_KINDS.has(item.kind)).toBe(true);
      expect(item.kind).toBe('ISSUE_CREATED');
    }
  });

  it('mixed kinds render with actor, issue ref, and newest-first order', async () => {
    const issue = await createIssue(owner.cookies, 'Lifecycle issue');
    await step();
    await request
      .patch(`/api/v1/workspaces/${ws.slug}/issues/${issue.id}`)
      .set('Cookie', owner.cookies)
      .send({ status: 'IN_PROGRESS' });
    await step();
    const comment = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues/${issue.id}/comments`)
      .set('Cookie', member.cookies)
      .send({ content: 'Looking into this' });
    expect(comment.status).toBe(201);

    const items = await recentActivity(member.cookies);
    expect(items.map((item) => item.kind)).toEqual([
      'COMMENT_CREATED',
      'ISSUE_STATUS_CHANGED',
      'ISSUE_CREATED',
    ]);

    const commentItem = items[0]!;
    expect(commentItem.commentId).toBe(dataOf<{ id: string }>(comment).id);
    expect(commentItem.actor!.userId).toBe(member.userId);
    expect(commentItem.issue.identifier).toBe(issue.identifier);
    expect(commentItem.text).toContain('commented');

    const statusItem = items[1]!;
    expect(statusItem.actor!.userId).toBe(owner.userId);
    expect(statusItem.commentId).toBeNull();
  });

  it('no project/cycle lifecycle kinds until the panel contract extends', async () => {
    await request
      .post(`/api/v1/workspaces/${ws.slug}/cycles`)
      .set('Cookie', owner.cookies)
      .send({ name: 'Sprint', startDate: '2030-01-01', endDate: '2030-01-14' });
    await request
      .post(`/api/v1/workspaces/${ws.slug}/projects`)
      .set('Cookie', owner.cookies)
      .send({ name: 'Project' });

    const items = await recentActivity(member.cookies);
    for (const item of items) {
      expect(item.kind.startsWith('CYCLE_')).toBe(false);
      expect(item.kind.startsWith('PROJECT_')).toBe(false);
    }
  });

  it('actor-deleted events keep rendering with a null actor (not dropped)', async () => {
    const ghost = await addMember(uniqueEmail('ghost'));
    const issue = await createIssue(owner.cookies, 'Survivor issue');
    await step();
    await request
      .patch(`/api/v1/workspaces/${ws.slug}/issues/${issue.id}`)
      .set('Cookie', ghost.cookies)
      .send({ status: 'IN_PROGRESS' });
    await step();
    await request
      .patch(`/api/v1/workspaces/${ws.slug}/issues/${issue.id}`)
      .set('Cookie', ghost.cookies)
      .send({ blocked: true, blockedReason: 'waiting' });

    // Delete the account — activityEvent.actorId is SetNull; rows survive
    // frozen with their summary text.
    await prisma.user.delete({ where: { id: ghost.userId } });

    const items = await recentActivity(member.cookies);
    const survivorItems = items.filter(
      (item) => item.issue.title === 'Survivor issue',
    );
    // Ghost's two status events (actor nulled) + the owner's ISSUE_CREATED.
    expect(survivorItems).toHaveLength(3);
    const ghostItems = survivorItems.filter((item) => item.actor === null);
    expect(ghostItems).toHaveLength(2);
    for (const item of ghostItems) {
      expect(['ISSUE_STATUS_CHANGED', 'ISSUE_BLOCKED_SET']).toContain(
        item.kind,
      );
      expect(item.text).toContain('Test User');
      expect(item.issue.identifier).toBe(issue.identifier);
    }
  });

  it('dead links drop: comment event vanishes when its issue is deleted', async () => {
    const issue = await createIssue(owner.cookies, 'Doomed feed issue');
    await step();
    await request
      .post(`/api/v1/workspaces/${ws.slug}/issues/${issue.id}/comments`)
      .set('Cookie', member.cookies)
      .send({ content: 'So long' });

    let items = await recentActivity(member.cookies);
    expect(items[0]!.kind).toBe('COMMENT_CREATED');

    const del = await request
      .delete(`/api/v1/workspaces/${ws.slug}/issues/${issue.id}`)
      .set('Cookie', owner.cookies)
      .send({ confirmIdentifier: issue.identifier });
    expect(del.status).toBe(200);

    items = await recentActivity(member.cookies);
    expect(items.map((item) => item.issue.title)).not.toContain(
      'Doomed feed issue',
    );
  });
});
