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

  // last sendEmail call is the verification email; extract token
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

interface OwnerCard {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
}

interface ProjectCard {
  id: string;
  workspaceId: string;
  name: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  owner: OwnerCard;
  startDate: string | null;
  targetDate: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectDetail extends ProjectCard {
  description: string | null;
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

function projectsUrl(slug: string): string {
  return `/api/v1/workspaces/${slug}/projects`;
}

describe('projects lifecycle (integration)', () => {
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
  }> {
    const foreign = await registerVerifiedUser(
      createTestApp(),
      uniqueEmail('foreign'),
    );
    const res = await createTestApp()
      .post('/api/v1/workspaces')
      .set('Cookie', foreign.cookies)
      .send({ name: 'Foreign Workspace' });
    return { slug: dataOf<WsResp>(res).slug, cookies: foreign.cookies };
  }

  async function createProject(
    cookies: string,
    body: Record<string, unknown>,
  ): Promise<{
    status: number;
    res: { status: number; body: unknown };
    detail: ProjectDetail;
  }> {
    const res = await request
      .post(projectsUrl(ws.slug))
      .set('Cookie', cookies)
      .send(body);
    return { status: res.status, res, detail: dataOf<ProjectDetail>(res) };
  }

  // ── Create (#3) ────────────────────────────────────────────────────────

  it('creates a project — creator is owner, status ACTIVE', async () => {
    const { status, detail } = await createProject(owner.cookies, {
      name: 'Ship Payroll',
      description: 'Monthly payroll runs',
      targetDate: '2026-12-01',
    });
    expect(status).toBe(201);
    expect(detail.name).toBe('Ship Payroll');
    expect(detail.description).toBe('Monthly payroll runs');
    expect(detail.status).toBe('ACTIVE');
    expect(detail.owner.userId).toBe(owner.userId);
    expect(detail.targetDate).toBe('2026-12-01');
    expect(detail.archivedAt).toBeNull();
    expect(detail.id).toBeTruthy();

    const dbRow = await prisma.project.findUnique({ where: { id: detail.id } });
    expect(dbRow?.ownerId).toBe(owner.userId);
  });

  it('create trims the name and rejects an empty one (400)', async () => {
    const trimmed = await createProject(owner.cookies, {
      name: '   Leading   ',
    });
    expect(trimmed.status).toBe(201);
    expect(trimmed.detail.name).toBe('Leading');

    const empty = await createProject(owner.cookies, { name: '   ' });
    expect(empty.status).toBe(400);
    expect(errorCodeOf(empty.res)).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate name case-insensitively (409 PROJECT_NAME_CONFLICT)', async () => {
    await createProject(owner.cookies, { name: 'Payroll' });
    const dup = await createProject(owner.cookies, { name: 'payroll' });
    expect(dup.status).toBe(409);
    expect(errorCodeOf(dup.res)).toBe('PROJECT_NAME_CONFLICT');
  });

  it('name is freed after delete — recreate succeeds', async () => {
    const created = await createProject(owner.cookies, { name: 'Pipeline' });
    const del = await request
      .delete(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', owner.cookies)
      .send({ confirmName: 'Pipeline' });
    expect(del.status).toBe(200);

    const recreate = await createProject(owner.cookies, { name: 'pipeline' });
    expect(recreate.status).toBe(201);
  });

  it('validates create body (400 VALIDATION_ERROR)', async () => {
    const badRes = await request
      .post(projectsUrl(ws.slug))
      .set('Cookie', owner.cookies)
      .send({ name: 'X', targetDate: 'not-a-date' });
    expect(badRes.status).toBe(400);
    expect(errorCodeOf(badRes)).toBe('VALIDATION_ERROR');

    const missing = await request
      .post(projectsUrl(ws.slug))
      .set('Cookie', owner.cookies)
      .send({});
    expect(missing.status).toBe(400);
  });

  it('member cannot create (403 FORBIDDEN_ROLE); admin can', async () => {
    const member = await addMember(uniqueEmail('member-creator'));
    const forbidden = await request
      .post(projectsUrl(ws.slug))
      .set('Cookie', member.cookies)
      .send({ name: 'Blocked' });
    expect(forbidden.status).toBe(403);
    expect(errorCodeOf(forbidden)).toBe('FORBIDDEN_ROLE');

    const admin = await addMember(uniqueEmail('admin-creator'), 'ADMIN');
    const ok = await request
      .post(projectsUrl(ws.slug))
      .set('Cookie', admin.cookies)
      .send({ name: 'Admin Project' });
    expect(ok.status).toBe(201);
  });

  it('cannot create in an archived workspace (409 WORKSPACE_ARCHIVED)', async () => {
    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const res = await request
      .post(projectsUrl(ws.slug))
      .set('Cookie', owner.cookies)
      .send({ name: 'Nope' });
    expect(res.status).toBe(409);
    expect(errorCodeOf(res)).toBe('WORKSPACE_ARCHIVED');
  });

  // ── List (#1) ──────────────────────────────────────────────────────────

  it('lists non-archived projects by default', async () => {
    await createProject(owner.cookies, { name: 'Alpha' });
    await createProject(owner.cookies, { name: 'Beta' });

    const res = await request
      .get(projectsUrl(ws.slug))
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(200);
    const list = dataOf<{ projects: ProjectCard[] }>(res);
    expect(list.projects.map((p) => p.name).sort()).toEqual(['Alpha', 'Beta']);
  });

  it('list filters by status and ownerId', async () => {
    const member = await addMember(uniqueEmail('filter-member'));
    const a = await createProject(owner.cookies, { name: 'Active One' });
    const b = await createProject(owner.cookies, { name: 'Planned One' });
    // `status` cannot be set at create; switch it via PATCH.
    await request
      .patch(`${projectsUrl(ws.slug)}/${b.detail.id}`)
      .set('Cookie', owner.cookies)
      .send({ status: 'PLANNED' });
    void a;

    const byStatus = await request
      .get(`${projectsUrl(ws.slug)}?status=PLANNED`)
      .set('Cookie', owner.cookies);
    const planned = dataOf<{ projects: ProjectCard[] }>(byStatus).projects;
    expect(planned).toHaveLength(1);
    expect(planned[0]!.name).toBe('Planned One');

    const byOwner = await request
      .get(`${projectsUrl(ws.slug)}?ownerId=${member.userId}`)
      .set('Cookie', owner.cookies);
    expect(dataOf<{ projects: ProjectCard[] }>(byOwner).projects).toHaveLength(
      0,
    );
  });

  it('list sort and order are honored', async () => {
    await createProject(owner.cookies, { name: 'Zulu' });
    await createProject(owner.cookies, { name: 'Alpha' });

    const byNameAsc = await request
      .get(`${projectsUrl(ws.slug)}?sort=name&order=asc`)
      .set('Cookie', owner.cookies);
    const names = dataOf<{ projects: ProjectCard[] }>(byNameAsc).projects.map(
      (p) => p.name,
    );
    expect(names).toEqual(['Alpha', 'Zulu']);
  });

  it('archived flag returns only archived; default excludes them', async () => {
    const created = await createProject(owner.cookies, { name: 'ToArchive' });
    await request
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const defaultList = await request
      .get(projectsUrl(ws.slug))
      .set('Cookie', owner.cookies);
    expect(
      dataOf<{ projects: ProjectCard[] }>(defaultList).projects,
    ).toHaveLength(0);

    const archivedList = await request
      .get(`${projectsUrl(ws.slug)}?archived=true`)
      .set('Cookie', owner.cookies);
    const archived = dataOf<{ projects: ProjectCard[] }>(archivedList).projects;
    expect(archived).toHaveLength(1);
    expect(archived[0]!.archivedAt).not.toBeNull();
  });

  it('list validates query params (400)', async () => {
    const badSort = await request
      .get(`${projectsUrl(ws.slug)}?sort=bogus`)
      .set('Cookie', owner.cookies);
    expect(badSort.status).toBe(400);
    expect(errorCodeOf(badSort)).toBe('VALIDATION_ERROR');

    const badDate = await request
      .get(`${projectsUrl(ws.slug)}?startDate=01-2026`)
      .set('Cookie', owner.cookies);
    expect(badDate.status).toBe(400);
  });

  it('list is readable in an archived workspace', async () => {
    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    await createProject(owner.cookies, { name: 'Readable' });
    const res = await request
      .get(projectsUrl(ws.slug))
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(200);
  });

  // ── Detail (#2) ────────────────────────────────────────────────────────

  it('gets a project detail incl. description', async () => {
    const created = await createProject(owner.cookies, {
      name: 'Detail',
      description: 'Has a description',
    });
    const res = await request
      .get(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(200);
    const detail = dataOf<ProjectDetail>(res);
    expect(detail.description).toBe('Has a description');
    expect(detail.owner.memberId).toBeTruthy();
  });

  it('detail returns an archived project', async () => {
    const created = await createProject(owner.cookies, { name: 'ArchivedD' });
    await request
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const res = await request
      .get(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(200);
    expect(dataOf<ProjectDetail>(res).archivedAt).not.toBeNull();
  });

  it('unknown project id is 404 PROJECT_NOT_FOUND', async () => {
    // ws.id is a real cuid but not a project id — passes path validation while
    // scoping to a project that does not exist in this workspace.
    const res = await request
      .get(`${projectsUrl(ws.slug)}/${ws.id}`)
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(404);
    expect(errorCodeOf(res)).toBe('PROJECT_NOT_FOUND');
  });

  it('cross-workspace project id is 404 (scoped, no leak)', async () => {
    const created = await createProject(owner.cookies, { name: 'Secret' });
    const foreign = await createForeignWorkspace();
    const res = await createTestApp()
      .get(`${projectsUrl(foreign.slug)}/${created.detail.id}`)
      .set('Cookie', foreign.cookies);
    expect(res.status).toBe(404);
    expect(errorCodeOf(res)).toBe('PROJECT_NOT_FOUND');
  });

  // ── Update (#4) ────────────────────────────────────────────────────────

  it('updates fields and switches operational status freely', async () => {
    const created = await createProject(owner.cookies, { name: 'Update' });
    const p = created.detail;

    const res = await request
      .patch(`${projectsUrl(ws.slug)}/${p.id}`)
      .set('Cookie', owner.cookies)
      .send({ name: 'Updated', status: 'COMPLETED', description: 'done' });
    expect(res.status).toBe(200);
    const detail = dataOf<ProjectDetail>(res);
    expect(detail.name).toBe('Updated');
    expect(detail.status).toBe('COMPLETED');
    expect(detail.description).toBe('done');

    // Status switches in any direction, no confirmation.
    const back = await request
      .patch(`${projectsUrl(ws.slug)}/${p.id}`)
      .set('Cookie', owner.cookies)
      .send({ status: 'PLANNED' });
    expect(dataOf<ProjectDetail>(back).status).toBe('PLANNED');
  });

  it('clears optional fields with explicit null', async () => {
    const created = await createProject(owner.cookies, {
      name: 'Clearable',
      description: 'temp',
      targetDate: '2026-01-01',
    });
    const res = await request
      .patch(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', owner.cookies)
      .send({ description: null, targetDate: null });
    const detail = dataOf<ProjectDetail>(res);
    expect(detail.description).toBeNull();
    expect(detail.targetDate).toBeNull();
  });

  it('rename conflict incl. archived reserve (409)', async () => {
    await createProject(owner.cookies, { name: 'Reserved' });
    const mine = await createProject(owner.cookies, { name: 'Mine' });
    const res = await request
      .patch(`${projectsUrl(ws.slug)}/${mine.detail.id}`)
      .set('Cookie', owner.cookies)
      .send({ name: 'reserved' });
    expect(res.status).toBe(409);
    expect(errorCodeOf(res)).toBe('PROJECT_NAME_CONFLICT');
  });

  it('update on an archived project is 409 PROJECT_ARCHIVED', async () => {
    const created = await createProject(owner.cookies, { name: 'Frozen' });
    await request
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const res = await request
      .patch(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', owner.cookies)
      .send({ name: 'Try' });
    expect(res.status).toBe(409);
    expect(errorCodeOf(res)).toBe('PROJECT_ARCHIVED');
  });

  it('member cannot update (403); archived workspace rejects writes (409)', async () => {
    const member = await addMember(uniqueEmail('update-member'));
    const created = await createProject(owner.cookies, { name: 'Editable' });

    const forbidden = await createTestApp()
      .patch(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', member.cookies)
      .send({ name: 'Nope' });
    expect(forbidden.status).toBe(403);

    await request
      .post(`/api/v1/workspaces/${ws.slug}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const archivedWs = await request
      .patch(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', owner.cookies)
      .send({ name: 'NopeWs' });
    expect(archivedWs.status).toBe(409);
    expect(errorCodeOf(archivedWs)).toBe('WORKSPACE_ARCHIVED');
  });

  it('update validates body (400)', async () => {
    const created = await createProject(owner.cookies, { name: 'Valid' });
    const bad = await request
      .patch(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', owner.cookies)
      .send({ startDate: 'nope' });
    expect(bad.status).toBe(400);
    expect(errorCodeOf(bad)).toBe('VALIDATION_ERROR');
  });

  // ── Transfer owner (#5) ────────────────────────────────────────────────

  it('transfers ownership to a member; recipient workspace role unchanged', async () => {
    const member = await addMember(uniqueEmail('transfer-to'));
    const created = await createProject(owner.cookies, { name: 'Owned' });

    const res = await request
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/transfer-owner`)
      .set('Cookie', owner.cookies)
      .send({ targetMemberId: member.memberId });
    expect(res.status).toBe(200);
    const card = dataOf<ProjectCard>(res);
    expect(card.owner.userId).toBe(member.userId);

    // Recipient's workspace role is untouched (ownership grants no permissions).
    const memberRow = await prisma.workspaceMember.findUnique({
      where: { id: member.memberId },
    });
    expect(memberRow?.role).toBe('MEMBER');
  });

  it('transfer to invalid target is 409 TRANSFER_TARGET_INVALID', async () => {
    const created = await createProject(owner.cookies, { name: 'Xfer' });
    // ws.id is a valid cuid but not a workspace member -> passes schema, fails
    // the target-liveness check in the transaction.
    const unknown = await createTestApp()
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/transfer-owner`)
      .set('Cookie', owner.cookies)
      .send({ targetMemberId: ws.id });
    expect(unknown.status).toBe(409);
    expect(errorCodeOf(unknown)).toBe('TRANSFER_TARGET_INVALID');
  });

  it('transfer to the current owner is 409', async () => {
    const created = await createProject(owner.cookies, { name: 'SelfXfer' });
    const ownerMember = dataOf<{ members: MemberCard[] }>(
      await request
        .get(`/api/v1/workspaces/${ws.slug}/members`)
        .set('Cookie', owner.cookies),
    ).members.find((m) => m.role === 'OWNER')!;

    const res = await request
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/transfer-owner`)
      .set('Cookie', owner.cookies)
      .send({ targetMemberId: ownerMember.id });
    expect(res.status).toBe(409);
    expect(errorCodeOf(res)).toBe('TRANSFER_TARGET_INVALID');
  });

  it('transfer on an archived project is 409 PROJECT_ARCHIVED', async () => {
    const member = await addMember(uniqueEmail('xfer-archived'));
    const created = await createProject(owner.cookies, { name: 'ArchivedX' });
    await request
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const res = await request
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/transfer-owner`)
      .set('Cookie', owner.cookies)
      .send({ targetMemberId: member.memberId });
    expect(res.status).toBe(409);
    expect(errorCodeOf(res)).toBe('PROJECT_ARCHIVED');
  });

  it('member cannot transfer (403)', async () => {
    const member = await addMember(uniqueEmail('xfer-member'));
    const created = await createProject(owner.cookies, { name: 'X' });
    const res = await createTestApp()
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/transfer-owner`)
      .set('Cookie', member.cookies)
      .send({ targetMemberId: member.memberId });
    expect(res.status).toBe(403);
    expect(errorCodeOf(res)).toBe('FORBIDDEN_ROLE');
  });

  // ── Archive (#6) / Restore (#7) ───────────────────────────────────────

  it('archive then restore round-trips and preserves operational status', async () => {
    // `status` cannot be set at create (createProjectSchema has no status field;
    // creation always lands ACTIVE), so switch it via PATCH before archiving.
    const created = await createProject(owner.cookies, { name: 'Lifecycle' });
    await request
      .patch(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', owner.cookies)
      .send({ status: 'COMPLETED' });

    const archive = await request
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(archive.status).toBe(200);
    const archived = dataOf<ProjectDetail>(archive);
    expect(archived.archivedAt).not.toBeNull();
    // operational status untouched by archive
    expect(archived.status).toBe('COMPLETED');

    const restore = await request
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/restore`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(restore.status).toBe(200);
    const restored = dataOf<ProjectDetail>(restore);
    expect(restored.archivedAt).toBeNull();
    expect(restored.status).toBe('COMPLETED');
  });

  it('archive an archived project → ALREADY_ARCHIVED; restore a live → NOT_ARCHIVED', async () => {
    const created = await createProject(owner.cookies, { name: 'Stateful' });
    await request
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });

    const double = await request
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(double.status).toBe(409);
    expect(errorCodeOf(double)).toBe('ALREADY_ARCHIVED');

    const live = await createProject(owner.cookies, { name: 'Live' });
    const notArchived = await request
      .post(`${projectsUrl(ws.slug)}/${live.detail.id}/restore`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(notArchived.status).toBe(409);
    expect(errorCodeOf(notArchived)).toBe('NOT_ARCHIVED');
  });

  it('archive/restore without confirm is 400', async () => {
    const created = await createProject(owner.cookies, { name: 'Confirm' });
    const res = await request
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({});
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  it('member cannot archive/restore (403)', async () => {
    const member = await addMember(uniqueEmail('ar-member'));
    const created = await createProject(owner.cookies, { name: 'Ar' });
    const res = await createTestApp()
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/archive`)
      .set('Cookie', member.cookies)
      .send({ confirm: true });
    expect(res.status).toBe(403);
  });

  // ── Delete (#8) ────────────────────────────────────────────────────────

  it('deletes a project with a typed name; response carries unassignedIssues', async () => {
    const created = await createProject(owner.cookies, {
      name: 'Ship Payroll',
    });
    const res = await request
      .delete(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', owner.cookies)
      .send({ confirmName: 'Ship Payroll' });
    expect(res.status).toBe(200);
    const body = dataOf<{ deletedProjectId: string; unassignedIssues: number }>(
      res,
    );
    expect(body.deletedProjectId).toBe(created.detail.id);
    // 0 until F5 wires the issue-unassign leg.
    expect(body.unassignedIssues).toBe(0);

    const gone = await prisma.project.findUnique({
      where: { id: created.detail.id },
    });
    expect(gone).toBeNull();
  });

  it('delete with wrong typed name is 400 CONFIRM_NAME_MISMATCH', async () => {
    const created = await createProject(owner.cookies, {
      name: 'Ship Payroll',
    });
    const res = await request
      .delete(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', owner.cookies)
      .send({ confirmName: 'Wrong' });
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('CONFIRM_NAME_MISMATCH');
  });

  it('delete without a body is 400', async () => {
    const created = await createProject(owner.cookies, { name: 'NoBody' });
    const res = await request
      .delete(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', owner.cookies)
      .send({});
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  it('delete can remove an archived project', async () => {
    const created = await createProject(owner.cookies, { name: 'DelArch' });
    await request
      .post(`${projectsUrl(ws.slug)}/${created.detail.id}/archive`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    const res = await request
      .delete(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', owner.cookies)
      .send({ confirmName: 'DelArch' });
    expect(res.status).toBe(200);
  });

  it('member cannot delete (403)', async () => {
    const member = await addMember(uniqueEmail('del-member'));
    const created = await createProject(owner.cookies, { name: 'Keep' });
    const res = await createTestApp()
      .delete(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', member.cookies)
      .send({ confirmName: 'Keep' });
    expect(res.status).toBe(403);
  });

  // ── View preference (#9 / #10) ─────────────────────────────────────────

  it('view preference defaults to LIST when no row', async () => {
    const res = await request
      .get(`/api/v1/workspaces/${ws.slug}/view-preferences/PROJECT`)
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(200);
    expect(dataOf<{ view: string }>(res).view).toBe('LIST');
  });

  it('sets and reads back a view preference (upsert)', async () => {
    const set = await request
      .put(`/api/v1/workspaces/${ws.slug}/view-preferences/PROJECT`)
      .set('Cookie', owner.cookies)
      .send({ scope: 'PROJECT', view: 'KANBAN' });
    expect(set.status).toBe(200);
    expect(dataOf<{ view: string }>(set).view).toBe('KANBAN');

    const get = await request
      .get(`/api/v1/workspaces/${ws.slug}/view-preferences/PROJECT`)
      .set('Cookie', owner.cookies);
    expect(dataOf<{ view: string }>(get).view).toBe('KANBAN');
  });

  it('set validates view and scope (400)', async () => {
    const set = await request
      .put(`/api/v1/workspaces/${ws.slug}/view-preferences/PROJECT`)
      .set('Cookie', owner.cookies)
      .send({ scope: 'PROJECT', view: 'GRID' });
    expect(set.status).toBe(400);
    expect(errorCodeOf(set)).toBe('VALIDATION_ERROR');

    const unknownScope = await request
      .get(`/api/v1/workspaces/${ws.slug}/view-preferences/BOGUS`)
      .set('Cookie', owner.cookies)
      .send({});
    expect(unknownScope.status).toBe(400);
  });

  // ── Guard / envelope ───────────────────────────────────────────────────

  it('rejects unauthenticated access to every projects route (401)', async () => {
    const anon = createTestApp();
    const res = await Promise.all([
      anon.get(projectsUrl(ws.slug)),
      anon.get(`${projectsUrl(ws.slug)}/${crypto.randomUUID()}`),
      anon.post(projectsUrl(ws.slug)).send({ name: 'X' }),
      anon.patch(`${projectsUrl(ws.slug)}/${crypto.randomUUID()}`).send({}),
      anon
        .post(`${projectsUrl(ws.slug)}/${crypto.randomUUID()}/archive`)
        .send({ confirm: true }),
      anon
        .post(`${projectsUrl(ws.slug)}/${crypto.randomUUID()}/restore`)
        .send({ confirm: true }),
      anon
        .delete(`${projectsUrl(ws.slug)}/${crypto.randomUUID()}`)
        .send({ confirmName: 'X' }),
      anon.get(`/api/v1/workspaces/${ws.slug}/view-preferences/PROJECT`),
    ]);
    for (const r of res) {
      expect(r.status).toBe(401);
      expect(errorResponseSchema.parse(r.body).error.code).toBe('UNAUTHORIZED');
    }
  });

  it('does not leak existence: non-member and unknown slug are identical 404', async () => {
    const outsider = await registerVerifiedUser(
      createTestApp(),
      uniqueEmail('outsider'),
    );
    const nonMemberRes = await createTestApp()
      .get(projectsUrl(ws.slug))
      .set('Cookie', outsider.cookies);
    const unknownRes = await createTestApp()
      .get('/api/v1/workspaces/does-not-exist/projects')
      .set('Cookie', outsider.cookies);

    expect(nonMemberRes.status).toBe(404);
    expect(unknownRes.status).toBe(404);
    const code = (r: { body: unknown }) =>
      bodyOf<{ error: { code: string; message: string } }>(r).error;
    expect(code(nonMemberRes).code).toBe('WORKSPACE_NOT_FOUND');
    expect(code(nonMemberRes).message).toBe(code(unknownRes).message);
  });

  it('member can read project list and detail (any-role reads)', async () => {
    const member = await addMember(uniqueEmail('reader'));
    const created = await createProject(owner.cookies, { name: 'ReadMe' });

    const list = await createTestApp()
      .get(projectsUrl(ws.slug))
      .set('Cookie', member.cookies);
    expect(list.status).toBe(200);
    expect(
      dataOf<{ projects: ProjectCard[] }>(list).projects.some(
        (p) => p.id === created.detail.id,
      ),
    ).toBe(true);

    const detail = await createTestApp()
      .get(`${projectsUrl(ws.slug)}/${created.detail.id}`)
      .set('Cookie', member.cookies);
    expect(detail.status).toBe(200);
  });
});
