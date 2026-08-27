import { AppError } from '../../common/errors/AppError.js';

/**
 * Workspace-scoped domain errors (api-design.md §7). Each extends the shared
 * {@link AppError} so the global error handler emits the standard envelope with
 * its `code` and `statusCode`. Services throw these; handlers never build
 * error bodies by hand.
 */

export const WorkspaceErrorCodes = {
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  NAME_MISMATCH: 'NAME_MISMATCH',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  FORBIDDEN_ROLE: 'FORBIDDEN_ROLE',
  WORKSPACE_ARCHIVED: 'WORKSPACE_ARCHIVED',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
} as const;

export type WorkspaceErrorCode =
  (typeof WorkspaceErrorCodes)[keyof typeof WorkspaceErrorCodes];

/** 400 — archive/restore/delete missing the literal confirmation flag/body. */
export class ConfirmationRequiredError extends AppError {
  constructor(message = 'Confirmation is required for this action') {
    super(400, WorkspaceErrorCodes.CONFIRMATION_REQUIRED, message);
  }
}

/** 400 — delete `confirmName` does not match the stored workspace name. */
export class NameMismatchError extends AppError {
  constructor(message = 'The typed name does not match the workspace') {
    super(400, WorkspaceErrorCodes.NAME_MISMATCH, message);
  }
}

/**
 * 404 — unknown slug **or** caller is not a member. Deliberately identical for
 * both so no existence is leaked (spec rule / §3 no-existence-leak).
 */
export class WorkspaceNotFoundError extends AppError {
  constructor(message = 'Workspace not found') {
    super(404, WorkspaceErrorCodes.WORKSPACE_NOT_FOUND, message);
  }
}

/** 403 — caller is a member but lacks the required role (Owner) for the route. */
export class ForbiddenRoleError extends AppError {
  constructor(message = 'You do not have the required role for this action') {
    super(403, WorkspaceErrorCodes.FORBIDDEN_ROLE, message);
  }
}

/** 409 — a mutating op was attempted on an archived (read-only) workspace. */
export class WorkspaceArchivedError extends AppError {
  constructor(message = 'Workspace is archived and read-only') {
    super(409, WorkspaceErrorCodes.WORKSPACE_ARCHIVED, message);
  }
}

/**
 * 409 — a controlled state transition was rejected: archive on an already
 * archived workspace, restore on an already active workspace, or delete on a
 * non-archived workspace.
 */
export class InvalidStatusTransitionError extends AppError {
  constructor(
    message = 'The workspace is not in a state that allows this action',
  ) {
    super(409, WorkspaceErrorCodes.INVALID_STATUS_TRANSITION, message);
  }
}
