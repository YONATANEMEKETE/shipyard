import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

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
import type { ActivityKind } from '@shipyard/shared';
import { prisma } from '../../../../src/common/db/client.js';
import { activityService } from '../../../../src/features/activity/service.js';
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
  createdAt: string;
  createdById: string | null;
}

interface ActivityRow {
  id: string;
  workspaceId: string;
  actorId: string | null;
  actorName: string;
  kind: string;
  entityType: string;
  entityId: string | null;
  entityTitle: string | null;
  summary: string;
}

describe('members activity emission (integration)', () => {
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

  /** All activity rows for the workspace, oldest first. */
  async function activityRows(): Promise<ActivityRow[]> {
    return prisma.activityEvent.findMany({
      where: { workspaceId: ws.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async function kindCount(kind: ActivityKind): Promise<number> {
    return prisma.activityEvent.count({ where: { workspaceId: ws.id, kind } });
  }

  /** Invites one fresh email as MEMBER; returns the invitation card. */
  async function invite(email: string): Promise<InvitationCard> {
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/invitations`)
      .set('Cookie', owner.cookies)
      .send({ emails: [email], role: 'MEMBER' });
    expect(res.status).toBe(201);
    return dataOf<{ invitations: InvitationCard[] }>(res).invitations[0]!;
  }

  // ── MEMBER_INVITED ─────────────────────────────────────────────────────

  it('batch invite emits one MEMBER_INVITED row per invitation, invitee by email (D4)', async () => {
    const before = await kindCount('MEMBER_INVITED');
    const emails = [uniqueEmail('carol'), uniqueEmail('dave')];

    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/invitations`)
      .set('Cookie', owner.cookies)
      .send({ emails, role: 'MEMBER' });
    expect(res.status).toBe(201);

    const rows = (await activityRows()).filter(
      (r) => r.kind === 'MEMBER_INVITED',
    );
    expect(rows).toHaveLength(before + 2);
    const fresh = rows.slice(-2);
    expect(fresh.map((r) => r.entityType)).toEqual([
      'INVITATION',
      'INVITATION',
    ]);
    expect(fresh.map((r) => r.entityTitle)).toEqual(emails);
    for (const row of fresh) {
      expect(row.actorId).toBe(owner.userId);
      expect(row.actorName).toBe('Test User');
      expect(row.summary).toContain(row.entityTitle ?? '');
    }
  });

  it('failed activity write rolls the whole invite batch back (D2 strictness)', async () => {
    const recordSpy = vi.spyOn(activityService, 'record');
    recordSpy.mockImplementation((event) => {
      if (event.kind === 'MEMBER_INVITED') {
        return Promise.reject(new Error('activity write failed'));
      }
      return Promise.resolve();
    });

    const email = uniqueEmail('erin');
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/invitations`)
      .set('Cookie', owner.cookies)
      .send({ emails: [email], role: 'MEMBER' });
    expect(res.status).toBeGreaterThanOrEqual(500);

    recordSpy.mockRestore();
    // No sourceless events: no invitation row survived the failed log write.
    const pending = await prisma.invitation.findFirst({
      where: { workspaceId: ws.id, email, status: 'PENDING' },
    });
    expect(pending).toBeNull();
  });

  // ── MEMBER_JOINED / MEMBER_DECLINED / MEMBER_INVITE_REVOKED ────────────

  it('accept emits exactly one MEMBER_JOINED row with the invitee email as actor (D4)', async () => {
    const before = await kindCount('MEMBER_JOINED');
    const email = uniqueEmail('frank');
    const invitation = await invite(email);
    const user = await registerVerifiedUser(createTestApp(), email);

    const res = await createTestApp()
      .post(`/api/v1/invitations/${invitation.token}/accept`)
      .set('Cookie', user.cookies)
      .send({});
    expect(res.status).toBe(201);

    const rows = (await activityRows()).filter(
      (r) => r.kind === 'MEMBER_JOINED',
    );
    expect(rows).toHaveLength(before + 1);
    const row = rows.at(-1)!;
    expect(row.actorId).toBe(user.userId);
    expect(row.actorName).toBe(email);
    expect(row.entityType).toBe('INVITATION');
    expect(row.entityId).toBe(invitation.id);
    expect(row.entityTitle).toBe(email);
    expect(row.summary).toContain(email);
  });

  it('decline emits exactly one MEMBER_DECLINED row', async () => {
    const before = await kindCount('MEMBER_DECLINED');
    const invitation = await invite(uniqueEmail('gina'));
    const user = await registerVerifiedUser(createTestApp(), invitation.email);

    const res = await createTestApp()
      .post(`/api/v1/invitations/${invitation.token}/decline`)
      .set('Cookie', user.cookies)
      .send({});
    expect(res.status).toBe(200);

    const rows = (await activityRows()).filter(
      (r) => r.kind === 'MEMBER_DECLINED',
    );
    expect(rows).toHaveLength(before + 1);
    const row = rows.at(-1)!;
    expect(row.actorId).toBe(user.userId);
    expect(row.actorName).toBe(invitation.email);
    expect(row.entityId).toBe(invitation.id);
  });

  it('revoke emits exactly one MEMBER_INVITE_REVOKED row', async () => {
    const before = await kindCount('MEMBER_INVITE_REVOKED');
    const invitation = await invite(uniqueEmail('henry'));

    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/invitations/${invitation.id}/revoke`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(res.status).toBe(200);

    const rows = (await activityRows()).filter(
      (r) => r.kind === 'MEMBER_INVITE_REVOKED',
    );
    expect(rows).toHaveLength(before + 1);
    const row = rows.at(-1)!;
    expect(row.actorId).toBe(owner.userId);
    expect(row.actorName).toBe('Test User');
    expect(row.entityTitle).toBe(invitation.email);
  });

  it('resend emits nothing (re-touch, not a lifecycle change)', async () => {
    const invitation = await invite(uniqueEmail('iris'));
    const baseline = await activityRows();

    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/invitations/${invitation.id}/resend`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(res.status).toBe(200);

    expect(await activityRows()).toEqual(baseline);
  });

  // ── MEMBER_ROLE_CHANGED / OWNERSHIP_TRANSFERRED ────────────────────────

  it('role change emits one row with old→new role in the summary', async () => {
    const before = await kindCount('MEMBER_ROLE_CHANGED');

    const res = await request
      .patch(`/api/v1/workspaces/${ws.slug}/members/${alice.memberId}/role`)
      .set('Cookie', owner.cookies)
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(200);

    const rows = (await activityRows()).filter(
      (r) => r.kind === 'MEMBER_ROLE_CHANGED',
    );
    expect(rows).toHaveLength(before + 1);
    const row = rows.at(-1)!;
    expect(row.actorId).toBe(owner.userId);
    expect(row.entityType).toBe('MEMBER');
    expect(row.entityId).toBe(alice.memberId);
    expect(row.entityTitle).toBe('Test User');
    expect(row.summary).toMatch(/from MEMBER to ADMIN/u);
  });

  it('ownership transfer emits exactly one OWNERSHIP_TRANSFERRED row and no role rows', async () => {
    const beforeTransfer = await kindCount('OWNERSHIP_TRANSFERRED');
    const beforeRole = await kindCount('MEMBER_ROLE_CHANGED');

    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/transfer-ownership`)
      .set('Cookie', owner.cookies)
      .send({ targetMemberId: alice.memberId });
    expect(res.status).toBe(200);

    const rows = await activityRows();
    const transferred = rows.filter((r) => r.kind === 'OWNERSHIP_TRANSFERRED');
    expect(transferred).toHaveLength(beforeTransfer + 1);
    const row = transferred.at(-1)!;
    expect(row.actorId).toBe(owner.userId);
    expect(row.entityType).toBe('MEMBER');
    expect(row.entityId).toBe(alice.memberId);
    expect(row.summary).toMatch(/transferred ownership to/u);
    // The swap is one narrative event, not two role-change rows.
    expect(await kindCount('MEMBER_ROLE_CHANGED')).toBe(beforeRole);
  });

  // ── MEMBER_REMOVED / MEMBER_LEFT ───────────────────────────────────────

  it('remove emits one MEMBER_REMOVED row narrating the cascade counts', async () => {
    // Give bob one owned project and one assigned issue so the removal
    // cascade has something to narrate in the summary. Only Owner/Admin can
    // create projects, so the owner creates it and transfers it to bob.
    const projRes = await request
      .post(`/api/v1/workspaces/${ws.slug}/projects`)
      .set('Cookie', owner.cookies)
      .send({ name: 'Bob Project' });
    expect(projRes.status).toBe(201);
    const projectId = dataOf<{ id: string }>(projRes).id;
    const transferRes = await request
      .post(
        `/api/v1/workspaces/${ws.slug}/projects/${projectId}/transfer-owner`,
      )
      .set('Cookie', owner.cookies)
      .send({ targetMemberId: bob.memberId });
    expect(transferRes.status).toBe(200);
    const issueRes = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues`)
      .set('Cookie', owner.cookies)
      .send({ title: 'Bob issue', assigneeId: bob.userId });
    expect(issueRes.status).toBe(201);

    const before = await kindCount('MEMBER_REMOVED');
    const beforeOwnerTransfers = await kindCount('PROJECT_OWNER_TRANSFERRED');
    const beforeAssignments = await kindCount('ISSUE_ASSIGNED');
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/members/${bob.memberId}/remove`)
      .set('Cookie', owner.cookies)
      .send({ confirm: true });
    expect(res.status).toBe(200);

    const rows = (await activityRows()).filter(
      (r) => r.kind === 'MEMBER_REMOVED',
    );
    expect(rows).toHaveLength(before + 1);
    const row = rows.at(-1)!;
    expect(row.actorId).toBe(owner.userId);
    expect(row.entityType).toBe('MEMBER');
    expect(row.entityId).toBe(bob.memberId);
    expect(row.summary).toMatch(/removed Test User from the workspace/u);
    expect(row.summary).toContain('1 project transferred');
    expect(row.summary).toContain('1 issue unassigned');
    // Cascade stays narrated, not emitted as project/issue event rows.
    expect(await kindCount('PROJECT_OWNER_TRANSFERRED')).toBe(
      beforeOwnerTransfers,
    );
    expect(await kindCount('ISSUE_ASSIGNED')).toBe(beforeAssignments);
  });

  it('leave emits one MEMBER_LEFT row', async () => {
    const before = await kindCount('MEMBER_LEFT');
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/leave`)
      .set('Cookie', alice.cookies)
      .send({ confirm: true });
    expect(res.status).toBe(200);

    const rows = (await activityRows()).filter((r) => r.kind === 'MEMBER_LEFT');
    expect(rows).toHaveLength(before + 1);
    const row = rows.at(-1)!;
    expect(row.actorId).toBe(alice.userId);
    expect(row.entityType).toBe('MEMBER');
    expect(row.entityId).toBe(alice.memberId);
    expect(row.summary).toMatch(/left the workspace/u);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
