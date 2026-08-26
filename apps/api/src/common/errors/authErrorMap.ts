import { ErrorCodes, type ErrorCode } from './codes.js';

/**
 * Mapping from Better Auth error codes (BASE_ERROR_CODES / plugin codes) to
 * the app's envelope contract: an ErrorCodes value plus the HTTP status to
 * respond with.
 *
 * Better Auth surfaces errors as `APIError`s whose body carries
 * `{ code, message }`. The auth node handler (`lib/authNodeHandler.ts`) uses
 * this table to translate them; anything not listed falls back to a mapping
 * by HTTP status.
 */
export interface MappedAuthError {
  statusCode: number;
  code: ErrorCode;
}

const conflict = (code: ErrorCode = ErrorCodes.CONFLICT): MappedAuthError => ({
  statusCode: 409,
  code,
});

const unauthorized = (): MappedAuthError => ({
  statusCode: 401,
  code: ErrorCodes.UNAUTHORIZED,
});

const validation = (): MappedAuthError => ({
  statusCode: 400,
  code: ErrorCodes.VALIDATION_ERROR,
});

const notFound = (): MappedAuthError => ({
  statusCode: 404,
  code: ErrorCodes.NOT_FOUND,
});

/**
 * Explicit code-level mapping for cases where the semantics differ from (or
 * are more precise than) the HTTP status Better Auth would send.
 */
const AUTH_CODE_MAP: Record<string, MappedAuthError> = {
  // Account/identity conflicts
  USER_ALREADY_EXISTS: conflict(),
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: conflict(),
  USER_ALREADY_HAS_PASSWORD: conflict(),
  SOCIAL_ACCOUNT_ALREADY_LINKED: conflict(),
  LINKED_ACCOUNT_ALREADY_EXISTS: conflict(),

  // Authentication failures
  INVALID_EMAIL_OR_PASSWORD: unauthorized(),
  CREDENTIAL_ACCOUNT_NOT_FOUND: unauthorized(),
  EMAIL_NOT_VERIFIED: unauthorized(),
  FAILED_TO_GET_USER_INFO: unauthorized(),

  // Session/token failures
  SESSION_EXPIRED: unauthorized(),
  SESSION_NOT_FRESH: unauthorized(),
  INVALID_TOKEN: unauthorized(),
  TOKEN_EXPIRED: unauthorized(),
  USER_EMAIL_NOT_FOUND: unauthorized(),

  // Input problems (Better Auth throws these as BAD_REQUEST on sign-up/
  // sign-in for malformed emails and missing/incorrect passwords)
  PASSWORD_TOO_SHORT: validation(),
  PASSWORD_TOO_LONG: validation(),
  INVALID_USER: validation(),
  INVALID_EMAIL: validation(),
  INVALID_PASSWORD: validation(),

  // Missing resources
  USER_NOT_FOUND: notFound(),
  ACCOUNT_NOT_FOUND: notFound(),
};

/**
 * Fallback when the thrown error has no recognized Better Auth code: derive
 * the envelope from the HTTP status alone, mirroring the conventions used by
 * the global Express error handler.
 */
const STATUS_MAP: Record<number, MappedAuthError> = {
  400: { statusCode: 400, code: ErrorCodes.BAD_REQUEST },
  401: { statusCode: 401, code: ErrorCodes.UNAUTHORIZED },
  403: { statusCode: 403, code: ErrorCodes.FORBIDDEN },
  404: { statusCode: 404, code: ErrorCodes.NOT_FOUND },
  // Better Auth uses EXPECTATION_FAILED for some account-linking failures
  417: { statusCode: 400, code: ErrorCodes.BAD_REQUEST },
  422: validation(),
  429: { statusCode: 429, code: ErrorCodes.RATE_LIMITED },
};

const INTERNAL: MappedAuthError = {
  statusCode: 500,
  code: ErrorCodes.INTERNAL_SERVER_ERROR,
};

export function mapAuthError(
  authCode: string | undefined,
  statusCode: number,
): MappedAuthError {
  if (authCode !== undefined) {
    const byCode = AUTH_CODE_MAP[authCode];
    if (byCode !== undefined) return byCode;
  }

  return STATUS_MAP[statusCode] ?? INTERNAL;
}

/**
 * True when the mapped error is internal — its message must be replaced by a
 * generic one so internals never leak through auth responses either.
 */
export function isInternalAuthError(mapped: MappedAuthError): boolean {
  return mapped.code === ErrorCodes.INTERNAL_SERVER_ERROR;
}
