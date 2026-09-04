import { Router } from 'express';
import {
  attachLabelSchema,
  confirmActionSchema,
  createIssueSchema,
  createLabelSchema,
  deleteIssueSchema,
  updateIssueSchema,
  updateLabelSchema,
} from '@shipyard/shared';
import { requireSession } from '../../common/middlewares/requireSession.js';
import { validate } from '../../common/middlewares/validate.js';
import { resolveWorkspaceContext } from '../../common/guards/workspace-context.js';
import { requireWorkspaceRole } from '../../common/guards/require-workspace-role.js';
import {
  issueIdParamsSchema,
  issueLabelParamsSchema,
  labelIdParamsSchema,
  listHistoryQuerySchema,
  listIssuesQuerySchema,
  slugParamsSchema,
} from './schemas.js';
import {
  archiveIssueController,
  attachLabelController,
  createIssueController,
  createLabelController,
  deleteIssueController,
  deleteLabelController,
  detachLabelController,
  getIssueController,
  listIssueHistoryController,
  listIssuesController,
  listLabelsController,
  restoreIssueController,
  updateIssueController,
  updateLabelController,
} from './controller.js';

/**
 * Issues routes — two families (api-design.md §2):
 *  - `/workspaces/:slug/issues...` — issue CRUD + lifecycle + history +
 *    attach/detach
 *  - `/workspaces/:slug/labels...` — label CRUD
 *
 * Guard chain mirrors projects (plan §1.4):
 *   requireSession → resolveWorkspaceContext(:slug) → [requireWorkspaceRole]
 * Reads accept any member (archived workspace still browsable); writes run
 * with `rejectArchived: true`. Only permanent delete (#7) is role-gated to
 * OWNER|ADMIN — every other issue/label write is any member (spec rule 10).
 */

// ── Issues sub-router (mounted under /api/v1/workspaces/:slug/issues) ────

export const workspaceIssuesRouter = Router({ mergeParams: true });

// Read — any member; archived workspace still browsable (rejectArchived false).
workspaceIssuesRouter.get(
  '/',
  requireSession,
  validate.all({ params: slugParamsSchema, query: listIssuesQuerySchema }),
  resolveWorkspaceContext(),
  listIssuesController,
);

workspaceIssuesRouter.get(
  '/:issueId',
  requireSession,
  validate.params(issueIdParamsSchema),
  resolveWorkspaceContext(),
  getIssueController,
);

workspaceIssuesRouter.get(
  '/:issueId/history',
  requireSession,
  validate.all({ params: issueIdParamsSchema, query: listHistoryQuerySchema }),
  resolveWorkspaceContext(),
  listIssueHistoryController,
);

// Writes — any member + active workspace.
workspaceIssuesRouter.post(
  '/',
  requireSession,
  validate.all({ params: slugParamsSchema, body: createIssueSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  createIssueController,
);

workspaceIssuesRouter.patch(
  '/:issueId',
  requireSession,
  validate.all({ params: issueIdParamsSchema, body: updateIssueSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  updateIssueController,
);

workspaceIssuesRouter.post(
  '/:issueId/archive',
  requireSession,
  validate.all({ params: issueIdParamsSchema, body: confirmActionSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  archiveIssueController,
);

workspaceIssuesRouter.post(
  '/:issueId/restore',
  requireSession,
  validate.all({ params: issueIdParamsSchema, body: confirmActionSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  restoreIssueController,
);

// Permanent delete — OWNER|ADMIN only + active workspace. Allowed whether
// the issue itself is archived or not.
workspaceIssuesRouter.delete(
  '/:issueId',
  requireSession,
  validate.all({ params: issueIdParamsSchema, body: deleteIssueSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  requireWorkspaceRole('OWNER', 'ADMIN'),
  deleteIssueController,
);

// Labels on an issue — any member + active workspace.
workspaceIssuesRouter.post(
  '/:issueId/labels',
  requireSession,
  validate.all({ params: issueIdParamsSchema, body: attachLabelSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  attachLabelController,
);

workspaceIssuesRouter.delete(
  '/:issueId/labels/:labelId',
  requireSession,
  validate.params(issueLabelParamsSchema),
  resolveWorkspaceContext({ rejectArchived: true }),
  detachLabelController,
);

// ── Labels sub-router (mounted under /api/v1/workspaces/:slug/labels) ────

export const workspaceLabelsRouter = Router({ mergeParams: true });

workspaceLabelsRouter.get(
  '/',
  requireSession,
  validate.params(slugParamsSchema),
  resolveWorkspaceContext(),
  listLabelsController,
);

workspaceLabelsRouter.post(
  '/',
  requireSession,
  validate.all({ params: slugParamsSchema, body: createLabelSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  createLabelController,
);

workspaceLabelsRouter.patch(
  '/:labelId',
  requireSession,
  validate.all({ params: labelIdParamsSchema, body: updateLabelSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  updateLabelController,
);

workspaceLabelsRouter.delete(
  '/:labelId',
  requireSession,
  validate.all({ params: labelIdParamsSchema, body: confirmActionSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  deleteLabelController,
);
