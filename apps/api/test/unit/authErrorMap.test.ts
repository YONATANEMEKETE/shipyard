import { describe, it, expect } from 'vitest';
import { ErrorCodes } from '../../src/common/errors/codes.js';
import {
  isInternalAuthError,
  mapAuthError,
} from '../../src/common/errors/authErrorMap.js';

describe('mapAuthError', () => {
  it('maps known Better Auth codes by code first', () => {
    expect(mapAuthError('USER_ALREADY_EXISTS', 422)).toEqual({
      statusCode: 409,
      code: ErrorCodes.CONFLICT,
    });

    expect(mapAuthError('INVALID_EMAIL_OR_PASSWORD', 401)).toEqual({
      statusCode: 401,
      code: ErrorCodes.UNAUTHORIZED,
    });

    expect(mapAuthError('PASSWORD_TOO_SHORT', 400)).toEqual({
      statusCode: 400,
      code: ErrorCodes.VALIDATION_ERROR,
    });

    expect(mapAuthError('USER_NOT_FOUND', 400)).toEqual({
      statusCode: 404,
      code: ErrorCodes.NOT_FOUND,
    });
  });

  it('falls back to status-based mapping for unknown codes', () => {
    expect(mapAuthError('SOME_PLUGIN_CODE', 403)).toEqual({
      statusCode: 403,
      code: ErrorCodes.FORBIDDEN,
    });

    expect(mapAuthError(undefined, 429)).toEqual({
      statusCode: 429,
      code: ErrorCodes.RATE_LIMITED,
    });
  });

  it('maps unrecognized statuses to internal server error', () => {
    const mapped = mapAuthError('MYSTERY_CODE', 599);
    expect(mapped).toEqual({
      statusCode: 500,
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
    });
    expect(isInternalAuthError(mapped)).toBe(true);
  });

  it('does not flag non-internal errors as internal', () => {
    expect(
      isInternalAuthError(mapAuthError('INVALID_EMAIL_OR_PASSWORD', 401)),
    ).toBe(false);
  });
});
