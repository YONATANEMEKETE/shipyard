import { AppError } from '../../common/errors/AppError.js';

/**
 * Comments domain errors (api-design.md §7). Each extends {@link AppError} so
 * the global error handler emits the standard envelope with its `code` and
 * `statusCode`. Services throw these; controllers never build error bodies.
 *
 * Shared-cross-module errors (CONFIRMATION_REQUIRED, WORKSPACE_ARCHIVED,
 * WORKSPACE_NOT_FOUND) are reused from the workspace module and
 * (ISSUE_NOT_FOUND, ISSUE_ARCHIVED) from the issues module rather than
 * duplicated here. This module has no FORBIDDEN_ROLE — every route accepts
 * any member; mutation privilege is authorship, not role.
 */

export const CommentErrorCodes = {
  COMMENT_NOT_FOUND: 'COMMENT_NOT_FOUND',
  NOT_COMMENT_AUTHOR: 'NOT_COMMENT_AUTHOR',
} as const;

export type CommentErrorCode =
  (typeof CommentErrorCodes)[keyof typeof CommentErrorCodes];

/**
 * 404 — :commentId not under :issueId in this workspace. Triple-scoped
 * (id + issueId + workspaceId): a comment id smuggled under a sibling
 * issue's URL never resolves (no cross-issue leak).
 */
export class CommentNotFoundError extends AppError {
  constructor(message = 'Comment not found on this issue') {
    super(404, CommentErrorCodes.COMMENT_NOT_FOUND, message);
  }
}

/**
 * 403 — edit/delete caller is not the comment's author. Roles never override
 * (spec rule 3) — Owner/Admin get the same code as Member, with no privilege
 * hint in the message.
 */
export class NotCommentAuthorError extends AppError {
  constructor(message = 'Only the author can edit or delete this comment') {
    super(403, CommentErrorCodes.NOT_COMMENT_AUTHOR, message);
  }
}
