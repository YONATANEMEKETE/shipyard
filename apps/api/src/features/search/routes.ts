import { Router } from 'express';
import { requireSession } from '../../common/middlewares/requireSession.js';
import { validate } from '../../common/middlewares/validate.js';
import { resolveWorkspaceContext } from '../../common/guards/workspace-context.js';
import { searchQuerySchema } from './schemas.js';
import { searchController } from './controller.js';

/**
 * Search routes — a single endpoint covers every behavior in the feature
 * spec (api-design §2): grouped ranked search, suggestions (`limit=5`,
 * client-debounced) and the "search within" filter (`?type=`) are the same
 * route with different query params — a second path would fork ranking
 * logic and drift. There are deliberately no detail routes (hits carry full
 * cards; navigation targets the owning pages/drawer) and no write path at
 * all (spec rule 6 — read-only).
 *
 * Guard chain (canonical, read-only):
 *   requireSession → validate(query) → resolveWorkspaceContext(:slug)
 * with `rejectArchived` false — archived workspaces stay searchable over
 * their non-archived entities (api-design §6). No role guard: visibility is
 * membership-only (spec rule 2).
 *
 * Validation notes (§5.1):
 * - Missing `q` key ⇒ 400 VALIDATION_ERROR (required parameter).
 * - Present-but-blank `q` ⇒ 200 with empty groups (never an error) — the
 *   route-local schema passes `''` through and the service short-circuits.
 * - `q` > 200 after trim, unknown `type`, out-of-range `limit` ⇒ 400.
 */
export const workspaceSearchRouter = Router({ mergeParams: true });

workspaceSearchRouter.get(
  '/',
  requireSession,
  validate.query(searchQuerySchema),
  resolveWorkspaceContext(),
  searchController,
);
