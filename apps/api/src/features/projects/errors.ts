import { AppError } from '../../common/errors/AppError.js';

/**
 * Projects domain errors (api-design.md §7). Each extends {@link AppError} so
 * the global error handler emits the standard envelope with its `code` and
 * `statusCode`. Services throw these; controllers never build error bodies.
 *
 * Shared-cross-module errors (CONFIRMATION_REQUIRED, FORBIDDEN_ROLE,
 * WORKSPACE_ARCHIVED) are reused from the workspace module rather than
 * duplicated here.
 */

export const ProjectErrorCodes = {
  CONFIRM_NAME_MISMATCH: 'CONFIRM_NAME_MISMATCH',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  PROJECT_NAME_CONFLICT: 'PROJECT_NAME_CONFLICT',
  PROJECT_ARCHIVED: 'PROJECT_ARCHIVED',
  ALREADY_ARCHIVED: 'ALREADY_ARCHIVED',
  NOT_ARCHIVED: 'NOT_ARCHIVED',
  TRANSFER_TARGET_INVALID: 'TRANSFER_TARGET_INVALID',
} as const;

export type ProjectErrorCode =
  (typeof ProjectErrorCodes)[keyof typeof ProjectErrorCodes];

/** 400 — delete `confirmName` does not match the current project name. */
export class ConfirmNameMismatchError extends AppError {
  constructor(message = 'The typed name does not match this project') {
    super(400, ProjectErrorCodes.CONFIRM_NAME_MISMATCH, message);
  }
}

/**
 * 404 — :projectId not found in this workspace. Deliberately scoped: a project
 * id from another workspace is indistinguishable from a bogus id (no
 * cross-workspace existence leak).
 */
export class ProjectNotFoundError extends AppError {
  constructor(message = 'Project not found in this workspace') {
    super(404, ProjectErrorCodes.PROJECT_NOT_FOUND, message);
  }
}

/** 409 — create/rename collides (case-insensitive) with another project in the
 *  workspace, including archived ones (which reserve their name). */
export class ProjectNameConflictError extends AppError {
  constructor(message = 'A project with this name already exists') {
    super(409, ProjectErrorCodes.PROJECT_NAME_CONFLICT, message);
  }
}

/** 409 — update/transfer targeted an archived (read-only) project. */
export class ProjectArchivedError extends AppError {
  constructor(message = 'Project is archived and read-only') {
    super(409, ProjectErrorCodes.PROJECT_ARCHIVED, message);
  }
}

/** 409 — archive on an already-archived project. */
export class AlreadyArchivedError extends AppError {
  constructor(message = 'Project is already archived') {
    super(409, ProjectErrorCodes.ALREADY_ARCHIVED, message);
  }
}

/** 409 — restore on a non-archived project. */
export class NotArchivedError extends AppError {
  constructor(message = 'Project is not archived') {
    super(409, ProjectErrorCodes.NOT_ARCHIVED, message);
  }
}

/** 409 — transfer target is invalid (not a member, is the owner, or is self). */
export class TransferTargetInvalidError extends AppError {
  constructor(message = 'Transfer target is invalid') {
    super(409, ProjectErrorCodes.TRANSFER_TARGET_INVALID, message);
  }
}
