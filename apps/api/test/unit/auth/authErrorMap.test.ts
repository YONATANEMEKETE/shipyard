import { describe, it, expect } from 'vitest';
import {
  ErrorCodes,
  type ErrorCode,
} from '../../../src/common/errors/codes.js';
import {
  AUTH_CODE_MAP,
  isInternalAuthError,
  mapAuthError,
} from '../../../src/common/errors/authErrorMap.js';

const VALID_CODES = new Set(Object.values(ErrorCodes)) as Set<ErrorCode>;

describe('AUTH_CODE_MAP integrity', () => {
  it('maps every entry to a valid ErrorCode and sensible status', () => {
    for (const [authCode, mapped] of Object.entries(AUTH_CODE_MAP)) {
      expect(
        VALID_CODES.has(mapped.code),
        `${authCode} maps to unknown code ${mapped.code}`,
      ).toBe(true);
      expect(
        mapped.statusCode,
        `${authCode} has out-of-range status ${mapped.statusCode}`,
      ).toBeGreaterThanOrEqual(400);
      expect(mapped.statusCode).toBeLessThan(600);
    }
  });

  it('conflict codes map to 409 CONFLICT', () => {
    for (const code of [
      'USER_ALREADY_EXISTS',
      'SOCIAL_ACCOUNT_ALREADY_LINKED',
    ]) {
      const mapped = AUTH_CODE_MAP[code];
      expect(mapped).toEqual({ statusCode: 409, code: ErrorCodes.CONFLICT });
    }
  });

  it('credential and session codes map to 401 UNAUTHORIZED', () => {
    for (const code of [
      'INVALID_EMAIL_OR_PASSWORD',
      'SESSION_EXPIRED',
      'SESSION_NOT_FRESH',
      'EMAIL_NOT_VERIFIED',
      'TOKEN_EXPIRED',
    ]) {
      const mapped = AUTH_CODE_MAP[code];
      expect(mapped).toEqual({
        statusCode: 401,
        code: ErrorCodes.UNAUTHORIZED,
      });
    }
  });
});

describe('mapAuthError', () => {
  it('prefers the code-level mapping over the HTTP status', () => {
    // USER_ALREADY_EXISTS is thrown as 422 by BA; the map overrides to 409
    expect(mapAuthError('USER_ALREADY_EXISTS', 422)).toEqual({
      statusCode: 409,
      code: ErrorCodes.CONFLICT,
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
    // Better Auth uses EXPECTATION_FAILED for some account-linking failures
    expect(mapAuthError('MYSTERY_CODE', 417)).toEqual({
      statusCode: 400,
      code: ErrorCodes.BAD_REQUEST,
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
