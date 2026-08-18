import { AppError } from './AppError.js';
import { ErrorCodes } from './codes.js';

export class ValidationError extends AppError {
  constructor(
    message = 'Request validation failed',
    publicDetails?: unknown,
    cause?: unknown,
  ) {
    super(400, ErrorCodes.VALIDATION_ERROR, message, { publicDetails, cause });
  }
}

export class UnauthorizedError extends AppError {
  constructor(
    message = 'Authentication required',
    publicDetails?: unknown,
    cause?: unknown,
  ) {
    super(401, ErrorCodes.UNAUTHORIZED, message, { publicDetails, cause });
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = 'You do not have permission to perform this action',
    publicDetails?: unknown,
    cause?: unknown,
  ) {
    super(403, ErrorCodes.FORBIDDEN, message, { publicDetails, cause });
  }
}

export class NotFoundError extends AppError {
  constructor(
    message = 'Resource not found',
    publicDetails?: unknown,
    cause?: unknown,
  ) {
    super(404, ErrorCodes.NOT_FOUND, message, { publicDetails, cause });
  }
}

export class ConflictError extends AppError {
  constructor(
    message = 'Request conflicts with the current state',
    publicDetails?: unknown,
    cause?: unknown,
  ) {
    super(409, ErrorCodes.CONFLICT, message, { publicDetails, cause });
  }
}

export class InternalServerError extends AppError {
  constructor(
    message = 'An unexpected error occurred',
    publicDetails?: unknown,
    cause?: unknown,
  ) {
    super(500, ErrorCodes.INTERNAL_SERVER_ERROR, message, {
      publicDetails,
      cause,
    });
  }
}
