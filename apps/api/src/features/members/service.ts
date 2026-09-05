import { randomBytes } from 'node:crypto';
import type {
  ChangeMemberRoleRequest,
  InvitationCard,
  InvitationPreview,
  InviteMembersRequest,
  RecordActivityEvent,
  WorkspaceMemberCard,
} from '@shipyard/shared';
import { INVITATION_TTL_DAYS } from '@shipyard/shared';
import { env } from '../../common/config/env.js';
import { prisma } from '../../common/db/client.js';
import { logger } from '../../common/logger/index.js';
import { renderWorkspaceInvitationEmail } from '@shipyard/email';
import { sendEmail } from '../../lib/mailer.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import { activityService } from '../activity/service.js';
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
import { membersRepository, type DbClient } from './repository.js';
import { projectsService } from '../projects/service.js';
import { issuesService } from '../issues/service.js';

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

/**
 * Resolves the acting member's userId + display name for activity events.
 * `actorId` follows the rest of the taxonomy (a userId, not a member id).
 */
async function actorOf(
  client: DbClient,
  memberId: string,
): Promise<{ userId: string; name: string }> {
  const row = await membersRepository.findMemberById(client, memberId);
  if (!row) throw new MemberNotFoundError();
  return { userId: row.userId, name: row.user.name };
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

    const updated = await prisma.$transaction(async (tx) => {
      const row = await membersRepository.updateMemberRole(
        tx,
        memberId,
        body.role,
      );
      const actor = await actorOf(tx, context.memberId);
      const targetName = target.user.name;
      await activityService.record(
        {
          workspaceId: context.workspaceId,
          actorId: actor.userId,
          actorName: actor.name,
          kind: 'MEMBER_ROLE_CHANGED',
          entityType: 'MEMBER',
          entityId: memberId,
          entityTitle: targetName,
          summary: `${actor.name} changed ${targetName}'s role from ${target.role} to ${body.role}`,
        },
        tx,
      );
      return row;
    });
    logger.info(
      {
        workspaceId: context.workspaceId,
        workspaceSlug: context.slug,
        memberId,
        newRole: body.role,
        actorMemberId: context.memberId,
        actorRole: context.role,
      },
      'member.role_changed',
    );
    return toMemberCard(updated);
  },

  // ── Remove member ──────────────────────────────────────────────────────

  async removeMember(
    context: WorkspaceRequestContext,
    memberId: string,
    confirm: unknown,
  ): Promise<{
    removedMemberId: string;
    transferredProjects: number;
    unassignedIssues: number;
  }> {
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

    // F4 Checkpoint B: transfer the removed member's owned projects to the
    // current workspace OWNER inside the same transaction as the removal —
    // all-or-nothing (api-design §8.7 / §6.6). Covers archived projects too.
    // F5 leg: unassign the removed member's issues (archived included) with
    // one UNASSIGNED row per issue, actor = the remover.
    const owner = await membersRepository.findOwnerMember(
      prisma,
      context.workspaceId,
    );
    const { transferredProjects, unassignedIssues } = await prisma.$transaction(
      async (tx) => {
        let transferred = 0;
        if (owner && target.userId !== owner.userId) {
          transferred = await projectsService.transferOwnedProjects(
            context.workspaceId,
            target.userId,
            owner.userId,
            tx,
          );
        }
        const actor = await actorOf(tx, context.memberId);
        const unassigned = await issuesService.unassignOnMemberExit(
          context.workspaceId,
          target.userId,
          tx,
          actor.userId,
        );
        await membersRepository.deleteMember(tx, memberId);
        // Member event only — the project/issue cascade above is narrated in
        // this row's summary, not as its own event rows (closed event list).
        const notes: string[] = [];
        if (transferred > 0)
          notes.push(
            `${transferred} ${transferred === 1 ? 'project' : 'projects'} transferred to the owner`,
          );
        if (unassigned > 0)
          notes.push(
            `${unassigned} ${unassigned === 1 ? 'issue' : 'issues'} unassigned`,
          );
        await activityService.record(
          {
            workspaceId: context.workspaceId,
            actorId: actor.userId,
            actorName: actor.name,
            kind: 'MEMBER_REMOVED',
            entityType: 'MEMBER',
            entityId: memberId,
            entityTitle: target.user.name,
            summary: notes.length
              ? `${actor.name} removed ${target.user.name} from the workspace (${notes.join(', ')})`
              : `${actor.name} removed ${target.user.name} from the workspace`,
          } satisfies RecordActivityEvent,
          tx,
        );
        return {
          transferredProjects: transferred,
          unassignedIssues: unassigned,
        };
      },
    );

    logger.info(
      {
        workspaceId: context.workspaceId,
        workspaceSlug: context.slug,
        removedMemberId: memberId,
        actorMemberId: context.memberId,
        actorRole: context.role,
        transferredProjects,
        unassignedIssues,
      },
      'member.removed',
    );

    return { removedMemberId: memberId, transferredProjects, unassignedIssues };
  },

  // ── Leave ──────────────────────────────────────────────────────────────

  async leaveWorkspace(
    context: WorkspaceRequestContext,
    confirm: unknown,
  ): Promise<{ transferredProjects: number; unassignedIssues: number }> {
    if (confirm !== true)
      throw new (
        await import('../workspace/errors.js')
      ).ConfirmationRequiredError();
    if (context.status === 'ARCHIVED') throw new WorkspaceArchivedError();
    if (context.role === 'OWNER') throw new TransferRequiredError();

    // F4 Checkpoint B: transfer the leaving member's owned projects to the
    // current workspace OWNER inside the same transaction as the leave.
    // F5 leg: unassign the leaver's issues (archived included), actor = leaver.
    const owner = await membersRepository.findOwnerMember(
      prisma,
      context.workspaceId,
    );
    const leaver = await membersRepository.findMemberById(
      prisma,
      context.memberId,
    );
    const { transferredProjects, unassignedIssues } = await prisma.$transaction(
      async (tx) => {
        let transferred = 0;
        if (owner && leaver && leaver.userId !== owner.userId) {
          transferred = await projectsService.transferOwnedProjects(
            context.workspaceId,
            leaver.userId,
            owner.userId,
            tx,
          );
        }
        let unassigned = 0;
        if (leaver) {
          unassigned = await issuesService.unassignOnMemberExit(
            context.workspaceId,
            leaver.userId,
            tx,
            leaver.userId,
          );
        }
        const actor = await actorOf(tx, context.memberId);
        await membersRepository.deleteMember(tx, context.memberId);
        const notes: string[] = [];
        if (transferred > 0)
          notes.push(
            `${transferred} ${transferred === 1 ? 'project' : 'projects'} transferred to the owner`,
          );
        if (unassigned > 0)
          notes.push(
            `${unassigned} ${unassigned === 1 ? 'issue' : 'issues'} unassigned`,
          );
        await activityService.record(
          {
            workspaceId: context.workspaceId,
            actorId: actor.userId,
            actorName: actor.name,
            kind: 'MEMBER_LEFT',
            entityType: 'MEMBER',
            entityId: context.memberId,
            entityTitle: actor.name,
            summary: notes.length
              ? `${actor.name} left the workspace (${notes.join(', ')})`
              : `${actor.name} left the workspace`,
          } satisfies RecordActivityEvent,
          tx,
        );
        return {
          transferredProjects: transferred,
          unassignedIssues: unassigned,
        };
      },
    );

    logger.info(
      {
        workspaceId: context.workspaceId,
        workspaceSlug: context.slug,
        memberId: context.memberId,
        transferredProjects,
        unassignedIssues,
      },
      'member.left_workspace',
    );

    return { transferredProjects, unassignedIssues };
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
        `UPDATE workspace_member SET role = 'ADMIN'::"WorkspaceRole" WHERE id = $1`,
        context.memberId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE workspace_member SET role = 'OWNER'::"WorkspaceRole" WHERE id = $1`,
        targetMemberId,
      );

      // One OWNERSHIP_TRANSFERRED row, not two MEMBER_ROLE_CHANGED rows.
      const actor = await actorOf(tx, context.memberId);
      const newOwner = await actorOf(tx, targetMemberId);
      await activityService.record(
        {
          workspaceId: context.workspaceId,
          actorId: actor.userId,
          actorName: actor.name,
          kind: 'OWNERSHIP_TRANSFERRED',
          entityType: 'MEMBER',
          entityId: targetMemberId,
          entityTitle: newOwner.name,
          summary: `${actor.name} transferred ownership to ${newOwner.name}`,
        },
        tx,
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

    logger.info(
      {
        workspaceId: context.workspaceId,
        workspaceSlug: context.slug,
        previousOwnerMemberId: context.memberId,
        newOwnerMemberId: targetMemberId,
      },
      'member.ownership_transferred',
    );

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
            // One MEMBER_INVITED row per invitation; the invitee is
            // identified by email (D4) — they are never a member yet.
            await activityService.record(
              {
                workspaceId: context.workspaceId,
                actorId: callerUserId,
                actorName: caller.name,
                kind: 'MEMBER_INVITED',
                entityType: 'INVITATION',
                entityId: row.id,
                entityTitle: email,
                summary: `${caller.name} invited ${email} as ${body.role}`,
              },
              tx,
            );
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

    for (const card of created) {
      logger.info(
        {
          workspaceId: context.workspaceId,
          workspaceSlug: context.slug,
          invitationId: card.id,
          email: card.email,
          role: card.role,
          invitedByUserId: callerUserId,
        },
        'member.invited',
      );
    }

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

  // No activity event on purpose: a resend is a re-touch, not a lifecycle
  // state change, and the kind list is closed (spec §3.1).

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

    logger.info(
      {
        workspaceId: context.workspaceId,
        workspaceSlug: context.slug,
        invitationId,
        email: inv.email,
        role: inv.role,
      },
      'member.invitation_resent',
    );

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

    const revoked = await prisma.$transaction(async (tx) => {
      const row = await membersRepository.updateInvitationStatus(
        tx,
        invitationId,
        'REVOKED',
      );
      const actor = await actorOf(tx, context.memberId);
      await activityService.record(
        {
          workspaceId: context.workspaceId,
          actorId: actor.userId,
          actorName: actor.name,
          kind: 'MEMBER_INVITE_REVOKED',
          entityType: 'INVITATION',
          entityId: invitationId,
          entityTitle: inv.email,
          summary: `${actor.name} revoked ${inv.email}'s invitation`,
        },
        tx,
      );
      return row;
    });
    logger.info(
      {
        workspaceId: context.workspaceId,
        workspaceSlug: context.slug,
        invitationId,
        email: revoked.email,
        role: revoked.role,
        actorMemberId: context.memberId,
        actorRole: context.role,
      },
      'member.invitation_revoked',
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

      // D4: the joiner is identified by the invitation email — the email
      // matches the invitation row even when the user row has a name.
      await activityService.record(
        {
          workspaceId: inv.workspaceId,
          actorId: callerUserId,
          actorName: inv.email,
          kind: 'MEMBER_JOINED',
          entityType: 'INVITATION',
          entityId: inv.id,
          entityTitle: inv.email,
          summary: `${inv.email} joined the workspace as ${inv.role}`,
        },
        tx,
      );

      logger.info(
        {
          workspaceId: inv.workspaceId,
          workspaceSlug: inv.workspace.slug,
          invitationId: inv.id,
          email: inv.email,
          role: inv.role,
          userId: callerUserId,
          memberId: created.id,
        },
        'member.invitation_accepted',
      );

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

    const declined = await prisma.$transaction(async (tx) => {
      const row = await membersRepository.updateInvitationStatus(
        tx,
        inv.id,
        'DECLINED',
      );
      await activityService.record(
        {
          workspaceId: inv.workspaceId,
          actorId: callerUserId,
          actorName: inv.email,
          kind: 'MEMBER_DECLINED',
          entityType: 'INVITATION',
          entityId: inv.id,
          entityTitle: inv.email,
          summary: `${inv.email} declined the invitation`,
        },
        tx,
      );
      return row;
    });
    logger.info(
      {
        workspaceId: inv.workspaceId,
        workspaceSlug: inv.workspace.slug,
        invitationId: inv.id,
        email: inv.email,
        role: inv.role,
        userId: callerUserId,
      },
      'member.invitation_declined',
    );
    return toInvitationCard(declined);
  },
};
