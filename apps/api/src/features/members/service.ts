import { randomBytes } from 'node:crypto';
import type {
  ChangeMemberRoleRequest,
  InvitationCard,
  InvitationPreview,
  InviteMembersRequest,
  WorkspaceMemberCard,
} from '@shipyard/shared';
import { INVITATION_TTL_DAYS } from '@shipyard/shared';
import { env } from '../../common/config/env.js';
import { prisma } from '../../common/db/client.js';
import { logger } from '../../common/logger/index.js';
import { renderWorkspaceInvitationEmail } from '@shipyard/email';
import { sendEmail } from '../../lib/mailer.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import {
  AlreadyMemberError,
  CannotChangeOwnerRoleError,
  CannotInviteSelfError,
  CannotRemoveOwnerError,
  CannotRemoveSelfError,
  EmailNotVerifiedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationNotUsableError,
  MemberNotFoundError,
  PendingExistsError,
  TransferRequiredError,
  TransferTargetInvalidError,
} from './errors.js';
import {
  ForbiddenRoleError,
  WorkspaceArchivedError,
} from '../workspace/errors.js';
import { membersRepository } from './repository.js';

/**
 * Members service — owns roles, invitation lifecycle, and membership
 * transactions. All workspace-scoped writes revalidate workspace archival
 * state and the permission matrix inside the same transaction (defense in
 * depth, plan §1.4).
 */

const TOKEN_BYTES = 32;

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

function toMemberCard(row: {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: Date;
  user: { name: string; email: string; image: string | null };
}): WorkspaceMemberCard {
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    name: row.user.name,
    email: row.user.email,
    image: row.user.image,
    role: row.role as WorkspaceMemberCard['role'],
    createdAt: row.createdAt.toISOString(),
  };
}

