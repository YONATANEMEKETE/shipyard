import { AppError } from '../../common/errors/AppError.js';

/**
 * Members / invitations domain errors (api-design.md §7). Each extends
 * {@link AppError} so the global error handler emits the standard envelope.
 */

export const MemberErrorCodes = {
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  INVITATION_NOT_FOUND: 'INVITATION_NOT_FOUND',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  CANNOT_INVITE_SELF: 'CANNOT_INVITE_SELF',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  PENDING_EXISTS: 'PENDING_EXISTS',
  CANNOT_CHANGE_OWNER_ROLE: 'CANNOT_CHANGE_OWNER_ROLE',
  CANNOT_REMOVE_OWNER: 'CANNOT_REMOVE_OWNER',
  CANNOT_REMOVE_SELF: 'CANNOT_REMOVE_SELF',
  TRANSFER_REQUIRED: 'TRANSFER_REQUIRED',
  TRANSFER_TARGET_INVALID: 'TRANSFER_TARGET_INVALID',
  INVITATION_NOT_USABLE: 'INVITATION_NOT_USABLE',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
} as const;

export type MemberErrorCode =
  (typeof MemberErrorCodes)[keyof typeof MemberErrorCodes];

/** 404 — :memberId not in this workspace (scoped). */
export class MemberNotFoundError extends AppError {
  constructor(message = 'Member not found in this workspace') {
    super(404, MemberErrorCodes.MEMBER_NOT_FOUND, message);
  }
}

/** 404 — unknown :token or :invitationId within workspace. */
export class InvitationNotFoundError extends AppError {
  constructor(message = 'Invitation not found') {
    super(404, MemberErrorCodes.INVITATION_NOT_FOUND, message);
  }
}

/** 403 — accepting/interacting with an invitation requires a verified email. */
export class EmailNotVerifiedError extends AppError {
  constructor(message = 'A verified email is required for this action') {
    super(403, MemberErrorCodes.EMAIL_NOT_VERIFIED, message);
  }
}

/** 409 — cannot invite your own email address. */
export class CannotInviteSelfError extends AppError {
  constructor(message = 'You cannot invite yourself') {
    super(409, MemberErrorCodes.CANNOT_INVITE_SELF, message);
  }
}

/** 409 — email already a member of this workspace. */
export class AlreadyMemberError extends AppError {
  constructor(message = 'User is already a member of this workspace') {
    super(409, MemberErrorCodes.ALREADY_MEMBER, message);
  }
}

/** 409 — pending invitation already exists for this (workspace, email). */
export class PendingExistsError extends AppError {
  constructor(message = 'A pending invitation already exists for this email') {
    super(409, MemberErrorCodes.PENDING_EXISTS, message);
  }
}

/** 409 — cannot change the Owner's role via role patch; use transfer. */
export class CannotChangeOwnerRoleError extends AppError {
  constructor(message = 'Cannot change the Owner role directly') {
    super(409, MemberErrorCodes.CANNOT_CHANGE_OWNER_ROLE, message);
  }
}

/** 409 — Owner cannot be removed. */
export class CannotRemoveOwnerError extends AppError {
  constructor(message = 'The workspace Owner cannot be removed') {
    super(409, MemberErrorCodes.CANNOT_REMOVE_OWNER, message);
  }
}

/** 409 — cannot remove yourself; use leave. */
export class CannotRemoveSelfError extends AppError {
  constructor(message = 'You cannot remove yourself') {
    super(409, MemberErrorCodes.CANNOT_REMOVE_SELF, message);
  }
}

/** 409 — Owner must transfer ownership before leaving. */
export class TransferRequiredError extends AppError {
  constructor(message = 'Transfer workspace ownership before leaving') {
    super(409, MemberErrorCodes.TRANSFER_REQUIRED, message);
  }
}

/** 409 — transfer target invalid (not in workspace, is Owner, or is caller). */
export class TransferTargetInvalidError extends AppError {
  constructor(message = 'Transfer target is invalid') {
    super(409, MemberErrorCodes.TRANSFER_TARGET_INVALID, message);
  }
}

/** 409 — invitation not usable (REVOKED/DECLINED/ACCEPTED). */
export class InvitationNotUsableError extends AppError {
  constructor(
    message = 'This invitation can no longer be used',
    publicDetails?: unknown,
  ) {
    super(409, MemberErrorCodes.INVITATION_NOT_USABLE, message, {
      publicDetails,
    });
  }
}

/** 409 — invitation expired (expiresAt in the past). */
export class InvitationExpiredError extends AppError {
  constructor(message = 'This invitation has expired') {
    super(409, MemberErrorCodes.INVITATION_EXPIRED, message);
  }
}
