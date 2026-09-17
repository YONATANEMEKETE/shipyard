import { AppError } from '../../common/errors/AppError.js';

/**
 * MCP domain errors (api-design.md §7). Each extends {@link AppError} so the
 * global error handler emits the standard envelope with its `code` and
 * `statusCode`. Services throw these; controllers never build error bodies.
 *
 * Shared-cross-module errors (FORBIDDEN_ROLE, WORKSPACE_ARCHIVED,
 * WORKSPACE_NOT_FOUND) are reused from the workspace module rather than
 * duplicated here — the route guards already produce them.
 */

export const McpErrorCodes = {
  TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
  SCOPE_NOT_PERMITTED: 'SCOPE_NOT_PERMITTED',
  TOKEN_EXPIRY_INVALID: 'TOKEN_EXPIRY_INVALID',
} as const;

export type McpErrorCode = (typeof McpErrorCodes)[keyof typeof McpErrorCodes];

/**
 * 404 — the token id does not exist, is not in this workspace, or belongs to
 * another member while the caller is neither the owner of the record nor an
 * Owner/Admin of the workspace. All three cases answer identically, so a
 * member cannot use revocation to discover other members' credentials.
 */
export class McpTokenNotFoundError extends AppError {
  constructor(message = 'Agent access token not found in this workspace') {
    super(404, McpErrorCodes.TOKEN_NOT_FOUND, message);
  }
}

/**
 * 403 — a creation request asked for a scope above what the caller's role may
 * grant (api-design §3.2). The message names the scopes and the role, because
 * the surface should be able to explain itself without a second round trip.
 */
export class McpScopeNotPermittedError extends AppError {
  constructor(message: string) {
    super(403, McpErrorCodes.SCOPE_NOT_PERMITTED, message);
  }
}

/**
 * 400 — `expiresAt` was given a moment that has already passed, which would
 * mint a credential that is dead on arrival. Rejecting is kinder than creating
 * it and letting the first request fail with a 401 nobody can explain.
 */
export class McpTokenExpiryInvalidError extends AppError {
  constructor(message = 'The expiry must be in the future') {
    super(400, McpErrorCodes.TOKEN_EXPIRY_INVALID, message);
  }
}
