import { Router } from 'express';
import { requireSession } from '../../common/middlewares/requireSession.js';
import { validate } from '../../common/middlewares/validate.js';
import { resolveWorkspaceContext } from '../../common/guards/workspace-context.js';
import { slugParamsSchema } from '../issues/schemas.js';
import { listActivityQuerySchema } from './schemas.js';
import { listActivityController } from './controller.js';

/**
 * Activity routes — one workspace-scoped family (api-design.md §2):
 *  - `/workspaces/:slug/activity` — page walk (newest-first)
 *
 * Guard chain: requireSession → resolveWorkspaceContext(:slug) with
 * `rejectArchived: false` (archived workspaces stay readable — the log is
 * frozen by upstream silence, not by guard). No role check (any member
 * reads all — spec rule 4). There is deliberately NO create route (D2 —
 * sourceless events unmintable; emission is internal-only via record()).
 */

// ── Activity sub-router (mounted under /api/v1/workspaces/:slug/activity) ─

export const workspaceActivityRouter = Router({ mergeParams: true });

// Page walk — any member; archived workspace still readable.
workspaceActivityRouter.get(
  '/',
  requireSession,
  validate.all({ params: slugParamsSchema, query: listActivityQuerySchema }),
  resolveWorkspaceContext({ rejectArchived: false }),
  listActivityController,
);
