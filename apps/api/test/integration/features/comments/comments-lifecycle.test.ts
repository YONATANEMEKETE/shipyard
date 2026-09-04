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

interface IssueRef {
  id: string;
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
function commentUrl(slug: string, issueId: string, commentId: string): string {
  return `/api/v1/workspaces/${slug}/issues/${issueId}/comments/${commentId}`;
}

describe('comments lifecycle (integration)', () => {
  const uniqueEmail = (prefix: string) =>
    `${prefix}-${crypto.randomUUID()}@example.com`;

  let request: Request;
  let owner: { cookies: string; userId: string; email: string };
  let ws: WsResp;
  let issue: IssueRef;

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
    issue = dataOf<IssueRef>(ires);
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

  async function postComment(
    cookies: string,
    body: Record<string, unknown>,
    issueId: string = issue.id,
  ): Promise<{
    status: number;
    res: { status: number; body: unknown };
    card: CommentCard;
  }> {
    const res = await request
      .post(commentsUrl(ws.slug, issueId))
      .set('Cookie', cookies)
      .send(body);
    return { status: res.status, res, card: dataOf<CommentCard>(res) };
  }

  // ── Create (#3) ────────────────────────────────────────────────────────

  it('creates a comment — any member, trimmed, editedAt null', async () => {
    const member = await addMember(uniqueEmail('writer'));
    const { status, card } = await postComment(member.cookies, {
      content: '  Looks good to me  ',
    });
    expect(status).toBe(201);
    expect(card.content).toBe('Looks good to me');
    expect(card.editedAt).toBeNull();
    expect(card.author.userId).toBe(member.userId);
    expect(card.issueId).toBe(issue.id);
    expect(card.mentions).toEqual([]);

    const dbRow = await prisma.comment.findUnique({ where: { id: card.id } });
    expect(dbRow?.authorId).toBe(member.userId);
    expect(dbRow?.editedAt).toBeNull();
  });

  it('rejects empty/whitespace/overlong content (400 VALIDATION_ERROR)', async () => {
    for (const content of ['', '   ', 'x'.repeat(10001)]) {
      const res = await postComment(owner.cookies, { content });
      expect(res.status).toBe(400);
      expect(errorCodeOf(res.res)).toBe('VALIDATION_ERROR');
    }
    const missing = await postComment(owner.cookies, {});
    expect(missing.status).toBe(400);
  });

  it('unknown issue id is 404 ISSUE_NOT_FOUND (scoped)', async () => {
    // ws.id is a real cuid but not an issue — passes validation, misses scope.
    const res = await postComment(owner.cookies, { content: 'hi' }, ws.id);
    expect(res.status).toBe(404);
    expect(errorCodeOf(res.res)).toBe('ISSUE_NOT_FOUND');
  });

  // ── Detail (#2) ────────────────────────────────────────────────────────

  it('gets comment detail (permalink target)', async () => {
    const created = await postComment(owner.cookies, { content: 'Permalink' });
    const res = await request
      .get(commentUrl(ws.slug, issue.id, created.card.id))
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(200);
    expect(dataOf<CommentCard>(res).content).toBe('Permalink');
  });

  it('comment under a sibling issue URL is 404 COMMENT_NOT_FOUND (triple-scope)', async () => {
    const created = await postComment(owner.cookies, { content: 'Scoped' });
    const other = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues`)
      .set('Cookie', owner.cookies)
      .send({ title: 'Sibling' });
    const otherId = dataOf<IssueRef>(other).id;

    const res = await request
      .get(commentUrl(ws.slug, otherId, created.card.id))
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(404);
    expect(errorCodeOf(res)).toBe('COMMENT_NOT_FOUND');
  });

  it('cross-workspace issue/comment ids stay scoped (404, no leak)', async () => {
    const created = await postComment(owner.cookies, { content: 'Secret' });
    const foreign = await (async () => {
      const user = await registerVerifiedUser(
        createTestApp(),
        uniqueEmail('foreign'),
      );
      const wres = await createTestApp()
        .post('/api/v1/workspaces')
        .set('Cookie', user.cookies)
        .send({ name: 'Foreign Workspace' });
      return { slug: dataOf<WsResp>(wres).slug, cookies: user.cookies };
    })();

    const crossIssue = await createTestApp()
      .post(commentsUrl(foreign.slug, issue.id))
      .set('Cookie', foreign.cookies)
      .send({ content: 'hi' });
    expect(crossIssue.status).toBe(404);
    expect(errorCodeOf(crossIssue)).toBe('ISSUE_NOT_FOUND');

    const foreignIssue = await createTestApp()
      .post(`/api/v1/workspaces/${foreign.slug}/issues`)
      .set('Cookie', foreign.cookies)
      .send({ title: 'Foreign issue' });
    const foreignIssueId = dataOf<IssueRef>(foreignIssue).id;
    const crossComment = await createTestApp()
      .get(commentUrl(foreign.slug, foreignIssueId, created.card.id))
      .set('Cookie', foreign.cookies);
    expect(crossComment.status).toBe(404);
    expect(errorCodeOf(crossComment)).toBe('COMMENT_NOT_FOUND');
  });

  // ── Update (#4: author-only) ───────────────────────────────────────────

  it('author edits own comment — content replaced, editedAt set', async () => {
    const member = await addMember(uniqueEmail('editor'));
    const created = await postComment(member.cookies, { content: 'v1' });
    expect(created.card.editedAt).toBeNull();

    const res = await request
      .patch(commentUrl(ws.slug, issue.id, created.card.id))
      .set('Cookie', member.cookies)
      .send({ content: 'v2' });
    expect(res.status).toBe(200);
    const card = dataOf<CommentCard>(res);
    expect(card.content).toBe('v2');
    expect(card.editedAt).not.toBeNull();
  });

  it('same-content edit is a no-op — editedAt untouched', async () => {
    const created = await postComment(owner.cookies, { content: 'stable' });
    const res = await request
      .patch(commentUrl(ws.slug, issue.id, created.card.id))
      .set('Cookie', owner.cookies)
      .send({ content: 'stable' });
    expect(res.status).toBe(200);
    expect(dataOf<CommentCard>(res).editedAt).toBeNull();

    const dbRow = await prisma.comment.findUnique({
      where: { id: created.card.id },
    });
    expect(dbRow?.editedAt).toBeNull();
  });

  it('non-author Member gets 403 NOT_COMMENT_AUTHOR', async () => {
    const author = await addMember(uniqueEmail('author'));
    const other = await addMember(uniqueEmail('other'));
    const created = await postComment(author.cookies, { content: 'mine' });

    const res = await createTestApp()
      .patch(commentUrl(ws.slug, issue.id, created.card.id))
      .set('Cookie', other.cookies)
      .send({ content: 'hijack' });
    expect(res.status).toBe(403);
    expect(errorCodeOf(res)).toBe('NOT_COMMENT_AUTHOR');
  });

  it('non-author Owner gets the same 403 — no role override', async () => {
    const author = await addMember(uniqueEmail('author2'));
    const created = await postComment(author.cookies, { content: 'mine' });

    const edit = await request
      .patch(commentUrl(ws.slug, issue.id, created.card.id))
      .set('Cookie', owner.cookies)
      .send({ content: 'owner override' });
    expect(edit.status).toBe(403);
    expect(errorCodeOf(edit)).toBe('NOT_COMMENT_AUTHOR');

    const del = await request
      .delete(commentUrl(ws.slug, issue.id, created.card.id))
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(del.status).toBe(403);
    expect(errorCodeOf(del)).toBe('NOT_COMMENT_AUTHOR');
  });

  // ── Delete (#5: author-only) ───────────────────────────────────────────

  it('author deletes own comment with confirm — row gone, no tombstone', async () => {
    const created = await postComment(owner.cookies, { content: 'bye' });
    const res = await request
      .delete(commentUrl(ws.slug, issue.id, created.card.id))
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(res.status).toBe(200);
    expect(dataOf<{ deletedCommentId: string }>(res)).toEqual({
      deletedCommentId: created.card.id,
    });
    expect(
      await prisma.comment.findUnique({ where: { id: created.card.id } }),
    ).toBeNull();
  });

  it('delete without confirm is 400 CONFIRMATION_REQUIRED', async () => {
    const created = await postComment(owner.cookies, { content: 'keep' });
    const res = await request
      .delete(commentUrl(ws.slug, issue.id, created.card.id))
      .set('Cookie', owner.cookies)
      .send({});
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  // ── Archived-issue freeze-all (D9) ─────────────────────────────────────

  it('archived issue rejects create/edit/delete (409) but reads stay 200', async () => {
    const member = await addMember(uniqueEmail('frozen'));
    const created = await postComment(member.cookies, { content: 'before' });
    await request
      .post(`/api/v1/workspaces/${ws.slug}/issues/${issue.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const create = await postComment(member.cookies, { content: 'after' });
    expect(create.status).toBe(409);
    expect(errorCodeOf(create.res)).toBe('ISSUE_ARCHIVED');

    const edit = await createTestApp()
      .patch(commentUrl(ws.slug, issue.id, created.card.id))
      .set('Cookie', member.cookies)
      .send({ content: 'edit after' });
    expect(edit.status).toBe(409);
    expect(errorCodeOf(edit)).toBe('ISSUE_ARCHIVED');

    const del = await createTestApp()
      .delete(commentUrl(ws.slug, issue.id, created.card.id))
      .set('Cookie', member.cookies)
      .send({ confirm: true });
    expect(del.status).toBe(409);
    expect(errorCodeOf(del)).toBe('ISSUE_ARCHIVED');

    const list = await request
      .get(commentsUrl(ws.slug, issue.id))
      .set('Cookie', member.cookies);
    expect(list.status).toBe(200);
    expect(dataOf<{ comments: CommentCard[] }>(list).comments).toHaveLength(1);

    const detail = await request
      .get(commentUrl(ws.slug, issue.id, created.card.id))
      .set('Cookie', member.cookies);
    expect(detail.status).toBe(200);
  });

  it('archived+foreign returns the freeze code, not the authorship code', async () => {
    const author = await addMember(uniqueEmail('author3'));
    const outsider = await addMember(uniqueEmail('outsider'));
    const created = await postComment(author.cookies, { content: 'mine' });
    await request
      .post(`/api/v1/workspaces/${ws.slug}/issues/${issue.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const res = await createTestApp()
      .patch(commentUrl(ws.slug, issue.id, created.card.id))
      .set('Cookie', outsider.cookies)
      .send({ content: 'hijack' });
    expect(res.status).toBe(409);
    expect(errorCodeOf(res)).toBe('ISSUE_ARCHIVED');
  });

  // ── List (#1, chronological cursor) ────────────────────────────────────

  it('lists oldest-first and walks forward to nextCursor null', async () => {
    await postComment(owner.cookies, { content: 'one' });
    await postComment(owner.cookies, { content: 'two' });
    await postComment(owner.cookies, { content: 'three' });

    const first = await request
      .get(`${commentsUrl(ws.slug, issue.id)}?limit=2`)
      .set('Cookie', owner.cookies);
    const firstPage = dataOf<{
      comments: CommentCard[];
      nextCursor: string | null;
    }>(first);
    expect(firstPage.comments.map((c) => c.content)).toEqual(['one', 'two']);
    expect(firstPage.nextCursor).toBeTruthy();

    const second = await request
      .get(
        `${commentsUrl(ws.slug, issue.id)}?limit=2&cursor=${firstPage.nextCursor}`,
      )
      .set('Cookie', owner.cookies);
    const secondPage = dataOf<{
      comments: CommentCard[];
      nextCursor: string | null;
    }>(second);
    expect(secondPage.comments.map((c) => c.content)).toEqual(['three']);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('rejects bad limit and bogus cursor (400)', async () => {
    await postComment(owner.cookies, { content: 'only' });
    for (const query of ['?limit=0', '?limit=101', '?cursor=bogus']) {
      const res = await request
        .get(`${commentsUrl(ws.slug, issue.id)}${query}`)
        .set('Cookie', owner.cookies);
      expect(res.status).toBe(400);
      expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
    }
  });

  // ── Guard / envelope ───────────────────────────────────────────────────

  it('rejects unauthenticated access to every comment route (401)', async () => {
    const anon = createTestApp();
    const bogus = crypto.randomUUID();
    const res = await Promise.all([
      anon.get(commentsUrl(ws.slug, issue.id)),
      anon.get(commentUrl(ws.slug, issue.id, bogus)),
      anon.post(commentsUrl(ws.slug, issue.id)).send({ content: 'X' }),
      anon.patch(commentUrl(ws.slug, issue.id, bogus)).send({ content: 'X' }),
      anon.delete(commentUrl(ws.slug, issue.id, bogus)).send({ confirm: true }),
    ]);
    for (const r of res) {
      expect(r.status).toBe(401);
      expect(errorResponseSchema.parse(r.body).error.code).toBe('UNAUTHORIZED');
    }
  });

  it('does not leak existence: non-member and unknown slug are identical 404', async () => {
    const outsider = await registerVerifiedUser(
      createTestApp(),
      uniqueEmail('stranger'),
    );
    const nonMemberRes = await createTestApp()
      .get(commentsUrl(ws.slug, issue.id))
      .set('Cookie', outsider.cookies);
    const unknownRes = await createTestApp()
      .get(`/api/v1/workspaces/does-not-exist/issues/${issue.id}/comments`)
      .set('Cookie', outsider.cookies);

    expect(nonMemberRes.status).toBe(404);
    expect(unknownRes.status).toBe(404);
    const code = (r: { body: unknown }) =>
      bodyOf<{ error: { code: string; message: string } }>(r).error;
    expect(code(nonMemberRes).code).toBe('WORKSPACE_NOT_FOUND');
    expect(code(nonMemberRes).message).toBe(code(unknownRes).message);
  });

  it('archived workspace: writes rejected (409), reads allowed (200)', async () => {
    await postComment(owner.cookies, { content: 'Readable' });
    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const write = await request
      .post(commentsUrl(ws.slug, issue.id))
      .set('Cookie', owner.cookies)
      .send({ content: 'Nope' });
    expect(write.status).toBe(409);
    expect(errorCodeOf(write as unknown as { body: unknown })).toBe(
      'WORKSPACE_ARCHIVED',
    );

    const read = await request
      .get(commentsUrl(ws.slug, issue.id))
      .set('Cookie', owner.cookies);
    expect(read.status).toBe(200);
  });
});
