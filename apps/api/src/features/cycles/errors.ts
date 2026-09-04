import type { CycleCard } from '@shipyard/shared';
import { AppError } from '../../common/errors/AppError.js';

/**
 * Cycles domain errors (api-design.md §7). Each extends {@link AppError} so
 * the global error handler emits the standard envelope with its `code` and
 * `statusCode`. Services throw these; controllers never build error bodies.
 *
 * Guard-failure conflicts (name/overlap/active) carry the conflicting row as
 * `details.conflictingCycle` so the UI can name it ("complete *Sprint 12*
 * first" — spec Q3 resolved).
 *
 * Shared-cross-module errors (CONFIRMATION_REQUIRED, FORBIDDEN_ROLE,
 * WORKSPACE_ARCHIVED, WORKSPACE_NOT_FOUND) are reused from the workspace
 * module rather than duplicated here. ALREADY_ARCHIVED / NOT_ARCHIVED reuse
 * the same code strings as sibling modules (the handler maps by code) but
 * carry cycle-specific messages, so each module owns its wording.
 */

export const CycleErrorCodes = {
  CYCLE_NOT_FOUND: 'CYCLE_NOT_FOUND',
  CYCLE_NOT_IN_WORKSPACE: 'CYCLE_NOT_IN_WORKSPACE',
  CYCLE_NAME_CONFLICT: 'CYCLE_NAME_CONFLICT',
  CYCLE_OVERLAP: 'CYCLE_OVERLAP',
  ANOTHER_ACTIVE_EXISTS: 'ANOTHER_ACTIVE_EXISTS',
  INVALID_CYCLE_TRANSITION: 'INVALID_CYCLE_TRANSITION',
  COMPLETE_FIRST: 'COMPLETE_FIRST',
  CYCLE_READ_ONLY: 'CYCLE_READ_ONLY',
  CYCLE_NOT_DELETABLE: 'CYCLE_NOT_DELETABLE',
  CYCLE_ARCHIVED: 'CYCLE_ARCHIVED',
  ALREADY_ARCHIVED: 'ALREADY_ARCHIVED',
  NOT_ARCHIVED: 'NOT_ARCHIVED',
} as const;

export type CycleErrorCode =
  (typeof CycleErrorCodes)[keyof typeof CycleErrorCodes];

function conflictingDetails(card: CycleCard | undefined) {
  return card ? { publicDetails: { conflictingCycle: card } } : undefined;
}

/**
 * 404 — :cycleId not found in this workspace. Deliberately scoped: a cycle
 * id from another workspace is indistinguishable from a bogus id (no
 * cross-workspace existence leak).
 */
export class CycleNotFoundError extends AppError {
  constructor(message = 'Cycle not found in this workspace') {
    super(404, CycleErrorCodes.CYCLE_NOT_FOUND, message);
  }
}

/**
 * 404 — issues-leg `cycleId` not in this workspace. Scoped (addressability,
 * not input shape). Defined by the cycles contract, surfaced on issues routes.
 */
export class CycleNotInWorkspaceError extends AppError {
  constructor(message = 'Cycle not found in this workspace') {
    super(404, CycleErrorCodes.CYCLE_NOT_IN_WORKSPACE, message);
  }
}

/**
 * 409 — create/rename collides (trimmed, case-insensitive) with another
 * cycle in the workspace, including archived rows (which reserve names).
 */
export class CycleNameConflictError extends AppError {
  constructor(
    conflictingCycle?: CycleCard,
    message = 'A cycle with this name already exists',
  ) {
    super(
      409,
      CycleErrorCodes.CYCLE_NAME_CONFLICT,
      message,
      conflictingDetails(conflictingCycle),
    );
  }
}

/** 409 — range overlaps a non-archived sibling (inclusive bounds). */
export class CycleOverlapError extends AppError {
  constructor(
    conflictingCycle?: CycleCard,
    message = 'Cycle date range overlaps another cycle',
  ) {
    super(
      409,
      CycleErrorCodes.CYCLE_OVERLAP,
      message,
      conflictingDetails(conflictingCycle),
    );
  }
}

/** 409 — start/reopen while another ACTIVE non-archived cycle holds the slot. */
export class AnotherActiveExistsError extends AppError {
  constructor(
    conflictingCycle?: CycleCard,
    message = 'Another cycle is already active',
  ) {
    super(
      409,
      CycleErrorCodes.ANOTHER_ACTIVE_EXISTS,
      message,
      conflictingDetails(conflictingCycle),
    );
  }
}

/** 409 — lifecycle action on the wrong status (controlled transitions only). */
export class InvalidCycleTransitionError extends AppError {
  constructor(message = 'Cycle status does not allow this action') {
    super(409, CycleErrorCodes.INVALID_CYCLE_TRANSITION, message);
  }
}

/** 409 — archive on an ACTIVE cycle (complete it first, rule 6). */
export class CompleteFirstError extends AppError {
  constructor(message = 'Complete the active cycle before archiving it') {
    super(409, CycleErrorCodes.COMPLETE_FIRST, message);
  }
}

/** 409 — update on a COMPLETED cycle (reopen first, rule 7). */
export class CycleReadOnlyError extends AppError {
  constructor(message = 'Completed cycles are read-only — reopen to edit') {
    super(409, CycleErrorCodes.CYCLE_READ_ONLY, message);
  }
}

/**
 * 409 — delete unless future-PLANNED non-archived. Single code for
 * Active/Completed/archived/started (data-model §6.6); the message names the
 * reason.
 */
export class CycleNotDeletableError extends AppError {
  constructor(message = 'Only future planned cycles can be deleted') {
    super(409, CycleErrorCodes.CYCLE_NOT_DELETABLE, message);
  }
}

/** 409 — mutating op targeted an archived (read-only) cycle. */
export class CycleArchivedError extends AppError {
  constructor(message = 'Cycle is archived and read-only') {
    super(409, CycleErrorCodes.CYCLE_ARCHIVED, message);
  }
}

/** 409 — archive on an already-archived cycle. */
export class CycleAlreadyArchivedError extends AppError {
  constructor(message = 'Cycle is already archived') {
    super(409, CycleErrorCodes.ALREADY_ARCHIVED, message);
  }
}

/** 409 — restore on a non-archived cycle. */
export class CycleNotArchivedError extends AppError {
  constructor(message = 'Cycle is not archived') {
    super(409, CycleErrorCodes.NOT_ARCHIVED, message);
  }
}
