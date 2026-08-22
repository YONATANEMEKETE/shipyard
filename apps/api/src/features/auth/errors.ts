import { AUTH_ERROR_CODES } from '@shipyard/shared';
import { AppError } from '../../common/errors/AppError.js';

/** 401 AUTH_UNAUTHORIZED — missing/expired/invalid session (api-design §6). */
export class AuthUnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, AUTH_ERROR_CODES.UNAUTHORIZED, message);
  }
}

/**
 * Better Auth error mapping (04-api-design.md §6).
 *
 * Better Auth returns `{ message, code, status }` bodies on failure; the
 * auth handler wrapper maps them into the global error envelope with the
 * documented AUTH_* codes before they leave the API.
 */

interface MappedAuthError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

const TOKEN_ERRORS = new Set([
  'INVALID_TOKEN',
  'EXPIRED_VERIFICATION_TOKEN',
  'INVALID_VERIFICATION_CODE',
  'INVALID_RESET_PASSWORD_TOKEN',
  'EXPIRED_RESET_PASSWORD_TOKEN',
  'INVALID_EMAIL_CHANGE_TOKEN',
  'EMAIL_CHANGE_TOKEN_INVALID',
  'EMAIL_CHANGE_TOKEN_EXPIRED',
]);

const INPUT_ERRORS = new Set([
  'PASSWORD_TOO_SHORT',
  'WEAK_PASSWORD',
  'INVALID_EMAIL',
  'INVALID_PASSWORD',
  'PASSWORD_MISMATCH',
  'EMAIL_ALREADY_VERIFIED',
]);

/**
 * Map a Better Auth error body to the AUTH_* envelope. Returns undefined for
 * unknown codes — the wrapper then passes the original code/message through
 * the envelope unchanged rather than inventing a classification.
 */
export function mapAuthError(body: {
  code?: string;
  message?: string;
  status?: number;
}): MappedAuthError | undefined {
  const code = body.code ?? 'UNKNOWN_ERROR';

  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      // Generic on purpose (04-api-design.md §6): never reveals which field
      // was wrong.
      return {
        status: 400,
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      };
    case 'USER_ALREADY_EXISTS':
      return {
        status: 400,
        code: AUTH_ERROR_CODES.EMAIL_IN_USE,
        message: 'An account with this email already exists',
      };
    case 'EMAIL_NOT_VERIFIED':
      return {
        status: 403,
        code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
        message: 'Verify your email before signing in',
      };
    case 'USER_NOT_FOUND':
    case 'SESSION_NOT_FOUND':
    case 'ACCOUNT_NOT_FOUND':
      return {
        status: 401,
        code: AUTH_ERROR_CODES.UNAUTHORIZED,
        message: 'Authentication required',
      };
    case 'INVALID_OAUTH_STATE':
    case 'OAUTH_FAILED':
      return {
        status: 400,
        code: AUTH_ERROR_CODES.OAUTH_FAILED,
        message: 'Sign in with this provider failed, please try again',
      };
    default:
      break;
  }

  if (TOKEN_ERRORS.has(code)) {
    return {
      status: 400,
      code: AUTH_ERROR_CODES.TOKEN_INVALID,
      message: 'This link is invalid or has expired',
    };
  }

  if (INPUT_ERRORS.has(code)) {
    return {
      status: 400,
      code: AUTH_ERROR_CODES.INVALID_INPUT,
      message: body.message ?? 'Invalid input',
    };
  }

  return undefined;
}
