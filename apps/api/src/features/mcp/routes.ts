import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  createMcpTokenSchema,
  deleteMcpTokenSchema,
  listMcpTokensQuerySchema,
  MCP_ERROR_CODES,
} from '@shipyard/shared';
import { logger } from '../../common/logger/index.js';
import { requireSession } from '../../common/middlewares/requireSession.js';
import { validate } from '../../common/middlewares/validate.js';
import { resolveWorkspaceContext } from '../../common/guards/workspace-context.js';
import { slugParamsSchema, tokenIdParamsSchema } from './schemas.js';
import {
  createMcpTokenController,
  deleteMcpTokenController,
  listMcpTokensController,
  revokeMcpTokenController,
} from './controller.js';
import { jsonRpcErrorResponse } from './errors.js';
import { handleMcpMessage } from './rpc.js';
import { requireTrustedOrigin } from './transport.js';

/**
 * Agent-access routes (F13) — mounted at
 * `/api/v1/workspaces/:slug/agent-tokens` (api-design.md §2).
 *
 * Guard chain is the canonical one: `requireSession → resolveWorkspaceContext`
 * with no role gate, because issuance is a **member** capability — a token can
 * never exceed its owner's role (the scope ceiling is enforced in the service,
 * and the role check runs again on every action the token takes). Owner/Admin
 * power surfaces where the incident actually happens: revoking someone else's
 * credential.
 *
 * Archived workspace handling differs per route on purpose:
 * - **create** requires an active workspace (`rejectArchived: true`) — no new
 *   credentials for a frozen workspace;
 * - **list** works while archived — a member must always be able to see what
 *   they have issued;
 * - **revoke** works while archived — killing a leaked credential is a
 *   security action and must never be blocked by lifecycle state;
 * - **delete** works while archived too — clearing a dead credential out of a
 *   frozen workspace is the same security housekeeping, and it carries the
 *   product's destructive-action confirmation body.
 *
 * `:slug` resolution is deliberately scoped to the router: `/mcp` itself is a
 * separate, token-authenticated surface (M3/M4) and shares no guard chain with
 * these browser-authenticated routes.
 */

export const workspaceAgentTokensRouter = Router({ mergeParams: true });

// Create — any member; active workspace; body contract from packages/shared.
workspaceAgentTokensRouter.post(
  '/',
  requireSession,
  validate.all({ params: slugParamsSchema, body: createMcpTokenSchema }),
  resolveWorkspaceContext({ rejectArchived: true }),
  createMcpTokenController,
);

// List — any member (own tokens; `?all=true` honoured for OWNER|ADMIN).
workspaceAgentTokensRouter.get(
  '/',
  requireSession,
  validate.all({ params: slugParamsSchema, query: listMcpTokensQuerySchema }),
  resolveWorkspaceContext(),
  listMcpTokensController,
);

// Revoke — the token's owner, or OWNER|ADMIN; idempotent; allowed while archived.
workspaceAgentTokensRouter.post(
  '/:tokenId/revoke',
  requireSession,
  validate.params(tokenIdParamsSchema),
  resolveWorkspaceContext(),
  revokeMcpTokenController,
);

// Delete — the token's owner, or OWNER|ADMIN; removes the row for good, which
// is how a revoked connection leaves the member's list. The literal
// `{ confirm: true }` body is the product's destructive-endpoint contract.
workspaceAgentTokensRouter.delete(
  '/:tokenId',
  requireSession,
  validate.all({ params: tokenIdParamsSchema, body: deleteMcpTokenSchema }),
  resolveWorkspaceContext(),
  deleteMcpTokenController,
);

// ─────────────────────────────────────────────────────────────────────────────
// The MCP protocol endpoint — `/mcp` (M3)
//
// A *second, separate* surface mounted at the API root: it has no `:slug` (the
// workspace is a property of the credential, never of the path), no session
// cookie, and no shared guard chain with the management routes above. The only
// thing the two have in common is this module.
//
// Mounted in app.ts at `/mcp` before notFoundHandler, and reachable from a
// browser only through the Next rewrite (ADR-005): the API port stays
// unpublished, so the public path is `https://<web-host>/mcp`.
//
// M3 (this milestone) is transport + discovery. Credential resolution is M4 —
// until it lands, this endpoint answers `server/discover` and `tools/list` for
// anyone who can reach it, which is why local-only exposure matters right now.
// ─────────────────────────────────────────────────────────────────────────────

export const mcpRouter = Router();

// The guard chain's first step, applied to every method: a page running in
// someone else's browser must not be able to drive this endpoint at all.
mcpRouter.use(requireTrustedOrigin);

/**
 * `GET` / `DELETE` ⇒ `405`. A modern-only server answers the pre-`2026-07-28`
 * clients that expect a standalone SSE stream or a session-terminating DELETE
 * with "this endpoint is POST-only" rather than pretending to understand them
 * (api-design §2 #1).
 */
function mcpMethodNotAllowed(request: Request, response: Response): void {
  logger.warn(
    {
      requestId: typeof request.id === 'string' ? request.id : undefined,
      method: request.method,
      path: request.originalUrl,
    },
    'mcp.method.not_allowed',
  );

  response.setHeader('Allow', 'POST');
  response
    .status(405)
    .json(
      jsonRpcErrorResponse(
        null,
        MCP_ERROR_CODES.invalidRequest,
        'The MCP endpoint accepts POST only.',
      ),
    );
}

mcpRouter.get('/', mcpMethodNotAllowed);
mcpRouter.delete('/', mcpMethodNotAllowed);

mcpRouter.post('/', (request: Request, response: Response) => {
  const outcome = handleMcpMessage(request);

  // A notification is acknowledged with an empty 202 — no body to send.
  if (outcome.body === undefined) {
    response.status(outcome.status).end();
    return;
  }

  response.status(outcome.status).json(outcome.body);
});

/**
 * Turns an unparseable JSON body into the JSON-RPC error this surface promises,
 * instead of the shared HTTP envelope the rest of the API returns.
 *
 * Registered in `app.ts` rather than inside the router above, and that placement
 * is the point: the global `express.json()` runs before this mount, so a body it
 * rejects never enters the router's own stack — the error would sail past every
 * middleware here and land in the API's `errorHandler` as `400 { error: {...} }`,
 * which a JSON-RPC client cannot read.
 */
export function mcpBodyParseErrorHandler(
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const isParseFailure =
    (error as { type?: string } | null)?.type === 'entity.parse.failed';

  if (!isParseFailure || !request.path.startsWith('/mcp')) {
    next(error);
    return;
  }

  logger.warn(
    {
      requestId: typeof request.id === 'string' ? request.id : undefined,
      path: request.originalUrl,
    },
    'mcp.body.unparseable',
  );

  response
    .status(400)
    .json(
      jsonRpcErrorResponse(
        null,
        MCP_ERROR_CODES.parseError,
        'The request body is not valid JSON.',
      ),
    );
}
