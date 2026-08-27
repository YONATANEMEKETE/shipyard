import { Router } from 'express';
import {
  createWorkspaceSchema,
  deleteWorkspaceSchema,
  updateWorkspaceSchema,
} from '@shipyard/shared';
import { requireSession } from '../../common/middlewares/requireSession.js';
import { validate } from '../../common/middlewares/validate.js';
import { resolveWorkspaceContext } from '../../common/guards/workspace-context.js';
import { requireWorkspaceRole } from '../../common/guards/require-workspace-role.js';
import { slugParamsSchema } from './schemas.js';
import {
  archiveWorkspaceController,
  createWorkspaceController,
  deleteWorkspaceController,
  getWorkspaceController,
  listWorkspacesController,
  restoreWorkspaceController,
  updateWorkspaceController,
} from './controller.js';

/**
 * Workspace routes — canonical guard chain (plan §1.4):
 *   requireSession → resolveWorkspaceContext(:slug) → requireRole(Owner) → controller
 *
 * Item routes operate across *all* the user's memberships; item routes address
 * a workspace by :slug and resolve/verify membership exactly once.
 */
export const workspaceRouter = Router();

// ── Collection (not workspace-scoped — operate on all of the user's memberships)
workspaceRouter.post(
  '/',
  requireSession,
  validate.body(createWorkspaceSchema),
  createWorkspaceController,
);

workspaceRouter.get('/', requireSession, listWorkspacesController);

// ── Item (workspace-scoped via :slug)
workspaceRouter.get(
  '/:slug',
  requireSession,
  validate.params(slugParamsSchema),
  resolveWorkspaceContext(),
  getWorkspaceController,
);

workspaceRouter.patch(
  '/:slug',
  requireSession,
  validate.all({ params: slugParamsSchema, body: updateWorkspaceSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER'),
  updateWorkspaceController,
);

// Archive/restore/delete are Owner+confirmed lifecycle exits; they remain
// available on archived workspaces (the confirm gate lives in the service).
workspaceRouter.post(
  '/:slug/archive',
  requireSession,
  validate.params(slugParamsSchema),
  resolveWorkspaceContext(),
  requireWorkspaceRole('OWNER'),
  archiveWorkspaceController,
);

workspaceRouter.post(
  '/:slug/restore',
  requireSession,
  validate.params(slugParamsSchema),
  resolveWorkspaceContext(),
  requireWorkspaceRole('OWNER'),
  restoreWorkspaceController,
);

workspaceRouter.delete(
  '/:slug',
  requireSession,
  validate.all({ params: slugParamsSchema, body: deleteWorkspaceSchema }),
  resolveWorkspaceContext(),
  requireWorkspaceRole('OWNER'),
  deleteWorkspaceController,
);
