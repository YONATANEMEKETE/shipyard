import { Router } from 'express';
import {
  confirmActionSchema,
  createProjectSchema,
  deleteProjectSchema,
  setViewPreferenceSchema,
  transferProjectOwnerSchema,
  updateProjectSchema,
} from '@shipyard/shared';
import { requireSession } from '../../common/middlewares/requireSession.js';
import { validate } from '../../common/middlewares/validate.js';
import { resolveWorkspaceContext } from '../../common/guards/workspace-context.js';
import { requireWorkspaceRole } from '../../common/guards/require-workspace-role.js';
import {
  listProjectsQuerySchema,
  projectIdParamsSchema,
  slugParamsSchema,
  viewScopeParamsSchema,
} from './schemas.js';
import {
  archiveProjectController,
  createProjectController,
  deleteProjectController,
  getProjectController,
  getViewPreferenceController,
  listProjectsController,
  restoreProjectController,
  setViewPreferenceController,
  transferProjectOwnerController,
  updateProjectController,
} from './controller.js';

/**
 * Projects routes — two families (api-design.md §2):
 *  - `/workspaces/:slug/projects...` — project CRUD + lifecycle
 *  - `/workspaces/:slug/view-preferences/:scope` — per-user view choice
 *
 * Guard chain mirrors members (plan §1.4):
 *   requireSession → resolveWorkspaceContext(:slug) → requireWorkspaceRole
 * Read routes (list/detail/view pref) accept any member; writes require
 * OWNER|ADMIN and an active (non-archived) workspace.
 */

// ── Projects sub-router (mounted under /api/v1/workspaces/:slug/projects) ─

export const workspaceProjectsRouter = Router({ mergeParams: true });

// Read — any member; archived workspace still browsable (rejectArchived false).
workspaceProjectsRouter.get(
  '/',
  requireSession,
  validate.all({ params: slugParamsSchema, query: listProjectsQuerySchema }),
  resolveWorkspaceContext(),
  listProjectsController,
);

workspaceProjectsRouter.get(
  '/:projectId',
  requireSession,
  validate.params(projectIdParamsSchema),
  resolveWorkspaceContext(),
  getProjectController,
);

// Writes — OWNER|ADMIN + active workspace.
workspaceProjectsRouter.post(
  '/',
  requireSession,
  validate.all({ params: slugParamsSchema, body: createProjectSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  createProjectController,
);

workspaceProjectsRouter.patch(
  '/:projectId',
  requireSession,
  validate.all({ params: projectIdParamsSchema, body: updateProjectSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  updateProjectController,
);

workspaceProjectsRouter.post(
  '/:projectId/transfer-owner',
  requireSession,
  validate.all({
    params: projectIdParamsSchema,
    body: transferProjectOwnerSchema,
  }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  transferProjectOwnerController,
);

workspaceProjectsRouter.post(
  '/:projectId/archive',
  requireSession,
  validate.all({ params: projectIdParamsSchema, body: confirmActionSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  archiveProjectController,
);

workspaceProjectsRouter.post(
  '/:projectId/restore',
  requireSession,
  validate.all({ params: projectIdParamsSchema, body: confirmActionSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  restoreProjectController,
);

workspaceProjectsRouter.delete(
  '/:projectId',
  requireSession,
  validate.all({ params: projectIdParamsSchema, body: deleteProjectSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  deleteProjectController,
);

// ── View-preference sub-router (mounted under /api/v1/workspaces/:slug/
//    view-preferences). Any member; preference read/set is harmless even in an
//    archived (frozen but viewable) workspace, so rejectArchived stays false.

export const workspaceViewPreferencesRouter = Router({ mergeParams: true });

workspaceViewPreferencesRouter.get(
  '/:scope',
  requireSession,
  validate.params(viewScopeParamsSchema),
  resolveWorkspaceContext(),
  getViewPreferenceController,
);

workspaceViewPreferencesRouter.put(
  '/:scope',
  requireSession,
  validate.all({
    params: viewScopeParamsSchema,
    body: setViewPreferenceSchema,
  }),
  resolveWorkspaceContext(),
  setViewPreferenceController,
);
