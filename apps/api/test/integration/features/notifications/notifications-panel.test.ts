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

interface NotificationCard {
  id: string;
  workspaceId: string;
  type: 'ASSIGNMENT' | 'MENTION';
  actor: { userId: string; name: string; image: string | null } | null;
  issue: {
    id: string;
    identifier: string;
    title: string;
    workspaceId: string;
    workspaceSlug: string;
    archivedAt: string | null;
  };
  commentId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface PanelPage {
  notifications: NotificationCard[];
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

const BASE = '/api/v1/notifications';

describe('notifications panel (integration)', () => {
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
    const card = dataOf<{ member: MemberCard; workspaceSlug: string }>(
      accept,
    ).member;
    return { cookies: user.cookies, userId: user.userId, memberId: card.id };
  }

  /** Owner creates an issue assigned to `member` → one ASSIGNMENT row. */
  async function assignIssue(title: string): Promise<string> {
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues`)
      .set('Cookie', owner.cookies)
      .send({ title, assigneeId: member.userId });
    expect(res.status).toBe(201);
    return dataOf<{ id: string }>(res).id;
  }

  async function panel(
    query: string,
    cookies: string,
  ): Promise<{ status: number; page: PanelPage; raw: { body: unknown } }> {
    const res = await request.get(`${BASE}${query}`).set('Cookie', cookies);
    return {
      status: res.status,
      page: dataOf<PanelPage>(res),
      raw: res as unknown as { body: unknown },
    };
  }

  async function badge(cookies: string): Promise<number> {
    const res = await request
      .get(`${BASE}/unread-count`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    return dataOf<{ unreadCount: number }>(res).unreadCount;
  }

  // ── Panel (#1) + badge (#2) ────────────────────────────────────────────

  it('empty inbox: panel empty with null cursor, badge 0', async () => {
    const { status, page } = await panel('', member.cookies);
    expect(status).toBe(200);
    expect(page).toEqual({ notifications: [], nextCursor: null });
    expect(await badge(member.cookies)).toBe(0);
  });

  it('panel lists newest-first with live issue card; badge counts unread', async () => {
    await assignIssue('First');
    await assignIssue('Second');

    const { page } = await panel('', member.cookies);
    expect(page.notifications.map((n) => n.issue.title)).toEqual([
      'Second',
      'First',
    ]);
    for (const card of page.notifications) {
      expect(card.type).toBe('ASSIGNMENT');
      expect(card.actor?.userId).toBe(owner.userId);
      expect(card.issue.identifier).toMatch(/^SHIP-\d+$/);
      expect(card.issue.workspaceSlug).toBe(ws.slug);
      expect(card.issue.archivedAt).toBeNull();
      expect(card.commentId).toBeNull();
      expect(card.readAt).toBeNull();
    }
    expect(await badge(member.cookies)).toBe(2);
  });

  it('walks newest-first with cursors to nextCursor null', async () => {
    await assignIssue('One');
    await assignIssue('Two');
    await assignIssue('Three');

    const first = await panel('?limit=2', member.cookies);
    expect(first.page.notifications.map((n) => n.issue.title)).toEqual([
      'Three',
      'Two',
    ]);
    expect(first.page.nextCursor).toBeTruthy();

    const second = await panel(
      `?limit=2&cursor=${first.page.nextCursor}`,
      member.cookies,
    );
    expect(second.page.notifications.map((n) => n.issue.title)).toEqual([
      'One',
    ]);
    expect(second.page.nextCursor).toBeNull();
  });

  it('unreadOnly walks exactly the unread set', async () => {
    await assignIssue('Read me');
    await assignIssue('Unread me');
    const all = await panel('', member.cookies);
    const firstId = all.page.notifications[0]!.id;
    await request
      .post(`${BASE}/${firstId}/read`)
      .set('Cookie', member.cookies)
      .send({});

    const unread = await panel('?unreadOnly=true', member.cookies);
    expect(unread.page.notifications).toHaveLength(1);
    expect(unread.page.notifications[0]!.issue.title).toBe('Read me');
    expect(await badge(member.cookies)).toBe(1);
  });

  it('workspaceId filter narrows; unknown id matches zero rows (never 404)', async () => {
    await assignIssue('Home task');
    const other = await (async () => {
      const wres = await createTestApp()
        .post('/api/v1/workspaces')
        .set('Cookie', owner.cookies)
        .send({ name: 'Second Workspace' });
      return dataOf<WsResp>(wres);
    })();
    const inv = await request
      .post(`/api/v1/workspaces/${other.slug}/invitations`)
      .set('Cookie', owner.cookies)
      .send({ emails: [uniqueEmail('m2')], role: 'MEMBER' });
    void inv;

    const own = await panel(`?workspaceId=${ws.id}`, member.cookies);
    expect(own.status).toBe(200);
    expect(own.page.notifications).toHaveLength(1);

    const foreign = await panel(`?workspaceId=${other.id}`, member.cookies);
    expect(foreign.status).toBe(200);
    expect(foreign.page.notifications).toHaveLength(0);
  });

  it('rejects bad limit/cursor/workspaceId (400 VALIDATION_ERROR)', async () => {
    for (const query of [
      '?limit=0',
      '?limit=101',
      '?cursor=bogus',
      '?workspaceId=nope',
      '?unreadOnly=yes',
    ]) {
      const res = await panel(query, member.cookies);
      expect(res.status).toBe(400);
      expect(errorCodeOf(res.raw)).toBe('VALIDATION_ERROR');
    }
  });

  // ── Detail (#3) + isolation ────────────────────────────────────────────

  it('foreign-row access is byte-equal to unknown-cuid 404 (inverted leak test)', async () => {
    await assignIssue('Private');
    const mine = await panel('', member.cookies);
    const foreignId = mine.page.notifications[0]!.id;

    const foreign = await request
      .get(`${BASE}/${foreignId}`)
      .set('Cookie', owner.cookies);
    // ws.id is a valid cuid matching no notification — passes validation,
    // misses scope, exactly like the foreign row.
    const unknown = await request
      .get(`${BASE}/${ws.id}`)
      .set('Cookie', owner.cookies);
    expect(foreign.status).toBe(404);
    expect(unknown.status).toBe(404);
    // Equal modulo the per-request requestId (same convention as the
    // workspace leak test — code + message identical, no existence signal).
    const shape = (r: { body: unknown }) => {
      const { code, message } = bodyOf<{
        error: { code: string; message: string };
      }>(r).error;
      return { code, message };
    };
    expect(shape(foreign)).toEqual({
      code: 'NOTIFICATION_NOT_FOUND',
      message: shape(unknown).message,
    });
    expect(shape(foreign).code).toBe(shape(unknown).code);
  });

  it('owner cannot read/mark/delete a member row — recipient isolation, roles irrelevant', async () => {
    await assignIssue('Private');
    const id = (await panel('', member.cookies)).page.notifications[0]!.id;

    for (const probe of [
      request.get(`${BASE}/${id}`).set('Cookie', owner.cookies),
      request.post(`${BASE}/${id}/read`).set('Cookie', owner.cookies).send({}),
      request
        .delete(`${BASE}/${id}`)
        .set('Cookie', owner.cookies)
        .send({ confirm: true }),
    ]) {
      const res = await probe;
      expect(res.status).toBe(404);
      expect(errorCodeOf(res)).toBe('NOTIFICATION_NOT_FOUND');
    }
  });

  // ── Read flows (#4/#5) ─────────────────────────────────────────────────

  it('mark read sets readAt once — re-mark keeps the first timestamp', async () => {
    await assignIssue('Task');
    const id = (await panel('', member.cookies)).page.notifications[0]!.id;

    const first = await request
      .post(`${BASE}/${id}/read`)
      .set('Cookie', member.cookies)
      .send({});
    expect(first.status).toBe(200);
    const readAt = dataOf<NotificationCard>(first).readAt;
    expect(readAt).not.toBeNull();
    expect(await badge(member.cookies)).toBe(0);

    const second = await request
      .post(`${BASE}/${id}/read`)
      .set('Cookie', member.cookies)
      .send({});
    expect(second.status).toBe(200);
    expect(dataOf<NotificationCard>(second).readAt).toBe(readAt);

    const dbRow = await prisma.notification.findUnique({ where: { id } });
    expect(dbRow?.readAt?.toISOString()).toBe(readAt);
  });

  it('mark read rejects non-empty bodies (400 — read is one-way)', async () => {
    await assignIssue('Task');
    const id = (await panel('', member.cookies)).page.notifications[0]!.id;
    const res = await request
      .post(`${BASE}/${id}/read`)
      .set('Cookie', member.cookies)
      .send({ read: false });
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  it('mark all read returns exact count; already-read untouched; 0 is 200', async () => {
    await assignIssue('A');
    await assignIssue('B');
    const before = await panel('', member.cookies);
    const firstId = before.page.notifications[0]!.id;
    await request
      .post(`${BASE}/${firstId}/read`)
      .set('Cookie', member.cookies)
      .send({});
    const firstReadAt = (
      await prisma.notification.findUnique({ where: { id: firstId } })
    )?.readAt?.toISOString();

    const res = await request
      .post(`${BASE}/read-all`)
      .set('Cookie', member.cookies)
      .send({});
    expect(res.status).toBe(200);
    expect(dataOf<{ markedCount: number }>(res)).toEqual({ markedCount: 1 });
    expect(
      (
        await prisma.notification.findUnique({ where: { id: firstId } })
      )?.readAt?.toISOString(),
    ).toBe(firstReadAt);
    expect(await badge(member.cookies)).toBe(0);

    const again = await request
      .post(`${BASE}/read-all`)
      .set('Cookie', member.cookies)
      .send({});
    expect(again.status).toBe(200);
    expect(dataOf<{ markedCount: number }>(again)).toEqual({ markedCount: 0 });
  });

  // ── Delete flows (#6/#7) ───────────────────────────────────────────────

  it('delete one removes the row; second delete is 404', async () => {
    await assignIssue('Task');
    const id = (await panel('', member.cookies)).page.notifications[0]!.id;

    const del = await request
      .delete(`${BASE}/${id}`)
      .set('Cookie', member.cookies)
      .send({ confirm: true });
    expect(del.status).toBe(200);
    expect(dataOf<{ deletedNotificationId: string }>(del)).toEqual({
      deletedNotificationId: id,
    });
    expect(await badge(member.cookies)).toBe(0);

    const again = await request
      .delete(`${BASE}/${id}`)
      .set('Cookie', member.cookies)
      .send({ confirm: true });
    expect(again.status).toBe(404);
  });

  it('delete/clear without confirm is 400; clear-all honors workspace + readOnly scopes', async () => {
    await assignIssue('A');
    await assignIssue('B');
    const noConfirm = await request
      .delete(`${BASE}`)
      .set('Cookie', member.cookies)
      .send({});
    expect(noConfirm.status).toBe(400);

    // Mark one read, then clear read-only: unread badge untouched.
    const ids = (await panel('', member.cookies)).page.notifications;
    await request
      .post(`${BASE}/${ids[0]!.id}/read`)
      .set('Cookie', member.cookies)
      .send({});
    const cleared = await request
      .delete(`${BASE}?readOnly=true`)
      .set('Cookie', member.cookies)
      .send({ confirm: true });
    expect(dataOf<{ deletedCount: number }>(cleared)).toEqual({
      deletedCount: 1,
    });
    expect(await badge(member.cookies)).toBe(1);

    // Workspace scope with an empty workspace id clears nothing, still 200.
    const emptyWs = await createTestApp()
      .post('/api/v1/workspaces')
      .set('Cookie', owner.cookies)
      .send({ name: 'Empty Workspace' });
    const emptyWsId = dataOf<WsResp>(emptyWs).id;
    const scoped = await request
      .delete(`${BASE}?workspaceId=${emptyWsId}`)
      .set('Cookie', member.cookies)
      .send({ confirm: true });
    expect(scoped.status).toBe(200);
    expect(dataOf<{ deletedCount: number }>(scoped)).toEqual({
      deletedCount: 0,
    });

    const all = await request
      .delete(`${BASE}`)
      .set('Cookie', member.cookies)
      .send({ confirm: true });
    expect(dataOf<{ deletedCount: number }>(all)).toEqual({ deletedCount: 1 });
    expect((await panel('', member.cookies)).page.notifications).toHaveLength(
      0,
    );
  });

  // ── Tolerance (no freeze axis) ─────────────────────────────────────────

  it('archived workspace rows stay fully usable (no freeze axis here)', async () => {
    await assignIssue('Task');
    const id = (await panel('', member.cookies)).page.notifications[0]!.id;
    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    expect((await panel('', member.cookies)).status).toBe(200);
    expect(await badge(member.cookies)).toBe(1);
    const read = await request
      .post(`${BASE}/${id}/read`)
      .set('Cookie', member.cookies)
      .send({});
    expect(read.status).toBe(200);
    const del = await request
      .delete(`${BASE}/${id}`)
      .set('Cookie', member.cookies)
      .send({ confirm: true });
    expect(del.status).toBe(200);
  });

  it('archived-issue rows stay readable with archivedAt on the card', async () => {
    const issueId = await assignIssue('Task');
    await request
      .post(`/api/v1/workspaces/${ws.slug}/issues/${issueId}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const { page } = await panel('', member.cookies);
    expect(page.notifications).toHaveLength(1);
    expect(page.notifications[0]!.issue.archivedAt).not.toBeNull();
  });

  // ── Guards ─────────────────────────────────────────────────────────────

  it('no create route — authenticated POST mint 404s (rule 7)', async () => {
    const res = await request
      .post(`${BASE}`)
      .set('Cookie', member.cookies)
      .send({ type: 'ASSIGNMENT' });
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated access to every notification route (401)', async () => {
    const anon = createTestApp();
    const bogus = crypto.randomUUID();
    const res = await Promise.all([
      anon.get(BASE),
      anon.get(`${BASE}/unread-count`),
      anon.get(`${BASE}/${bogus}`),
      anon.post(`${BASE}/${bogus}/read`).send({}),
      anon.post(`${BASE}/read-all`).send({}),
      anon.delete(`${BASE}/${bogus}`).send({ confirm: true }),
      anon.delete(BASE).send({ confirm: true }),
    ]);
    for (const r of res) {
      expect(r.status).toBe(401);
      expect(errorResponseSchema.parse(r.body).error.code).toBe('UNAUTHORIZED');
    }
  });
});
