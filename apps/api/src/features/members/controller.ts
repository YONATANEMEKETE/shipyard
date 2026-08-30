import type { NextFunction, Request, Response } from 'express';
import type {
  ChangeMemberRoleRequest,
  InviteMembersRequest,
  TransferOwnershipRequest,
} from '@shipyard/shared';
import { sendSuccess } from '../../common/http/responses.js';
import { membersService } from './service.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import { InvitationNotFoundError, MemberNotFoundError } from './errors.js';
import { WorkspaceNotFoundError } from '../workspace/errors.js';

function contextOf(request: Request): WorkspaceRequestContext {
  const context = request.workspaceContext;
  if (!context) throw new WorkspaceNotFoundError();
  return context;
}

function userIdOf(request: Request): string {
  const userId =
    (request.user as { id?: string } | undefined)?.id ??
    (request.session as { userId?: string } | undefined)?.userId;
  if (!userId) throw new WorkspaceNotFoundError();
  return userId;
}

// ── Workspace-scoped ───────────────────────────────────────────────────

export function listMembersController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const ctx = contextOf(request);
      const members = await membersService.listMembers(ctx.workspaceId);
      sendSuccess(response, { members });
    } catch (error) {
      next(error);
    }
  })();
}

export function getMemberController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const ctx = contextOf(request);
      const member = await membersService.getMember(
        ctx.workspaceId,
        String(request.params.memberId),
      );
      sendSuccess(response, member);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') {
        next(new MemberNotFoundError());
        return;
      }
      next(error);
    }
  })();
}

export function changeRoleController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const ctx = contextOf(request);
      const body = request.body as ChangeMemberRoleRequest;
      const member = await membersService.changeRole(
        ctx,
        String(request.params.memberId),
        body,
      );
      sendSuccess(response, member);
    } catch (error) {
      next(error);
    }
  })();
}

export function removeMemberController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const ctx = contextOf(request);
      const result = await membersService.removeMember(
        ctx,
        String(request.params.memberId),
        (request.body as { confirm?: unknown } | undefined)?.confirm,
      );
      sendSuccess(response, result);
    } catch (error) {
      next(error);
    }
  })();
}

export function leaveWorkspaceController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const ctx = contextOf(request);
      const result = await membersService.leaveWorkspace(
        ctx,
        (request.body as { confirm?: unknown } | undefined)?.confirm,
      );
      sendSuccess(response, result);
    } catch (error) {
      next(error);
    }
  })();
}

export function transferOwnershipController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const ctx = contextOf(request);
      const body = request.body as unknown as TransferOwnershipRequest;
      const members = await membersService.transferOwnership(
        ctx,
        body.targetMemberId,
      );
      sendSuccess(response, { members });
    } catch (error) {
      next(error);
    }
  })();
}

export function inviteMembersController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const ctx = contextOf(request);
      // Enrich ctx with userId for resend's inviter lookup — service reads it
      const enriched = {
        ...ctx,
        userId: userIdOf(request),
      } as WorkspaceRequestContext & { userId: string };
      Object.assign(ctx, { userId: userIdOf(request) });
      void enriched; // keep lint happy; the assign above is the real effect
      const body = request.body as InviteMembersRequest;
      const invitations = await membersService.inviteMembers(
        ctx,
        userIdOf(request),
        body,
      );
      sendSuccess(response, { invitations }, 201);
    } catch (error) {
      next(error);
    }
  })();
}

export function listInvitationsController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const ctx = contextOf(request);
      const invitations = await membersService.listInvitations(ctx);
      sendSuccess(response, { invitations });
    } catch (error) {
      next(error);
    }
  })();
}

export function resendInvitationController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const ctx = contextOf(request);
      Object.assign(ctx, { userId: userIdOf(request) });
      const invitation = await membersService.resendInvitation(
        ctx,
        String(request.params.invitationId),
        (request.body as { confirm?: unknown } | undefined)?.confirm,
      );
      sendSuccess(response, invitation);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') {
        next(new InvitationNotFoundError());
        return;
      }
      next(error);
    }
  })();
}

export function revokeInvitationController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const ctx = contextOf(request);
      const invitation = await membersService.revokeInvitation(
        ctx,
        String(request.params.invitationId),
        (request.body as { confirm?: unknown } | undefined)?.confirm,
      );
      sendSuccess(response, invitation);
    } catch (error) {
      next(error);
    }
  })();
}

// ── Token-gated ────────────────────────────────────────────────────────

export function previewInvitationController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const token = String(request.params.token);
      const userId =
        (request.user as { id?: string } | undefined)?.id ??
        (request.session as { userId?: string } | undefined)?.userId;
      const preview = await membersService.previewInvitation(token, userId);
      sendSuccess(response, preview);
    } catch (error) {
      next(error);
    }
  })();
}

export function acceptInvitationController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const token = String(request.params.token);
      const userId = userIdOf(request);
      const result = await membersService.acceptInvitation(token, userId);
      sendSuccess(response, result, 201);
    } catch (error) {
      next(error);
    }
  })();
}

export function declineInvitationController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const token = String(request.params.token);
      const userId = userIdOf(request);
      const invitation = await membersService.declineInvitation(token, userId);
      sendSuccess(response, invitation);
    } catch (error) {
      next(error);
    }
  })();
}
