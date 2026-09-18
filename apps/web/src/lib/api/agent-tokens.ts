import type {
  CreateMcpTokenRequest,
  CreateMcpTokenResponse,
  DeleteMcpTokenResponse,
  ListMcpTokensResponse,
  RevokeMcpTokenResponse,
} from '@shipyard/shared';

import { requestJson } from '@/lib/api/request';

// ─────────────────────────────────────────────────────────────────────────────
// Agent-access API client (F13) — workspace-scoped: every call carries a slug
// because a token belongs to exactly one workspace (data-model D3).
//
// Vocabulary, deliberately split: the URL and the UI say "agent access" /
// "agent tokens" (what a member understands), while the shared contracts say
// `McpToken*` (what the protocol and the database say). This file is the seam
// between the two — it never renames the payloads, it only labels the handles.
//
// Browser → Next rewrite → internal API (ADR-003). Every request forwards the
// HttpOnly session cookie via credentials:include. Envelopes: success
// { data }, error { error: { code, message, ... } }.
//
// Route table mirrors the API (api-design §2): create, list (own, or the whole
// workspace for OWNER|ADMIN with ?all=true), revoke (idempotent), delete
// (final — the row leaves the database, which is how a revoked connection stops
// showing up).
//
// NOTE: `createAgentToken` is the only call in the app whose response contains
// a usable secret. Callers must treat the returned `token` as display-once —
// see the hooks for why it is never written into the query cache.
// ─────────────────────────────────────────────────────────────────────────────

export class AgentTokensApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
  }) {
    super(args.message);
    this.name = 'AgentTokensApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

function tokensBase(slug: string): string {
  return `/api/v1/workspaces/${slug}/agent-tokens`;
}

// ── List (#2) ──

/**
 * A member's own connections; `all: true` asks for every connection in the
 * workspace, which the API honours only for OWNER|ADMIN — anyone else simply
 * receives their own list, so no client-side role check is required here (the
 * caller decides whether to *offer* the switch).
 */
export function listAgentTokens(
  slug: string,
  { all = false }: { all?: boolean } = {},
): Promise<ListMcpTokensResponse> {
  return requestJson<ListMcpTokensResponse>(
    all ? `${tokensBase(slug)}?all=true` : tokensBase(slug),
    { method: 'GET' },
    'Failed to load agent connections',
    AgentTokensApiError,
  );
}

// ── Create (#1) ──

/** Replies 201 with the card **plus** the plaintext token — shown once. */
export function createAgentToken(
  slug: string,
  body: CreateMcpTokenRequest,
): Promise<CreateMcpTokenResponse> {
  return requestJson<CreateMcpTokenResponse>(
    tokensBase(slug),
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create the connection',
    AgentTokensApiError,
  );
}

// ── Revoke (#4) ──

/** Idempotent: revoking an already-revoked token returns the same card. */
export function revokeAgentToken(
  slug: string,
  tokenId: string,
): Promise<RevokeMcpTokenResponse> {
  return requestJson<RevokeMcpTokenResponse>(
    `${tokensBase(slug)}/${tokenId}/revoke`,
    { method: 'POST' },
    'Failed to revoke the connection',
    AgentTokensApiError,
  );
}

// ── Delete (#5) ──

/**
 * Removes a connection for good: the row goes with its hash, so it disappears
 * from the list and can never resolve again. Every destructive route in the
 * product asks for the same literal `{ confirm: true }` body — the confirm
 * dialog is what makes the member mean it, and this is that answer.
 */
export function deleteAgentToken(
  slug: string,
  tokenId: string,
): Promise<DeleteMcpTokenResponse> {
  return requestJson<DeleteMcpTokenResponse>(
    `${tokensBase(slug)}/${tokenId}`,
    { method: 'DELETE', body: JSON.stringify({ confirm: true }) },
    'Failed to delete the connection',
    AgentTokensApiError,
  );
}
