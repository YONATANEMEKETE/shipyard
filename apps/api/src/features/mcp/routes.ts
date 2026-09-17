import { Router } from 'express';
import {
  createMcpTokenSchema,
  listMcpTokensQuerySchema,
} from '@shipyard/shared';
import { requireSession } from '../../common/middlewares/requireSession.js';
import { validate } from '../../common/middlewares/validate.js';
import { resolveWorkspaceContext } from '../../common/guards/workspace-context.js';
import { slugParamsSchema, tokenIdParamsSchema } from './schemas.js';
import {
  createMcpTokenController,
  listMcpTokensController,
  revokeMcpTokenController,
} from './controller.js';

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
 *   security action and must never be blocked by lifecycle state.
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
