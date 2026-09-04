import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

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
import { notificationsService } from '../../../../src/features/notifications/service.js';

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

interface CommentCard {
  id: string;
  workspaceId: string;
  issueId: string;
  author: { userId: string; name: string; email: string; image: string | null };
  content: string;
  mentions: { userId: string; name: string; image: string | null }[];
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

function commentsUrl(slug: string, issueId: string): string {
  return `/api/v1/workspaces/${slug}/issues/${issueId}/comments`;
}

describe('comments mentions (integration)', () => {
  const uniqueEmail = (prefix: string) =>
    `${prefix}-${crypto.randomUUID()}@example.com`;

  let request: Request;
  let owner: { cookies: string; userId: string; email: string };
  let ws: WsResp;
  let issueId: string;

  // Spies on the F6 stub contract: assert *what* comments emits (payloads,
  // fan-out count, retraction) — the F6 suite asserts the row writes.
  let createMentionSpy: Mock<typeof notificationsService.createMention>;
  let deleteForCommentSpy: Mock<typeof notificationsService.deleteForComment>;

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

    const ires = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues`)
      .set('Cookie', owner.cookies)
      .send({ title: 'Discuss me' });
    expect(ires.status).toBe(201);
    issueId = dataOf<{ id: string }>(ires).id;

    createMentionSpy = vi.spyOn(notificationsService, 'createMention');
    deleteForCommentSpy = vi.spyOn(notificationsService, 'deleteForComment');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Registers a verified user, renames them, and adds them as `role`. */
  async function addNamedMember(
    email: string,
    name: string,
    role: 'MEMBER' | 'ADMIN' = 'MEMBER',
  ): Promise<{ cookies: string; userId: string; memberId: string }> {
    const member = await registerVerifiedUser(createTestApp(), email);
    await prisma.user.update({ where: { id: member.userId }, data: { name } });
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

  async function postComment(
    content: string,
    cookies: string = owner.cookies,
  ): Promise<{
    status: number;
    res: { status: number; body: unknown };
    card: CommentCard;
  }> {
    const res = await request
      .post(commentsUrl(ws.slug, issueId))
      .set('Cookie', cookies)
      .send({ content });
    return { status: res.status, res, card: dataOf<CommentCard>(res) };
  }

  async function mentionJoins(commentId: string): Promise<string[]> {
    const rows = await prisma.commentMention.findMany({
      where: { commentId },
      orderBy: [{ createdAt: 'asc' }, { mentionedUserId: 'asc' }],
      select: { mentionedUserId: true },
    });
    return rows.map((r) => r.mentionedUserId);
  }

  // ── Resolution ─────────────────────────────────────────────────────────

  it('resolves @known to a join row + fan-out event; @unknown stays literal', async () => {
    const maya = await addNamedMember(uniqueEmail('maya'), 'Maya Chen');
    const { status, card } = await postComment(
      '@maya can you check this? cc @ghost',
    );
    expect(status).toBe(201);
    expect(card.mentions.map((m) => m.userId)).toEqual([maya.userId]);
    expect(card.mentions[0]!.name).toBe('Maya Chen');
    expect(await mentionJoins(card.id)).toEqual([maya.userId]);

    expect(createMentionSpy).toHaveBeenCalledTimes(1);
    const fanOut = createMentionSpy.mock.calls[0]?.[0];
    expect(typeof fanOut?.workspaceId).toBe('string');
    expect(fanOut).toMatchObject({
      issueId,
      commentId: card.id,
      recipientId: maya.userId,
      actorId: owner.userId,
    });
  });

  it('duplicate tokens collapse to one row + one fan-out event', async () => {
    const maya = await addNamedMember(uniqueEmail('maya'), 'Maya Chen');
    const { card } = await postComment('@maya and again @maya');
    expect(await mentionJoins(card.id)).toEqual([maya.userId]);
    expect(createMentionSpy).toHaveBeenCalledTimes(1);
  });

  it('matches case-insensitively and on any name word', async () => {
    const maya = await addNamedMember(uniqueEmail('maya'), 'Maya Chen');
    const upper = await postComment('@MAYA hi');
    expect(upper.card.mentions.map((m) => m.userId)).toEqual([maya.userId]);
    const word = await postComment('@chen yo');
    expect(word.card.mentions.map((m) => m.userId)).toEqual([maya.userId]);
  });

  it('ambiguous tokens resolve to every matcher (both notified)', async () => {
    const mayaC = await addNamedMember(uniqueEmail('mayac'), 'Maya Chen');
    const mayaP = await addNamedMember(uniqueEmail('mayap'), 'Maya Patel');
    const { card } = await postComment('@maya both of you');
    expect(await mentionJoins(card.id)).toEqual(
      expect.arrayContaining([mayaC.userId, mayaP.userId]),
    );
    expect(createMentionSpy).toHaveBeenCalledTimes(2);
  });

  it('a member who left stays literal — no join, no fan-out', async () => {
    const leaver = await addNamedMember(uniqueEmail('leaver'), 'Leo Park');
    await createTestApp()
      .post(`/api/v1/workspaces/${ws.slug}/leave`)
      .set('Cookie', leaver.cookies)
      .send({ confirm: true });

    const { status, card } = await postComment('@leo are you there?');
    expect(status).toBe(201);
    expect(card.mentions).toEqual([]);
    expect(await mentionJoins(card.id)).toEqual([]);
    expect(createMentionSpy).not.toHaveBeenCalled();
  });

  it('self-mention writes the join row but emits nothing', async () => {
    // Owner's display name is 'Test User' → '@test' word-matches the author.
    const { card } = await postComment('@test note to self');
    expect(card.mentions.map((m) => m.userId)).toEqual([owner.userId]);
    expect(await mentionJoins(card.id)).toEqual([owner.userId]);
    expect(createMentionSpy).not.toHaveBeenCalled();
  });

  // ── Edit recompute (D7: silent) ────────────────────────────────────────

  it('edit recomputes joins to v2 text and emits zero fan-out', async () => {
    const maya = await addNamedMember(uniqueEmail('maya'), 'Maya Chen');
    const leo = await addNamedMember(uniqueEmail('leo'), 'Leo Park');
    const { card } = await postComment('@maya take a look');

    const res = await request
      .patch(`${commentsUrl(ws.slug, issueId)}/${card.id}`)
      .set('Cookie', owner.cookies)
      .send({ content: '@leo actually you' });
    expect(res.status).toBe(200);
    expect(dataOf<CommentCard>(res).mentions.map((m) => m.userId)).toEqual([
      leo.userId,
    ]);
    expect(await mentionJoins(card.id)).toEqual([leo.userId]);
    // Only the create-time fan-out for maya; leo gets nothing on edit.
    expect(createMentionSpy).toHaveBeenCalledTimes(1);
    expect(createMentionSpy.mock.calls[0]?.[0]).toMatchObject({
      recipientId: maya.userId,
    });
  });

  it('edit removing all handles clears joins; prior fan-out stays (no take-backs)', async () => {
    const maya = await addNamedMember(uniqueEmail('maya'), 'Maya Chen');
    const { card } = await postComment('@maya hi');
    expect(await mentionJoins(card.id)).toEqual([maya.userId]);

    const res = await request
      .patch(`${commentsUrl(ws.slug, issueId)}/${card.id}`)
      .set('Cookie', owner.cookies)
      .send({ content: 'never mind' });
    expect(res.status).toBe(200);
    expect(dataOf<CommentCard>(res).mentions).toEqual([]);
    expect(await mentionJoins(card.id)).toEqual([]);
    expect(createMentionSpy).toHaveBeenCalledTimes(1);
  });

  // ── Delete retraction (D8) ─────────────────────────────────────────────

  it('delete retracts via deleteForComment and removes joins', async () => {
    const maya = await addNamedMember(uniqueEmail('maya'), 'Maya Chen');
    const { card } = await postComment('@maya fyi');

    const res = await request
      .delete(`${commentsUrl(ws.slug, issueId)}/${card.id}`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(res.status).toBe(200);
    expect(deleteForCommentSpy).toHaveBeenCalledTimes(1);
    expect(deleteForCommentSpy.mock.calls[0]?.[0]).toBe(card.id);
    expect(await mentionJoins(card.id)).toEqual([]);
    // The retracted fan-out targeted maya before deletion.
    expect(createMentionSpy.mock.calls[0]?.[0]).toMatchObject({
      recipientId: maya.userId,
    });
  });

  it('sibling comments survive a delete with their joins intact', async () => {
    const maya = await addNamedMember(uniqueEmail('maya'), 'Maya Chen');
    const first = await postComment('@maya one');
    const second = await postComment('@maya two');

    await request
      .delete(`${commentsUrl(ws.slug, issueId)}/${first.card.id}`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    expect(await mentionJoins(second.card.id)).toEqual([maya.userId]);
    const res = await request
      .get(`${commentsUrl(ws.slug, issueId)}/${second.card.id}`)
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(200);
  });

  // ── Issue delete chain (F5 ↔ F8) ───────────────────────────────────────

  it('issue delete removes its comments + joins (retraction per comment)', async () => {
    const maya = await addNamedMember(uniqueEmail('maya'), 'Maya Chen');
    const first = await postComment('@maya one');
    await postComment('plain two');

    const del = await request
      .delete(`/api/v1/workspaces/${ws.slug}/issues/${issueId}`)
      .set('Cookie', owner.cookies)
      .send({ confirmIdentifier: 'SHIP-1' });
    expect(del.status).toBe(200);

    expect(await prisma.comment.count({ where: { issueId } })).toBe(0);
    expect(
      await prisma.commentMention.count({
        where: { commentId: first.card.id },
      }),
    ).toBe(0);
    // Retraction ran once per removed comment.
    expect(deleteForCommentSpy).toHaveBeenCalledTimes(2);
    void maya;
  });

  it('unknown handles never error — still 201 with literal content', async () => {
    const { status, card } = await postComment('@ghost-99 hello there');
    expect(status).toBe(201);
    expect(card.content).toBe('@ghost-99 hello there');
    expect(card.mentions).toEqual([]);
    expect(createMentionSpy).not.toHaveBeenCalled();
  });
});