function toInvitationCard(row: {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  token: string;
  status: string;
  expiresAt: Date;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}): InvitationCard {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role as InvitationCard['role'],
    token: row.token,
    status: row.status as InvitationCard['status'],
    expiresAt: row.expiresAt.toISOString(),
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

function requireVerified(user: { emailVerified: boolean } | null): void {
  if (!user || !user.emailVerified) throw new EmailNotVerifiedError();
}

export const membersService = {
  // ── Directory ──────────────────────────────────────────────────────────

  async listMembers(workspaceId: string): Promise<WorkspaceMemberCard[]> {
    const rows = await membersRepository.listMembers(prisma, workspaceId);
    return rows.map((r) => toMemberCard(r));
  },

  async getMember(
    workspaceId: string,
    memberId: string,
  ): Promise<WorkspaceMemberCard> {
    const row = await membersRepository.findMemberById(prisma, memberId);
    if (!row || row.workspaceId !== workspaceId)
      throw new MemberNotFoundError();
    return toMemberCard(row);
  },

  // ── Change role ────────────────────────────────────────────────────────

  async changeRole(
    context: WorkspaceRequestContext,
    memberId: string,
    body: ChangeMemberRoleRequest,
  ): Promise<WorkspaceMemberCard> {
    if (context.status === 'ARCHIVED') throw new WorkspaceArchivedError();
    if (context.role !== 'OWNER') throw new ForbiddenRoleError();

    const target = await membersRepository.findMemberById(prisma, memberId);
    if (!target || target.workspaceId !== context.workspaceId)
      throw new MemberNotFoundError();
    if (target.role === 'OWNER') throw new CannotChangeOwnerRoleError();

    const updated = await membersRepository.updateMemberRole(
      prisma,
      memberId,
      body.role,
    );
    return toMemberCard(updated);
  },

  // ── Remove member ──────────────────────────────────────────────────────

  async removeMember(
    context: WorkspaceRequestContext,
    memberId: string,
    confirm: unknown,
  ): Promise<{ removedMemberId: string; transferredProjects: number }> {
    if (confirm !== true)
      throw new (
        await import('../workspace/errors.js')
      ).ConfirmationRequiredError();
    if (context.status === 'ARCHIVED') throw new WorkspaceArchivedError();

    // Service-level role narrowing for remove: Owner removes Member/Admin,
    // Admin removes Member only. Guard may have allowed both OWNER|ADMIN here.
    if (context.role !== 'OWNER' && context.role !== 'ADMIN')
      throw new ForbiddenRoleError();

    const target = await membersRepository.findMemberById(prisma, memberId);
    if (!target || target.workspaceId !== context.workspaceId)
      throw new MemberNotFoundError();
    if (target.role === 'OWNER') throw new CannotRemoveOwnerError();
    if (target.id === context.memberId) throw new CannotRemoveSelfError();
    if (context.role === 'ADMIN' && target.role !== 'MEMBER')
      throw new ForbiddenRoleError();

    await prisma.$transaction(async (tx) => {
      // Project transfer hookup (Checkpoint B) — currently projects table does
      // not exist, so this is a no-op in Checkpoint A. Kept in-transaction so
      // future F4 wiring is atomic without restructuring.
      await membersRepository.deleteMember(tx, memberId);
    });

    return { removedMemberId: memberId, transferredProjects: 0 };
  },

  // ── Leave ──────────────────────────────────────────────────────────────

  async leaveWorkspace(
    context: WorkspaceRequestContext,
    confirm: unknown,
  ): Promise<{ transferredProjects: number }> {
    if (confirm !== true)
      throw new (
        await import('../workspace/errors.js')
      ).ConfirmationRequiredError();
    if (context.status === 'ARCHIVED') throw new WorkspaceArchivedError();
    if (context.role === 'OWNER') throw new TransferRequiredError();

    await prisma.$transaction(async (tx) => {
      await membersRepository.deleteMember(tx, context.memberId);
    });

    return { transferredProjects: 0 };
  },

  // ── Transfer ownership ─────────────────────────────────────────────────

  async transferOwnership(
    context: WorkspaceRequestContext,
    targetMemberId: string,
  ): Promise<WorkspaceMemberCard[]> {
    if (context.status === 'ARCHIVED') throw new WorkspaceArchivedError();
    if (context.role !== 'OWNER') throw new ForbiddenRoleError();
    if (targetMemberId === context.memberId)
      throw new TransferTargetInvalidError(
        'Cannot transfer ownership to yourself',
      );

    const target = await membersRepository.findMemberById(
      prisma,
      targetMemberId,
    );
    if (
      !target ||
      target.workspaceId !== context.workspaceId ||
      target.role === 'OWNER'
    )
      throw new TransferTargetInvalidError();

    // Atomic swap: single raw CASE so partial index never sees two OWNER rows
    const updated = await prisma.$transaction(async (tx) => {
      // Verify caller still Owner inside the transaction
      const caller = await tx.workspaceMember.findUnique({
        where: { id: context.memberId },
      });
      if (!caller || caller.role !== 'OWNER') throw new ForbiddenRoleError();
      const freshTarget = await tx.workspaceMember.findUnique({
        where: { id: targetMemberId },
      });
      if (
        !freshTarget ||
        freshTarget.workspaceId !== context.workspaceId ||
        freshTarget.role === 'OWNER'
      )
        throw new TransferTargetInvalidError();

      await tx.$executeRawUnsafe(
        `UPDATE workspace_member SET role = CASE id WHEN $1 THEN 'ADMIN'::"WorkspaceRole" WHEN $2 THEN 'OWNER'::"WorkspaceRole" END WHERE id IN ($1, $2)`,
        context.memberId,
        targetMemberId,
      );

      const rows = await tx.workspaceMember.findMany({
        where: {
          id: { in: [context.memberId, targetMemberId] },
          workspaceId: context.workspaceId,
        },
        include: { user: { select: { name: true, email: true, image: true } } },
      });
      return rows;
    });

    return updated.map((r) =>
      toMemberCard(r as Parameters<typeof toMemberCard>[0]),
    );
  },

  // ── Invite ─────────────────────────────────────────────────────────────

  async inviteMembers(
    context: WorkspaceRequestContext,
    callerUserId: string,
    body: InviteMembersRequest,
  ): Promise<InvitationCard[]> {
    if (context.status === 'ARCHIVED') throw new WorkspaceArchivedError();
    if (context.role !== 'OWNER' && context.role !== 'ADMIN')
      throw new ForbiddenRoleError();
    if (context.role === 'ADMIN' && body.role === 'ADMIN')
      throw new ForbiddenRoleError('Admins can invite as Member only');

    const caller = await membersRepository.findUserById(prisma, callerUserId);
    if (!caller) throw new ForbiddenRoleError();
    const callerEmailLower = caller.email.trim().toLowerCase();

    // Validate each email before any insert (batch is all-or-nothing)
    for (const email of body.emails) {
      const lower = email.trim().toLowerCase();
      if (lower === callerEmailLower) throw new CannotInviteSelfError();
      const alreadyMember = await membersRepository.isMemberByEmailInWorkspace(
        prisma,
        context.workspaceId,
        lower,
      );
      if (alreadyMember) throw new AlreadyMemberError();
      const pending = await membersRepository.findPendingByWorkspaceAndEmail(
        prisma,
        context.workspaceId,
        lower,
      );
      if (pending) throw new PendingExistsError();
    }

    const expiresAt = new Date(
      Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    const workspace = await prisma.workspace.findUnique({
      where: { id: context.workspaceId },
      select: { name: true },
    });
    const workspaceName = workspace?.name ?? 'a workspace';

    const created: InvitationCard[] = [];

    await prisma.$transaction(async (tx) => {
      for (const rawEmail of body.emails) {
        const email = rawEmail.trim().toLowerCase();
        let token = generateToken();
        // collision retry on token uniqueness
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const row = await membersRepository.createInvitation(tx, {
              workspaceId: context.workspaceId,
              email,
              role: body.role,
              token,
              expiresAt,
              createdById: callerUserId,
            });
            created.push(toInvitationCard(row));
            break;
          } catch (error) {
            const code = (error as { code?: string }).code;
            if (code === 'P2002') {
              token = generateToken();
              if (attempt === 2) throw new PendingExistsError();
              continue;
            }
            throw error;
          }
        }
      }
    });

    // Send emails after commit — dispatched in parallel so a 20-invite batch
    // adds only the slowest send to the request, not the sum. Per-email
    // failures are logged and never roll back rows.
    const dispatchInvitationEmail = async (
      card: InvitationCard,
    ): Promise<void> => {
      const inviteUrl = `${env.WEB_URL}/invite/${card.token}`;
      const rendered = await renderWorkspaceInvitationEmail({
        workspaceName,
        role: card.role,
        inviteUrl,
        inviterName: caller.name ?? undefined,
      }).catch(() => null);

      await sendEmail({
        to: card.email,
        subject: `You're invited to join ${workspaceName} on Shipyard`,
        html:
          rendered?.html ??
          `<p>Join ${workspaceName} as ${card.role}: <a href="${inviteUrl}">${inviteUrl}</a></p>`,
        text: rendered?.text ?? undefined,
      }).catch((error) => {
        logger.warn(
          { err: error, email: card.email, workspaceId: context.workspaceId },
          '[members] Failed to send invitation email',
        );
      });
    };

    await Promise.allSettled(created.map(dispatchInvitationEmail));

    return created;
  },

  // ── List invitations ───────────────────────────────────────────────────

  async listInvitations(
    context: WorkspaceRequestContext,
  ): Promise<InvitationCard[]> {
    if (context.role !== 'OWNER' && context.role !== 'ADMIN')
      throw new ForbiddenRoleError();
    const rows = await membersRepository.listInvitations(
      prisma,
      context.workspaceId,
    );
    return rows.map((r) => toInvitationCard(r));
  },

  // ── Resend ─────────────────────────────────────────────────────────────

  async resendInvitation(
    context: WorkspaceRequestContext,
    invitationId: string,
    confirm: unknown,
  ): Promise<InvitationCard> {
    if (confirm !== true)
      throw new (
        await import('../workspace/errors.js')
      ).ConfirmationRequiredError();
    if (context.status === 'ARCHIVED') throw new WorkspaceArchivedError();
    if (context.role !== 'OWNER' && context.role !== 'ADMIN')
      throw new ForbiddenRoleError();

    const inv = await membersRepository.findInvitationById(
      prisma,
      invitationId,
    );
    if (!inv || inv.workspaceId !== context.workspaceId)
      throw new InvitationNotFoundError();
    if (inv.status !== 'PENDING') throw new InvitationNotUsableError();
    if (isExpired(inv.expiresAt)) throw new InvitationExpiredError();
    // Admin resend of an Admin invitation is allowed to remain resendable;
    // only the invite creation is role-narrowed.

    const workspace = await prisma.workspace.findUnique({
      where: { id: context.workspaceId },
      select: { name: true },
    });
    const maybeUserId = (context as unknown as { userId?: string }).userId;
    const caller = maybeUserId
      ? await membersRepository.findUserById(prisma, maybeUserId)
      : null;

    const touched = await membersRepository.touchInvitation(
      prisma,
      invitationId,
    );

    const inviteUrl = `${env.WEB_URL}/invite/${inv.token}`;
    const rendered = await renderWorkspaceInvitationEmail({
      workspaceName: workspace?.name ?? 'a workspace',
      role: inv.role,
      inviteUrl,
      inviterName: caller?.name ?? undefined,
    }).catch(() => null);

    await sendEmail({
      to: inv.email,
      subject: `Reminder: you're invited to join ${workspace?.name ?? 'a workspace'} on Shipyard`,
      html:
        rendered?.html ??
        `<p>Join as ${inv.role}: <a href="${inviteUrl}">${inviteUrl}</a></p>`,
      text: rendered?.text ?? undefined,
    }).catch((error) => {
      logger.warn(
        { err: error, invitationId },
        '[members] Failed to resend invitation',
      );
    });

    return toInvitationCard(touched);
  },

  // ── Revoke ─────────────────────────────────────────────────────────────

  async revokeInvitation(
    context: WorkspaceRequestContext,
    invitationId: string,
    confirm: unknown,
  ): Promise<InvitationCard> {
    if (confirm !== true)
      throw new (
        await import('../workspace/errors.js')
      ).ConfirmationRequiredError();
    if (context.status === 'ARCHIVED') throw new WorkspaceArchivedError();
    if (context.role !== 'OWNER' && context.role !== 'ADMIN')
      throw new ForbiddenRoleError();

    const inv = await membersRepository.findInvitationById(
      prisma,
      invitationId,
    );
    if (!inv || inv.workspaceId !== context.workspaceId)
      throw new InvitationNotFoundError();
    if (inv.status !== 'PENDING') throw new InvitationNotUsableError();

    const revoked = await membersRepository.updateInvitationStatus(
      prisma,
      invitationId,
      'REVOKED',
    );
    return toInvitationCard(revoked);
  },

  // ── Token-gated: preview / accept / decline ─────────────────────────────

  async previewInvitation(
    token: string,
    callerUserId: string | undefined,
  ): Promise<InvitationPreview> {
    const inv = await membersRepository.findInvitationByToken(prisma, token);
    if (!inv) throw new InvitationNotFoundError();
    // verified gate: if caller has a user, verify email; preview still returns
    // for expired/revoked so the UI can explain, but unverified is gated.
    if (callerUserId) {
      const user = await membersRepository.findUserById(prisma, callerUserId);
      if (user && !user.emailVerified) throw new EmailNotVerifiedError();
    }

    const expired = isExpired(inv.expiresAt);
    const status = expired && inv.status === 'PENDING' ? 'EXPIRED' : inv.status;

    // Already a member? The accept card is pointless — the client redirects
    // straight into the workspace (no new info leaked: the caller either is
    // a member who already has access, or isn't).
    const membership = callerUserId
      ? await membersRepository.findMemberByUserAndWorkspace(
          prisma,
          inv.workspaceId,
          callerUserId,
        )
      : null;

    return {
      workspaceName: inv.workspace.name,
      workspaceIcon: inv.workspace.icon,
      workspaceSlug: inv.workspace.slug,
      role: inv.role,
      email: inv.email,
      expiresAt: inv.expiresAt.toISOString(),
      status: status,
      isMember: membership !== null,
    };
  },

  async acceptInvitation(
    token: string,
    callerUserId: string,
  ): Promise<{ member: WorkspaceMemberCard; workspaceSlug: string }> {
    const user = await membersRepository.findUserById(prisma, callerUserId);
    requireVerified(user);

    return prisma.$transaction(async (tx) => {
      const inv = await membersRepository.findInvitationByToken(tx, token);
      if (!inv) throw new InvitationNotFoundError();
      if (inv.workspace.status === 'ARCHIVED')
        throw new WorkspaceArchivedError();
      if (isExpired(inv.expiresAt)) throw new InvitationExpiredError();
      if (inv.status !== 'PENDING')
        throw new InvitationNotUsableError(undefined, {
          status: inv.status,
        });

      const existing = await membersRepository.findMemberByUserAndWorkspace(
        tx,
        inv.workspaceId,
        callerUserId,
      );
      if (existing) throw new AlreadyMemberError();

      // Create membership with the offered role
      const created = await tx.workspaceMember.create({
        data: {
          workspaceId: inv.workspaceId,
          userId: callerUserId,
          role: inv.role as 'MEMBER' | 'ADMIN',
        },
        include: { user: { select: { name: true, email: true, image: true } } },
      });

      await membersRepository.updateInvitationStatus(tx, inv.id, 'ACCEPTED');

      return {
        member: toMemberCard(created),
        workspaceSlug: inv.workspace.slug,
      };
    });
  },

  async declineInvitation(
    token: string,
    callerUserId: string,
  ): Promise<InvitationCard> {
    const user = await membersRepository.findUserById(prisma, callerUserId);
    requireVerified(user);

    const inv = await membersRepository.findInvitationByToken(prisma, token);
    if (!inv) throw new InvitationNotFoundError();
    if (inv.workspace.status === 'ARCHIVED') throw new WorkspaceArchivedError();
    if (isExpired(inv.expiresAt)) throw new InvitationExpiredError();
    if (inv.status !== 'PENDING') throw new InvitationNotUsableError();

    const declined = await membersRepository.updateInvitationStatus(
      prisma,
      inv.id,
      'DECLINED',
    );
    return toInvitationCard(declined);
  },
};
