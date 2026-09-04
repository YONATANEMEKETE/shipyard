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

interface LabelCard {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
}

interface IssueLabelRef {
  id: string;
  name: string;
  color: string;
}

interface IssueDetail {
  id: string;
  workspaceId: string;
  seqNumber: number;
  identifier: string;
  title: string;
  status: string;
  labels: IssueLabelRef[];
  archivedAt: string | null;
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

function labelsUrl(slug: string): string {
  return `/api/v1/workspaces/${slug}/labels`;
}
function issuesUrl(slug: string): string {
  return `/api/v1/workspaces/${slug}/issues`;
}

describe('issues labels (integration)', () => {
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

  async function createLabel(
    cookies: string,
    body: Record<string, unknown>,
  ): Promise<{
    status: number;
    res: { status: number; body: unknown };
    card: LabelCard;
  }> {
    const res = await request
      .post(labelsUrl(ws.slug))
      .set('Cookie', cookies)
      .send(body);
    return { status: res.status, res, card: dataOf<LabelCard>(res) };
  }

  async function createIssue(title: string): Promise<IssueDetail> {
    const res = await request
      .post(issuesUrl(ws.slug))
      .set('Cookie', owner.cookies)
      .send({ title });
    expect(res.status).toBe(201);
    return dataOf<IssueDetail>(res);
  }

  // ── Label CRUD (#9–#12) ────────────────────────────────────────────────

  it('creates a label with default color; list is sorted by name', async () => {
    const { status, card } = await createLabel(owner.cookies, { name: 'bug' });
    expect(status).toBe(201);
    expect(card.name).toBe('bug');
    expect(card.color).toBe('#6B7280');
    expect(card.workspaceId).toBeTruthy();

    await createLabel(owner.cookies, { name: 'zebra', color: '#FF0000' });
    await createLabel(owner.cookies, { name: 'apple' });

    const list = await request
      .get(labelsUrl(ws.slug))
      .set('Cookie', owner.cookies);
    expect(list.status).toBe(200);
    expect(
      dataOf<{ labels: LabelCard[] }>(list).labels.map((l) => l.name),
    ).toEqual(['apple', 'bug', 'zebra']);
  });

  it('trims names and rejects bad colors (400)', async () => {
    const trimmed = await createLabel(owner.cookies, { name: '  spaced  ' });
    expect(trimmed.status).toBe(201);
    expect(trimmed.card.name).toBe('spaced');

    for (const body of [
      {},
      { name: '   ' },
      { name: 'ok', color: 'red' },
      { name: 'ok', color: '#FFF' },
    ]) {
      const res = await createLabel(owner.cookies, body);
      expect(res.status).toBe(400);
      expect(errorCodeOf(res.res)).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects duplicate names case-insensitively (409 LABEL_NAME_CONFLICT)', async () => {
    await createLabel(owner.cookies, { name: 'Bug' });
    const dup = await createLabel(owner.cookies, { name: 'bug' });
    expect(dup.status).toBe(409);
    expect(errorCodeOf(dup.res)).toBe('LABEL_NAME_CONFLICT');
  });

  it('renames/recolors; rename conflict is 409; name freed after delete', async () => {
    const a = await createLabel(owner.cookies, { name: 'alpha' });
    await createLabel(owner.cookies, { name: 'beta' });

    const renamed = await request
      .patch(`${labelsUrl(ws.slug)}/${a.card.id}`)
      .set('Cookie', owner.cookies)
      .send({ name: 'Alpha Prime', color: '#00FF00' });
    expect(renamed.status).toBe(200);
    const card = dataOf<LabelCard>(renamed);
    expect(card.name).toBe('Alpha Prime');
    expect(card.color).toBe('#00FF00');

    const clash = await request
      .patch(`${labelsUrl(ws.slug)}/${a.card.id}`)
      .set('Cookie', owner.cookies)
      .send({ name: 'BETA' });
    expect(clash.status).toBe(409);
    expect(errorCodeOf(clash)).toBe('LABEL_NAME_CONFLICT');

    const del = await request
      .delete(`${labelsUrl(ws.slug)}/${a.card.id}`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(del.status).toBe(200);
    expect(
      dataOf<{ deletedLabelId: string; unlinkedIssues: number }>(del),
    ).toEqual({
      deletedLabelId: a.card.id,
      unlinkedIssues: 0,
    });

    const reuse = await createLabel(owner.cookies, { name: 'alpha prime' });
    expect(reuse.status).toBe(201);
  });

  it('unknown label id is 404 LABEL_NOT_FOUND', async () => {
    // ws.id is a valid cuid but not a label — passes validation, misses scope.
    const res = await request
      .patch(`${labelsUrl(ws.slug)}/${ws.id}`)
      .set('Cookie', owner.cookies)
      .send({ name: 'ghost' });
    expect(res.status).toBe(404);
    expect(errorCodeOf(res)).toBe('LABEL_NOT_FOUND');
  });

  it('delete without confirm is 400', async () => {
    const created = await createLabel(owner.cookies, { name: 'temp' });
    const res = await request
      .delete(`${labelsUrl(ws.slug)}/${created.card.id}`)
      .set('Cookie', owner.cookies)
      .send({});
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  it('member can run the whole label lifecycle (no role gate on labels)', async () => {
    const member = await addMember(uniqueEmail('labeler'));
    const created = await createLabel(member.cookies, { name: 'member-tag' });
    expect(created.status).toBe(201);

    const renamed = await createTestApp()
      .patch(`${labelsUrl(ws.slug)}/${created.card.id}`)
      .set('Cookie', member.cookies)
      .send({ name: 'member-tag-2' });
    expect(renamed.status).toBe(200);

    const deleted = await createTestApp()
      .delete(`${labelsUrl(ws.slug)}/${created.card.id}`)
      .set('Cookie', member.cookies)
      .send({ confirm: true });
    expect(deleted.status).toBe(200);
  });

  // ── Attach / detach (#13 / #14) ────────────────────────────────────────

  it('attaches and detaches with LABEL_ADDED / LABEL_REMOVED history', async () => {
    const issue = await createIssue('Labeled');
    const label = await createLabel(owner.cookies, { name: 'ui' });

    const attached = await request
      .post(`${issuesUrl(ws.slug)}/${issue.id}/labels`)
      .set('Cookie', owner.cookies)
      .send({ labelId: label.card.id });
    expect(attached.status).toBe(200);
    expect(dataOf<IssueDetail>(attached).labels.map((l) => l.name)).toEqual([
      'ui',
    ]);

    const history = await request
      .get(`${issuesUrl(ws.slug)}/${issue.id}/history`)
      .set('Cookie', owner.cookies);
    const events = dataOf<{
      history: { event: string; newValue: string | null }[];
    }>(history).history;
    expect(events.map((h) => h.event)).toEqual(['CREATED', 'LABEL_ADDED']);
    expect(events[1]!.newValue).toBe(label.card.id);

    const detached = await request
      .delete(`${issuesUrl(ws.slug)}/${issue.id}/labels/${label.card.id}`)
      .set('Cookie', owner.cookies);
    expect(detached.status).toBe(200);
    expect(dataOf<IssueDetail>(detached).labels).toEqual([]);
  });

  it('creates an issue with labelIds attached up front', async () => {
    const a = await createLabel(owner.cookies, { name: 'one' });
    const b = await createLabel(owner.cookies, { name: 'two' });
    const res = await request
      .post(issuesUrl(ws.slug))
      .set('Cookie', owner.cookies)
      .send({ title: 'Pre-labeled', labelIds: [a.card.id, b.card.id] });
    expect(res.status).toBe(201);
    expect(
      dataOf<IssueDetail>(res)
        .labels.map((l) => l.name)
        .sort(),
    ).toEqual(['one', 'two']);
  });

  it('double-attach is 409 LABEL_ALREADY_ATTACHED', async () => {
    const issue = await createIssue('Double');
    const label = await createLabel(owner.cookies, { name: 'dup' });
    await request
      .post(`${issuesUrl(ws.slug)}/${issue.id}/labels`)
      .set('Cookie', owner.cookies)
      .send({ labelId: label.card.id });

    const again = await request
      .post(`${issuesUrl(ws.slug)}/${issue.id}/labels`)
      .set('Cookie', owner.cookies)
      .send({ labelId: label.card.id });
    expect(again.status).toBe(409);
    expect(errorCodeOf(again)).toBe('LABEL_ALREADY_ATTACHED');
  });

  it('detach-missing is 409 LABEL_NOT_ATTACHED; unknown label is 404', async () => {
    const issue = await createIssue('Detachable');
    const label = await createLabel(owner.cookies, { name: 'loose' });

    const missing = await request
      .delete(`${issuesUrl(ws.slug)}/${issue.id}/labels/${label.card.id}`)
      .set('Cookie', owner.cookies);
    expect(missing.status).toBe(409);
    expect(errorCodeOf(missing)).toBe('LABEL_NOT_ATTACHED');

    // ws.id passes cuid validation but matches no label in this workspace.
    const unknown = await request
      .delete(`${issuesUrl(ws.slug)}/${issue.id}/labels/${ws.id}`)
      .set('Cookie', owner.cookies);
    expect(unknown.status).toBe(404);
    expect(errorCodeOf(unknown)).toBe('LABEL_NOT_FOUND');
  });

  it('attach rejects a cross-workspace label (404 LABEL_NOT_IN_WORKSPACE)', async () => {
    const foreign = await (async () => {
      const user = await registerVerifiedUser(
        createTestApp(),
        uniqueEmail('foreign'),
      );
      const res = await createTestApp()
        .post('/api/v1/workspaces')
        .set('Cookie', user.cookies)
        .send({ name: 'Foreign Workspace' });
      const slug = dataOf<WsResp>(res).slug;
      const created = await createTestApp()
        .post(`/api/v1/workspaces/${slug}/labels`)
        .set('Cookie', user.cookies)
        .send({ name: 'foreign-tag' });
      return { slug, labelId: dataOf<LabelCard>(created).id };
    })();
    void foreign.slug;

    const issue = await createIssue('Local');
    const res = await request
      .post(`${issuesUrl(ws.slug)}/${issue.id}/labels`)
      .set('Cookie', owner.cookies)
      .send({ labelId: foreign.labelId });
    expect(res.status).toBe(404);
    expect(errorCodeOf(res)).toBe('LABEL_NOT_IN_WORKSPACE');
  });

  it('attach/detach on an archived issue is 409 ISSUE_ARCHIVED', async () => {
    const issue = await createIssue('Frozen labels');
    const label = await createLabel(owner.cookies, { name: 'ice' });
    await request
      .post(`${issuesUrl(ws.slug)}/${issue.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const attach = await request
      .post(`${issuesUrl(ws.slug)}/${issue.id}/labels`)
      .set('Cookie', owner.cookies)
      .send({ labelId: label.card.id });
    expect(attach.status).toBe(409);
    expect(errorCodeOf(attach)).toBe('ISSUE_ARCHIVED');

    // Label ops on the label itself still work — labels are workspace entities.
    const rename = await request
      .patch(`${labelsUrl(ws.slug)}/${label.card.id}`)
      .set('Cookie', owner.cookies)
      .send({ name: 'ice-2' });
    expect(rename.status).toBe(200);
  });

  it('deleting a label unlinks it — issues survive with the count', async () => {
    const first = await createIssue('First');
    const second = await createIssue('Second');
    const label = await createLabel(owner.cookies, { name: 'shared' });
    for (const issue of [first, second]) {
      await request
        .post(`${issuesUrl(ws.slug)}/${issue.id}/labels`)
        .set('Cookie', owner.cookies)
        .send({ labelId: label.card.id });
    }

    const del = await request
      .delete(`${labelsUrl(ws.slug)}/${label.card.id}`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(del.status).toBe(200);
    expect(
      dataOf<{ deletedLabelId: string; unlinkedIssues: number }>(del),
    ).toEqual({ deletedLabelId: label.card.id, unlinkedIssues: 2 });

    for (const issue of [first, second]) {
      const res = await request
        .get(`${issuesUrl(ws.slug)}/${issue.id}`)
        .set('Cookie', owner.cookies);
      expect(res.status).toBe(200);
      expect(dataOf<IssueDetail>(res).labels).toEqual([]);
    }
    expect(
      await prisma.issueLabel.count({ where: { labelId: label.card.id } }),
    ).toBe(0);
  });

  it('archived workspace rejects label writes but allows the list (409/200)', async () => {
    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const write = await request
      .post(labelsUrl(ws.slug))
      .set('Cookie', owner.cookies)
      .send({ name: 'nope' });
    expect(write.status).toBe(409);
    expect(errorCodeOf(write)).toBe('WORKSPACE_ARCHIVED');

    const read = await request
      .get(labelsUrl(ws.slug))
      .set('Cookie', owner.cookies);
    expect(read.status).toBe(200);
  });

  // ── Guard / envelope ───────────────────────────────────────────────────

  it('rejects unauthenticated access to every label route (401)', async () => {
    const anon = createTestApp();
    const bogus = crypto.randomUUID();
    const res = await Promise.all([
      anon.get(labelsUrl(ws.slug)),
      anon.post(labelsUrl(ws.slug)).send({ name: 'X' }),
      anon.patch(`${labelsUrl(ws.slug)}/${bogus}`).send({}),
      anon.delete(`${labelsUrl(ws.slug)}/${bogus}`).send({ confirm: true }),
      anon.delete(`${issuesUrl(ws.slug)}/${bogus}/labels/${bogus}`),
    ]);
    for (const r of res) {
      expect(r.status).toBe(401);
      expect(errorResponseSchema.parse(r.body).error.code).toBe('UNAUTHORIZED');
    }
  });
});
