import { prisma } from '../../common/db/client.js';
import type { Prisma } from '../../generated/client.js';

/**
 * Members repository — Prisma access only. No business decisions live here.
 * All workspace-scoped callers pass workspaceId explicitly; no implicit
 * context. Transaction-aware overloads accept an explicit `tx` client.
 */

export type DbClient = Prisma.TransactionClient | typeof prisma;

export const membersRepository = {
  // ── User ────────────────────────────────────────────────────────────────

  findUserById(client: DbClient, userId: string) {
    return client.user.findUnique({ where: { id: userId } });
  },

  findUserByEmailLower(client: DbClient, emailLower: string) {
    // Emails are stored as provided; comparison is via lowercased input.
    // A case-insensitive lookup without DB collation.
    return client.user.findFirst({
      where: { email: { equals: emailLower, mode: 'insensitive' } },
    });
  },

  // ── WorkspaceMember ─────────────────────────────────────────────────────

  listMembers(client: DbClient, workspaceId: string) {
    return client.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { name: true, email: true, image: true } } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  },

  findMemberById(client: DbClient, memberId: string) {
    return client.workspaceMember.findUnique({
      where: { id: memberId },
      include: { user: { select: { name: true, email: true, image: true } } },
    });
  },

  findMemberByUserAndWorkspace(
    client: DbClient,
    workspaceId: string,
    userId: string,
  ) {
    return client.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { user: { select: { name: true, email: true, image: true } } },
    });
  },

  isMemberByEmailInWorkspace(
    client: DbClient,
    workspaceId: string,
    emailLower: string,
  ) {
    // Members are found by joining through user.email case-insensitive.
    return client.workspaceMember.findFirst({
      where: {
        workspaceId,
        user: { email: { equals: emailLower, mode: 'insensitive' } },
      },
      select: { id: true },
    });
  },

  findOwnerMember(client: DbClient, workspaceId: string) {
    return client.workspaceMember.findFirst({
      where: { workspaceId, role: 'OWNER' },
      select: { id: true, userId: true },
    });
  },

  // ── Invitation ──────────────────────────────────────────────────────────

  findPendingByWorkspaceAndEmail(
    client: DbClient,
    workspaceId: string,
    emailLower: string,
  ) {
    return client.invitation.findFirst({
      where: {
        workspaceId,
        email: emailLower,
        status: 'PENDING',
      },
    });
  },

  findInvitationById(client: DbClient, invitationId: string) {
    return client.invitation.findUnique({
      where: { id: invitationId },
      include: {
        workspace: { select: { id: true, slug: true, name: true, icon: true } },
      },
    });
  },

  findInvitationByToken(client: DbClient, token: string) {
    return client.invitation.findUnique({
      where: { token },
      include: {
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
            icon: true,
            status: true,
          },
        },
      },
    });
  },

  listInvitations(client: DbClient, workspaceId: string) {
    return client.invitation.findMany({
      where: { workspaceId },
      orderBy: [{ status: 'asc' }, { expiresAt: 'desc' }],
    });
  },

  createInvitation(
    client: DbClient,
    data: {
      workspaceId: string;
      email: string;
      role: 'MEMBER' | 'ADMIN';
      token: string;
      expiresAt: Date;
      createdById: string | null;
    },
  ) {
    return client.invitation.create({ data });
  },

  updateInvitationStatus(
    client: DbClient,
    invitationId: string,
    status: 'ACCEPTED' | 'REVOKED' | 'DECLINED' | 'EXPIRED',
  ) {
    return client.invitation.update({
      where: { id: invitationId },
      data: { status },
    });
  },

  touchInvitation(client: DbClient, invitationId: string) {
    return client.invitation.update({
      where: { id: invitationId },
      data: { updatedAt: new Date() },
    });
  },

  // ── Mutations ───────────────────────────────────────────────────────────

  deleteMember(client: DbClient, memberId: string) {
    return client.workspaceMember.delete({ where: { id: memberId } });
  },

  updateMemberRole(
    client: DbClient,
    memberId: string,
    role: 'MEMBER' | 'ADMIN',
  ) {
    return client.workspaceMember.update({
      where: { id: memberId },
      data: { role },
      include: { user: { select: { name: true, email: true, image: true } } },
    });
  },
};

export type MembersRepository = typeof membersRepository;
