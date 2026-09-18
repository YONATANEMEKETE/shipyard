import { MCP_META_KEYS, type McpCallToolResult } from '@shipyard/shared';
import { AppError } from '../../common/errors/AppError.js';

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
