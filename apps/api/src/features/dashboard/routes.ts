import { Router } from 'express';
import { requireSession } from '../../common/middlewares/requireSession.js';
import { validate } from '../../common/middlewares/validate.js';
import { resolveWorkspaceContext } from '../../common/guards/workspace-context.js';
import { slugParamsSchema } from './schemas.js';
import { getDashboardController } from './controller.js';

/**
 * Dashboard routes — one endpoint covers every behavior (api-design.md §2):
 *  - `GET /workspaces/:slug/dashboard` — the composed four-panel payload.
 *
 * Guard chain (canonical, read-only):
 *   requireSession → resolveWorkspaceContext(:slug, rejectArchived: false)
 * Any member (no role check — view surface), archived workspaces still
 * serve 200 (frozen workspaces stay browsable, §6.1). No body, no query
 * params; empty panels are data, never errors.
 *
 * NOT endpoints here (§5.2): trail recording (best-effort side effect on
 * issues GET detail), drill-down (client routing over card ids), badge
 * polling (notifications), full browsing (owning list endpoints).
 */

export const workspaceDashboardRouter = Router({ mergeParams: true });

workspaceDashboardRouter.get(
  '/dashboard',
  requireSession,
  validate.params(slugParamsSchema),
  resolveWorkspaceContext(),
  getDashboardController,
);
