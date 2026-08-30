import { Router } from 'express';
import { z } from 'zod';
import {
  changeMemberRoleSchema,
  confirmActionSchema,
  inviteMembersSchema,
  transferOwnershipSchema,
} from '@shipyard/shared';
import { requireSession } from '../../common/middlewares/requireSession.js';
import { validate } from '../../common/middlewares/validate.js';
import { resolveWorkspaceContext } from '../../common/guards/workspace-context.js';
import { requireWorkspaceRole } from '../../common/guards/require-workspace-role.js';
import {
  memberIdParamsSchema,
  invitationIdParamsSchema,
  slugParamsSchema,
  tokenParamsSchema,
} from './schemas.js';
import {
  acceptInvitationController,
  changeRoleController,
  declineInvitationController,
  getMemberController,
  inviteMembersController,
  leaveWorkspaceController,
  listInvitationsController,
  listMembersController,
  previewInvitationController,
  removeMemberController,
  resendInvitationController,
  revokeInvitationController,
  transferOwnershipController,
} from './controller.js';

/**
 * Members routes — two families:
 *  - Workspace-scoped `/workspaces/:slug/...` (membership + invitation management)
 *  - Token-gated `/invitations/:token/...` (preview/accept/decline for non-members)
 *
 * Guard chain mirrors workspace (plan §1.4):
 *   requireSession → resolveWorkspaceContext(:slug) → requireWorkspaceRole → controller
 * Token routes use requireSession only; service resolves the invitation+workspace.
 */

// ── Workspace-scoped family (mounted under /api/v1/workspaces) ─────────

/** Sub-router for `/workspaces/:slug/members` and `/workspaces/:slug/invitations` */
export const workspaceMembersRouter = Router({ mergeParams: true });

// Members directory — any member can read
workspaceMembersRouter.get(
  '/',
  requireSession,
  validate.params(slugParamsSchema),
  resolveWorkspaceContext(),
  listMembersController,
);

workspaceMembersRouter.get(
  '/:memberId',
  requireSession,
  validate.params(memberIdParamsSchema),
  resolveWorkspaceContext(),
  getMemberController,
);

// Change role — Owner only, frozen check in service (rejectArchived at guard)
workspaceMembersRouter.patch(
  '/:memberId/role',
  requireSession,
  validate.all({
    params: memberIdParamsSchema,
    body: changeMemberRoleSchema,
  }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER'),
  changeRoleController,
);

// Remove member — Owner removes Member/Admin; Admin removes Member only
// Guard allows both; service narrows per target role.
workspaceMembersRouter.post(
  '/:memberId/remove',
  requireSession,
  validate.all({
    params: memberIdParamsSchema,
    body: confirmActionSchema,
  }),
  resolveWorkspaceContext({ rejectArchived: true }),
  // Must be at least a member; real check in service so Admin-vs-Admin is 403 not 404
  requireWorkspaceRole('OWNER', 'ADMIN'),
  removeMemberController,
);

// ── Workspace-scoped invitations sub-router ──────────────────────────────

export const workspaceInvitationsRouter = Router({ mergeParams: true });

workspaceInvitationsRouter.post(
  '/',
  requireSession,
  validate.all({ params: slugParamsSchema, body: inviteMembersSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  inviteMembersController,
);

workspaceInvitationsRouter.get(
  '/',
  requireSession,
  validate.params(slugParamsSchema),
  resolveWorkspaceContext(),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  listInvitationsController,
);

workspaceInvitationsRouter.post(
  '/:invitationId/resend',
  requireSession,
  validate.all({
    params: invitationIdParamsSchema,
    body: confirmActionSchema,
  }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  resendInvitationController,
);

workspaceInvitationsRouter.post(
  '/:invitationId/revoke',
  requireSession,
  validate.all({
    params: invitationIdParamsSchema,
    body: confirmActionSchema,
  }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  revokeInvitationController,
);

// ── Workspace extras mounted directly on /workspaces/:slug ───────────────
// Leave and transfer-ownership are not sub-resources; they live on the
// workspace itself. Routes defined inline in the composition below using a
// dedicated router so they can be mounted in one place.

export const workspaceExtrasRouter = Router({ mergeParams: true });

workspaceExtrasRouter.post(
  '/leave',
  requireSession,
  validate.all({ params: slugParamsSchema, body: confirmActionSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  leaveWorkspaceController,
);

workspaceExtrasRouter.post(
  '/transfer-ownership',
  requireSession,
  validate.all({
    params: slugParamsSchema,
    body: transferOwnershipSchema,
  }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER'),
  transferOwnershipController,
);

// ── Token-gated family (mounted under /api/v1/invitations) ───────────────

export const invitationTokenRouter = Router();

const tokenBodySchema = z.object({}).passthrough();

invitationTokenRouter.get(
  '/:token',
  requireSession,
  validate.params(tokenParamsSchema),
  previewInvitationController,
);

invitationTokenRouter.post(
  '/:token/accept',
  requireSession,
  validate.all({ params: tokenParamsSchema, body: tokenBodySchema }),
  acceptInvitationController,
);

invitationTokenRouter.post(
  '/:token/decline',
  requireSession,
  validate.all({ params: tokenParamsSchema, body: tokenBodySchema }),
  declineInvitationController,
);
