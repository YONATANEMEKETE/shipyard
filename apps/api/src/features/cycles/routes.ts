import { Router } from 'express';
import {
  confirmActionSchema,
  createCycleSchema,
  updateCycleSchema,
} from '@shipyard/shared';
import { requireSession } from '../../common/middlewares/requireSession.js';
import { validate } from '../../common/middlewares/validate.js';
import { resolveWorkspaceContext } from '../../common/guards/workspace-context.js';
import { requireWorkspaceRole } from '../../common/guards/require-workspace-role.js';
import {
  cycleIdParamsSchema,
  listCyclesQuerySchema,
  slugParamsSchema,
} from './schemas.js';
import {
  archiveCycleController,
  completeCycleController,
  createCycleController,
  deleteCycleController,
  getCycleController,
  listCyclesController,
  reopenCycleController,
  restoreCycleController,
  startCycleController,
  updateCycleController,
} from './controller.js';

/**
 * Cycles routes — one family (api-design.md §2):
 *  - `/workspaces/:slug/cycles...` — CRUD + controlled lifecycle
 *
 * Guard chain mirrors projects (plan §1.4):
 *   requireSession → resolveWorkspaceContext(:slug) → [requireWorkspaceRole]
 * Reads (#1–#2) accept any member (archived workspace still browsable);
 * every write (#3–#10) requires OWNER|ADMIN + an active workspace. There is
 * no generic status write (D2) and no cycle-side issue writer — issue↔cycle
 * writes live on the issues resource (api-design §5.2).
 */

// ── Cycles sub-router (mounted under /api/v1/workspaces/:slug/cycles) ────

export const workspaceCyclesRouter = Router({ mergeParams: true });

// Read — any member; archived workspace still browsable (rejectArchived false).
workspaceCyclesRouter.get(
  '/',
  requireSession,
  validate.all({ params: slugParamsSchema, query: listCyclesQuerySchema }),
  resolveWorkspaceContext(),
  listCyclesController,
);

workspaceCyclesRouter.get(
  '/:cycleId',
  requireSession,
  validate.params(cycleIdParamsSchema),
  resolveWorkspaceContext(),
  getCycleController,
);

// Writes — OWNER|ADMIN + active workspace.
workspaceCyclesRouter.post(
  '/',
  requireSession,
  validate.all({ params: slugParamsSchema, body: createCycleSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  createCycleController,
);

workspaceCyclesRouter.patch(
  '/:cycleId',
  requireSession,
  validate.all({ params: cycleIdParamsSchema, body: updateCycleSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  updateCycleController,
);

workspaceCyclesRouter.post(
  '/:cycleId/start',
  requireSession,
  validate.all({ params: cycleIdParamsSchema, body: confirmActionSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  startCycleController,
);

workspaceCyclesRouter.post(
  '/:cycleId/complete',
  requireSession,
  validate.all({ params: cycleIdParamsSchema, body: confirmActionSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  completeCycleController,
);

workspaceCyclesRouter.post(
  '/:cycleId/reopen',
  requireSession,
  validate.all({ params: cycleIdParamsSchema, body: confirmActionSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  reopenCycleController,
);

workspaceCyclesRouter.post(
  '/:cycleId/archive',
  requireSession,
  validate.all({ params: cycleIdParamsSchema, body: confirmActionSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  archiveCycleController,
);

workspaceCyclesRouter.post(
  '/:cycleId/restore',
  requireSession,
  validate.all({ params: cycleIdParamsSchema, body: confirmActionSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  restoreCycleController,
);

workspaceCyclesRouter.delete(
  '/:cycleId',
  requireSession,
  validate.all({ params: cycleIdParamsSchema, body: confirmActionSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  deleteCycleController,
);
