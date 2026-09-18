import {
  MCP_META_KEYS,
  type McpCallToolResult,
  type McpTokenScope,
} from '@shipyard/shared';
import { AppError } from '../../common/errors/AppError.js';
import { ErrorCodes } from '../../common/errors/codes.js';

/**
 * MCP domain errors (api-design.md §7). Each extends {@link AppError} so the
 * global error handler emits the standard envelope with its `code` and
 * `statusCode`. Services throw these; controllers never build error bodies.
 *
 * Shared-cross-module errors (FORBIDDEN_ROLE, WORKSPACE_ARCHIVED,
 * WORKSPACE_NOT_FOUND) are reused from the workspace module rather than
 * duplicated here — the route guards already produce them.
 *
 * The second half of this file is the **protocol** half: the JSON-RPC response
 * shapes and the mapper that turns any thrown error into the two things the MCP
 * surface can legally answer with — a JSON-RPC `error` for a message that could
 * not be understood, or a tool result with `isError: true` for a domain failure
 * (§8). They live together because they are the same discipline from two sides:
 * a protocol error is never a tool result, and a tool result is never a protocol
 * error.
 */

export const McpErrorCodes = {
  // ── HTTP-envelope codes (management routes, §3.3, §7) ──
  TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
  /** Issuance-time ceiling: the caller's role may not grant what was asked. */
  SCOPE_NOT_PERMITTED: 'SCOPE_NOT_PERMITTED',
  TOKEN_EXPIRY_INVALID: 'TOKEN_EXPIRY_INVALID',
  // ── Tool-result codes (§8.2) — these ride in `_meta`, never as a status ──
  /** Use-time: this credential lacks the permission the action needs. */
  SCOPE_MISSING: 'SCOPE_MISSING',
  RATE_LIMITED: 'RATE_LIMITED',
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

/**
 * 401 — the `/mcp` surface has no usable credential for this request.
 *
 * **One error for every rejection**: header missing, scheme wrong, value not a
 * token, hash unknown, revoked, expired, deleted, or the owner's membership
 * gone. The holder of a stale or stolen credential learns nothing about which of
 * those happened, there is a single code path to keep correct, and the code
 * matches the cookie path's 401 (`UNAUTHORIZED`) so a client cannot tell the two
 * doors apart (api-design §3.1).
 */
export class McpUnauthorizedError extends AppError {
  constructor(
    message = 'A valid agent access token is required for this request',
  ) {
    super(401, ErrorCodes.UNAUTHORIZED, message);
  }
}

// ── Protocol responses (the `/mcp` surface) ──

/** A JSON-RPC id is a string, a number, or null (unparseable request). */
export type JsonRpcId = string | number | null;

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export function jsonRpcResult(
  id: JsonRpcId,
  result: unknown,
): JsonRpcSuccessResponse {
  return { jsonrpc: '2.0', id, result };
}

export function jsonRpcErrorResponse(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {}),
    },
  };
}

// The sentence an unexpected failure gets instead of a stack trace, a SQL
// fragment or a Prisma message (§8.2). It is deliberately dull: the model can
// only act on "try again" here, and the reference id is what a person pastes
// into a support conversation.
const INTERNAL_FAILURE_TEXT =
  'The request could not be completed because something went wrong inside Shipyard. Try again; if it keeps failing, report this reference id.';

/**
 * Any thrown value → a tool result (§8.2).
 *
 * Two outcomes, and only two:
 * - an {@link AppError} carries a code and a message already written for a
 *   reader, so it becomes the text, with the code riding in `_meta` where it is
 *   joinable in logs without inviting the model to pattern-match on it;
 * - anything else is an internal failure: a generic sentence plus the request
 *   id, never the error's own message, which is how Prisma and driver text stay
 *   inside the server.
 *
 * `isError: true` is the transport-neutral way to say "understood, and it
 * failed" — the call itself succeeded, so this is a `200`, not a 4xx/5xx.
 */
export function toToolResultFromError(
  error: unknown,
  requestId?: string,
): McpCallToolResult {
  const meta: Record<string, unknown> = {};

  if (error instanceof AppError) {
    meta[MCP_META_KEYS.errorCode] = error.code;
    if (requestId !== undefined) {
      meta[MCP_META_KEYS.requestId] = requestId;
    }

    return {
      resultType: 'complete',
      content: [{ type: 'text', text: error.message }],
      isError: true,
      ...(Object.keys(meta).length > 0 ? { _meta: meta } : {}),
    };
  }

  meta[MCP_META_KEYS.errorCode] = 'INTERNAL_SERVER_ERROR';
  if (requestId !== undefined) {
    meta[MCP_META_KEYS.requestId] = requestId;
  }

  return {
    resultType: 'complete',
    content: [{ type: 'text', text: INTERNAL_FAILURE_TEXT }],
    isError: true,
    _meta: meta,
  };
}

/**
 * A credential that lacks the permission an action needs — the second gate
 * (api-design §3.2, §8.2).
 *
 * Answered as a tool result rather than a status: the call was understood and
 * the caller can fix it, so the model gets a sentence naming the missing
 * permission and the two ways out. The `403` in the design's table is
 * "conceptually" — with a personal access token there is no step-up flow to
 * drive, because the scopes are fixed at issuance; a new token or the UI is the
 * remedy, and that is what the text says. (The HTTP-level `403` +
 * `insufficient_scope` of the OAuth flow arrives with OAuth, §12.)
 */
export function missingScopeResult(required: McpTokenScope): McpCallToolResult {
  return {
    resultType: 'complete',
    content: [
      {
        type: 'text',
        text: `This connection does not have the "${required}" permission, so it cannot do that. Create another connection in Shipyard with that permission, or do it in the app.`,
      },
    ],
    isError: true,
    _meta: {
      [MCP_META_KEYS.errorCode]: McpErrorCodes.SCOPE_MISSING,
      requiredScope: required,
    },
  };
}
