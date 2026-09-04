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

interface NotificationRow {
  id: string;
  type: 'ASSIGNMENT' | 'MENTION';
  recipientId: string;
  actorId: string | null;
  issueId: string;
  commentId: string | null;
  readAt: Date | null;
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

const BASE = '/api/v1/notifications';

describe('notifications emission (integration)', () => {
  const uniqueEmail = (prefix: string) =>
    `${prefix}-${crypto.randomUUID()}@example.com`;

  let request: Request;
  let owner: { cookies: string; userId: string; email: string };
  let alice: { cookies: string; userId: string; memberId: string };
  let bob: { cookies: string; userId: string; memberId: string };
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
    alice = await addMember(uniqueEmail('alice'));
    bob = await addMember(uniqueEmail('bob'));
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
    const card = dataOf<{ member: MemberCard; workspaceSlug: string }>(
      accept,
    ).member;
    return { cookies: user.cookies, userId: user.userId, memberId: card.id };
  }

  async function rowsFor(userId: string): Promise<NotificationRow[]> {
    return prisma.notification.findMany({
      where: { recipientId: userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        type: true,
        recipientId: true,
        actorId: true,
        issueId: true,
        commentId: true,
        readAt: true,
      },
    });
  }

  async function badge(cookies: string): Promise<number> {
    const res = await request
      .get(`${BASE}/unread-count`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    return dataOf<{ unreadCount: number }>(res).unreadCount;
  }

  async function createIssue(
    body: Record<string, unknown>,
    cookies: string = owner.cookies,
  ): Promise<string> {
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues`)
      .set('Cookie', cookies)
      .send(body);
    expect(res.status).toBe(201);
    return dataOf<{ id: string }>(res).id;
  }

  // ── Assignment emission (F5 ↔ F6) ───────────────────────────────────────

  it('create-with-assignee emits one ASSIGNMENT row for the new assignee', async () => {
    const issueId = await createIssue({
      title: 'Yours',
      assigneeId: alice.userId,
    });

    const rows = await rowsFor(alice.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'ASSIGNMENT',
      recipientId: alice.userId,
      actorId: owner.userId,
      issueId,
      commentId: null,
      readAt: null,
    });
    expect(await badge(alice.cookies)).toBe(1);
    expect(await badge(bob.cookies)).toBe(0);
  });

  it('actual-change reassign notifies the new assignee only', async () => {
    const issueId = await createIssue({
      title: 'Swap',
      assigneeId: alice.userId,
    });
    const res = await request
      .patch(`/api/v1/workspaces/${ws.slug}/issues/${issueId}`)
      .set('Cookie', owner.cookies)
      .send({ assigneeId: bob.userId });
    expect(res.status).toBe(200);

    expect((await rowsFor(bob.userId)).map((r) => r.issueId)).toEqual([
      issueId,
    ]);
    // Alice keeps only her original row — no "you were unassigned" row.
    expect(await rowsFor(alice.userId)).toHaveLength(1);
  });

  it('same-person set and unassign emit nothing', async () => {
    const issueId = await createIssue({
      title: 'Stable',
      assigneeId: alice.userId,
    });
    const same = await request
      .patch(`/api/v1/workspaces/${ws.slug}/issues/${issueId}`)
      .set('Cookie', owner.cookies)
      .send({ assigneeId: alice.userId });
    expect(same.status).toBe(200);
    const unassign = await request
      .patch(`/api/v1/workspaces/${ws.slug}/issues/${issueId}`)
      .set('Cookie', owner.cookies)
      .send({ assigneeId: null });
    expect(unassign.status).toBe(200);

    expect(await rowsFor(alice.userId)).toHaveLength(1);
    expect(await rowsFor(bob.userId)).toHaveLength(0);
  });

  it('self-assign emits nothing (D8)', async () => {
    // Alice (member) creates and takes the issue herself — issues RBAC allows it.
    const agent = createTestApp();
    const created = await agent
      .post(`/api/v1/workspaces/${ws.slug}/issues`)
      .set('Cookie', alice.cookies)
      .send({ title: 'Mine', assigneeId: alice.userId });
    expect(created.status).toBe(201);
    const issueId = dataOf<{ id: string }>(created).id;
    const reassigned = await agent
      .patch(`/api/v1/workspaces/${ws.slug}/issues/${issueId}`)
      .set('Cookie', alice.cookies)
      .send({ assigneeId: alice.userId });
    expect(reassigned.status).toBe(200);

    expect(await rowsFor(alice.userId)).toHaveLength(0);
    const dbRow = await prisma.issue.findUnique({ where: { id: issueId } });
    expect(dbRow?.assigneeId).toBe(alice.userId);
  });

  // ── Mention emission (F8 ↔ F6, now with real rows) ─────────────────────

  it('distinct recipients each get one MENTION; duplicates collapse', async () => {
    await prisma.user.update({
      where: { id: alice.userId },
      data: { name: 'Alice Anders' },
    });
    await prisma.user.update({
      where: { id: bob.userId },
      data: { name: 'Bob Brown' },
    });
    const issueId = await createIssue({ title: 'Discuss' });

    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues/${issueId}/comments`)
      .set('Cookie', owner.cookies)
      .send({ content: '@alice @bob @alice, thoughts?' });
    expect(res.status).toBe(201);
    const commentId = dataOf<{ id: string }>(res).id;

    for (const user of [alice, bob]) {
      const rows = await rowsFor(user.userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: 'MENTION',
        actorId: owner.userId,
        issueId,
        commentId,
      });
      expect(await badge(user.cookies)).toBe(1);
    }
  });

  it('comment edit emits nothing; delete retracts mention rows only', async () => {
    await prisma.user.update({
      where: { id: alice.userId },
      data: { name: 'Alice Anders' },
    });
    const issueId = await createIssue({ title: 'Discuss' });
    const created = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues/${issueId}/comments`)
      .set('Cookie', owner.cookies)
      .send({ content: '@alice fyi' });
    const commentId = dataOf<{ id: string }>(created).id;

    // Owner also holds an assignment row on another issue — must survive.
    const otherIssue = await createIssue({
      title: 'Other',
      assigneeId: alice.userId,
    });

    const edited = await request
      .patch(
        `/api/v1/workspaces/${ws.slug}/issues/${issueId}/comments/${commentId}`,
      )
      .set('Cookie', owner.cookies)
      .send({ content: '@alice edited' });
    expect(edited.status).toBe(200);
    expect(await rowsFor(alice.userId)).toHaveLength(2);

    const deleted = await request
      .delete(
        `/api/v1/workspaces/${ws.slug}/issues/${issueId}/comments/${commentId}`,
      )
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(deleted.status).toBe(200);
    const remaining = await rowsFor(alice.userId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.issueId).toBe(otherIssue);
    expect(remaining[0]!.type).toBe('ASSIGNMENT');
  });

  // ── Cascade flows (§6.5) ───────────────────────────────────────────────

  it('issue delete removes its assignment + mention rows', async () => {
    await prisma.user.update({
      where: { id: bob.userId },
      data: { name: 'Bob Brown' },
    });
    const issueId = await createIssue({
      title: 'Doomed',
      assigneeId: alice.userId,
    });
    await request
      .post(`/api/v1/workspaces/${ws.slug}/issues/${issueId}/comments`)
      .set('Cookie', owner.cookies)
      .send({ content: '@bob look' });
    expect(await rowsFor(alice.userId)).toHaveLength(1);
    expect(await rowsFor(bob.userId)).toHaveLength(1);

    const del = await request
      .delete(`/api/v1/workspaces/${ws.slug}/issues/${issueId}`)
      .set('Cookie', owner.cookies)
      .send({ confirmIdentifier: 'SHIP-1' });
    expect(del.status).toBe(200);
    expect(await rowsFor(alice.userId)).toHaveLength(0);
    expect(await rowsFor(bob.userId)).toHaveLength(0);
    expect(await badge(alice.cookies)).toBe(0);
  });

  it('workspace delete removes every recipient row', async () => {
    await createIssue({ title: 'Gone', assigneeId: alice.userId });
    expect(await rowsFor(alice.userId)).toHaveLength(1);

    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const wsRow = await prisma.workspace.findFirst({
      where: { slug: ws.slug },
      select: { name: true },
    });
    const del = await request
      .delete(`/api/v1/workspaces/${ws.slug}`)
      .set('Cookie', owner.cookies)
      .send({ confirmName: wsRow?.name ?? '' });
    expect(del.status).toBe(204);
    expect(await rowsFor(alice.userId)).toHaveLength(0);
  });

  it('recipient delete clears the inbox; actor delete nulls actorId (row survives)', async () => {
    // Alice authors the issue; owner only assigns it to bob (actor, creator
    // of nothing — deletable despite creatorId/authored Restrict rules).
    const created = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues`)
      .set('Cookie', alice.cookies)
      .send({ title: 'Flow' });
    const issueId = dataOf<{ id: string }>(created).id;
    await request
      .patch(`/api/v1/workspaces/${ws.slug}/issues/${issueId}`)
      .set('Cookie', owner.cookies)
      .send({ assigneeId: bob.userId });

    // Actor (owner) deleted → row survives with nulled actor.
    await prisma.user.delete({ where: { id: owner.userId } });
    const survived = await rowsFor(bob.userId);
    expect(survived).toHaveLength(1);
    expect(survived[0]!.actorId).toBeNull();

    const card = await request
      .get(`${BASE}/${survived[0]!.id}`)
      .set('Cookie', bob.cookies);
    expect(card.status).toBe(200);
    expect(dataOf<{ actor: unknown }>(card).actor).toBeNull();

    // Recipient deleted → inbox gone. (Sessions cascade; use direct row check.)
    await prisma.user.delete({ where: { id: bob.userId } });
    expect(
      await prisma.notification.count({ where: { recipientId: bob.userId } }),
    ).toBe(0);
  });

  it('cycle assignment emits nothing (closed event list, spec §3.1)', async () => {
    const cycle = await request
      .post(`/api/v1/workspaces/${ws.slug}/cycles`)
      .set('Cookie', owner.cookies)
      .send({ name: 'Sprint', startDate: '2027-01-01', endDate: '2027-01-14' });
    const cycleId = dataOf<{ id: string }>(cycle).id;
    const issueId = await createIssue({ title: 'Scoped' });
    const res = await request
      .patch(`/api/v1/workspaces/${ws.slug}/issues/${issueId}`)
      .set('Cookie', owner.cookies)
      .send({ cycleId });
    expect(res.status).toBe(200);
    expect(await prisma.notification.count()).toBe(0);
  });
});
