import { AppError } from '../../common/errors/AppError.js';

/**
 * Issues domain errors (api-design.md §7). Each extends {@link AppError} so
 * the global error handler emits the standard envelope with its `code` and
 * `statusCode`. Services throw these; controllers never build error bodies.
 *
 * Shared-cross-module errors (CONFIRMATION_REQUIRED, FORBIDDEN_ROLE,
 * WORKSPACE_ARCHIVED, WORKSPACE_NOT_FOUND) are reused from the workspace
 * module rather than duplicated here. PROJECT_ARCHIVED / ALREADY_ARCHIVED /
 * NOT_ARCHIVED reuse the same code strings as the projects module (the
 * handler maps by code) but carry issue-specific messages, so each module
 * owns its wording.
 */

export const IssueErrorCodes = {
  CONFIRM_IDENTIFIER_MISMATCH: 'CONFIRM_IDENTIFIER_MISMATCH',
  ISSUE_NOT_FOUND: 'ISSUE_NOT_FOUND',
  LABEL_NOT_FOUND: 'LABEL_NOT_FOUND',
  ASSIGNEE_NOT_MEMBER: 'ASSIGNEE_NOT_MEMBER',
  PROJECT_NOT_IN_WORKSPACE: 'PROJECT_NOT_IN_WORKSPACE',
  LABEL_NOT_IN_WORKSPACE: 'LABEL_NOT_IN_WORKSPACE',
  LABEL_NAME_CONFLICT: 'LABEL_NAME_CONFLICT',
  ISSUE_ARCHIVED: 'ISSUE_ARCHIVED',
  ALREADY_ARCHIVED: 'ALREADY_ARCHIVED',
  NOT_ARCHIVED: 'NOT_ARCHIVED',
  CANNOT_BLOCK_DONE: 'CANNOT_BLOCK_DONE',
  PROJECT_ARCHIVED: 'PROJECT_ARCHIVED',
  LABEL_ALREADY_ATTACHED: 'LABEL_ALREADY_ATTACHED',
  LABEL_NOT_ATTACHED: 'LABEL_NOT_ATTACHED',
} as const;

export type IssueErrorCode =
  (typeof IssueErrorCodes)[keyof typeof IssueErrorCodes];

/** 400 — delete `confirmIdentifier` does not equal the issue's SHIP-###. */
export class ConfirmIdentifierMismatchError extends AppError {
  constructor(message = 'The typed identifier does not match this issue') {
    super(400, IssueErrorCodes.CONFIRM_IDENTIFIER_MISMATCH, message);
  }
}

/**
 * 404 — :issueId not found in this workspace. Deliberately scoped: an issue
 * id from another workspace is indistinguishable from a bogus id (no
 * cross-workspace existence leak).
 */
export class IssueNotFoundError extends AppError {
  constructor(message = 'Issue not found in this workspace') {
    super(404, IssueErrorCodes.ISSUE_NOT_FOUND, message);
  }
}

/** 404 — :labelId not found in this workspace (scoped, no leak). */
export class LabelNotFoundError extends AppError {
  constructor(message = 'Label not found in this workspace') {
    super(404, IssueErrorCodes.LABEL_NOT_FOUND, message);
  }
}

/**
 * 404 — `assigneeId` does not resolve to a current member of the workspace.
 * Scoped 404 (addressability, not input shape).
 */
export class AssigneeNotMemberError extends AppError {
  constructor(message = 'Assignee is not a member of this workspace') {
    super(404, IssueErrorCodes.ASSIGNEE_NOT_MEMBER, message);
  }
}

/** 404 — `projectId` not in this workspace (scoped, no leak). */
export class ProjectNotInWorkspaceError extends AppError {
  constructor(message = 'Project not found in this workspace') {
    super(404, IssueErrorCodes.PROJECT_NOT_IN_WORKSPACE, message);
  }
}

/** 404 — `labelId` not in this workspace (scoped, no leak). */
export class LabelNotInWorkspaceError extends AppError {
  constructor(message = 'Label not found in this workspace') {
    super(404, IssueErrorCodes.LABEL_NOT_IN_WORKSPACE, message);
  }
}

/**
 * 409 — create/rename collides (trimmed, case-insensitive) with another label
 * in the workspace (D6 functional index).
 */
export class LabelNameConflictError extends AppError {
  constructor(message = 'A label with this name already exists') {
    super(409, IssueErrorCodes.LABEL_NAME_CONFLICT, message);
  }
}

/** 409 — update/attach/detach targeted an archived (read-only) issue. */
export class IssueArchivedError extends AppError {
  constructor(message = 'Issue is archived and read-only') {
    super(409, IssueErrorCodes.ISSUE_ARCHIVED, message);
  }
}

/** 409 — archive on an already-archived issue. */
export class IssueAlreadyArchivedError extends AppError {
  constructor(message = 'Issue is already archived') {
    super(409, IssueErrorCodes.ALREADY_ARCHIVED, message);
  }
}

/** 409 — restore on a non-archived issue. */
export class IssueNotArchivedError extends AppError {
  constructor(message = 'Issue is not archived') {
    super(409, IssueErrorCodes.NOT_ARCHIVED, message);
  }
}

/** 409 — `blocked: true` on a DONE issue (only unfinished blockable). */
export class CannotBlockDoneError extends AppError {
  constructor(message = 'Only unfinished issues can be blocked') {
    super(409, IssueErrorCodes.CANNOT_BLOCK_DONE, message);
  }
}

/** 409 — attach to an archived (read-only) project. */
export class IssueProjectArchivedError extends AppError {
  constructor(message = 'Project is archived and read-only') {
    super(409, IssueErrorCodes.PROJECT_ARCHIVED, message);
  }
}

/** 409 — attach a label that is already on the issue (idempotency guard). */
export class LabelAlreadyAttachedError extends AppError {
  constructor(message = 'Label is already attached to this issue') {
    super(409, IssueErrorCodes.LABEL_ALREADY_ATTACHED, message);
  }
}

/** 409 — detach a label that is not on the issue. */
export class LabelNotAttachedError extends AppError {
  constructor(message = 'Label is not attached to this issue') {
    super(409, IssueErrorCodes.LABEL_NOT_ATTACHED, message);
  }
}
