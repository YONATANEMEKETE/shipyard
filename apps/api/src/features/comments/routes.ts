import { Router } from 'express';
import {
  confirmActionSchema,
  createCommentSchema,
  updateCommentSchema,
} from '@shipyard/shared';
import { requireSession } from '../../common/middlewares/requireSession.js';
import { validate } from '../../common/middlewares/validate.js';
import { resolveWorkspaceContext } from '../../common/guards/workspace-context.js';
import {
  commentIdParamsSchema,
  issueCommentParamsSchema,
  listCommentsQuerySchema,
} from './schemas.js';
import {
  createCommentController,
  deleteCommentController,
  getCommentController,
  listCommentsController,
  updateCommentController,
} from './controller.js';

/**
 * Comments routes — one family (api-design.md §2), nested under the parent
 * issue like labels/history nest under issues in F5:
 *  - `/workspaces/:slug/issues/:issueId/comments...`
 *
 * Guard chain mirrors issues (plan §1.4) minus role:
 *   requireSession → resolveWorkspaceContext(:slug)
 * Reads accept any member (archived workspace still browsable, archived
 * issues stay readable); writes run with `rejectArchived: true`. There is
 * deliberately no `requireWorkspaceRole` anywhere here — the write privilege
 * is membership and the mutation privilege is authorship (service).
 */

// ── Comments sub-router ──────────────────────────────────────────────────
// Mounted under /api/v1/workspaces/:slug/issues/:issueId/comments.

export const issueCommentsRouter = Router({ mergeParams: true });

// Read — any member; archived workspace/issues still readable.
issueCommentsRouter.get(
  '/',
  requireSession,
  validate.all({
    params: issueCommentParamsSchema,
    query: listCommentsQuerySchema,
  }),
  resolveWorkspaceContext(),
  listCommentsController,
);

issueCommentsRouter.get(
  '/:commentId',
  requireSession,
  validate.params(commentIdParamsSchema),
  resolveWorkspaceContext(),
  getCommentController,
);

// Writes — any member + active workspace; authorship checked in the service.
issueCommentsRouter.post(
  '/',
  requireSession,
  validate.all({
    params: issueCommentParamsSchema,
    body: createCommentSchema,
  }),
  resolveWorkspaceContext({ rejectArchived: true }),
  createCommentController,
);

issueCommentsRouter.patch(
  '/:commentId',
  requireSession,
  validate.all({
    params: commentIdParamsSchema,
    body: updateCommentSchema,
  }),
  resolveWorkspaceContext({ rejectArchived: true }),
  updateCommentController,
);

issueCommentsRouter.delete(
  '/:commentId',
  requireSession,
  validate.all({
    params: commentIdParamsSchema,
    body: confirmActionSchema,
  }),
  resolveWorkspaceContext({ rejectArchived: true }),
  deleteCommentController,
);
