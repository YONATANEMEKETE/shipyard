import { z } from 'zod';

import { confirmActionSchema } from '../workspace/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// MCP token contracts (agent credentials)
//
// Owned by the mcp module. Consumed by the API (creation, listing, revocation,
// and the `/mcp` auth path) and by the web app (the account-settings "Agent
// access" surface). Mirrors the Prisma enum in apps/api/prisma/schema.prisma —
// see shipyard-design/04-Engineering/features/mcp/data-model.md §2 and
// api-design.md §2–§3.
//
// Scope discipline baked into the shapes: a token is workspace-bound and
// member-owned, so no request here carries a `workspaceId` (it comes from the
// `:slug` route context) and none carries a `userId` (it comes from the
// session). The plaintext token appears exactly once, in the creation
// response; every other shape exposes only the prefix.
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums (mirror Prisma) ──

// The closed set of permissions a token may carry. Deliberately coarse: scopes
// decide what a token may *attempt*, while the member's workspace role decides
// what the person may *do*. Both gates run on every action.
export const mcpTokenScopeSchema = z.enum([
  'READ',
  'ISSUES_WRITE',
  'COMMENTS_WRITE',
  'ISSUES_DELETE',
]);

export type McpTokenScope = z.infer<typeof mcpTokenScopeSchema>;

// The issuance ceiling (api-design §3.2): a member cannot mint a token whose
// scopes exceed what their role may do. Shared so the API enforces it and the
// web surface hides what it cannot offer — one source of truth, no drift.
// `ISSUES_DELETE` follows F5's rule that issue deletion is OWNER|ADMIN.
export const MCP_SCOPE_MIN_ROLE: Record<McpTokenScope, 'MEMBER' | 'ADMIN'> = {
  READ: 'MEMBER',
  ISSUES_WRITE: 'MEMBER',
  COMMENTS_WRITE: 'MEMBER',
  ISSUES_DELETE: 'ADMIN',
};

// Default when a creation request omits `scopes` — read-only is the safe
// default, and the surface should feel like it chose the conservative option
// on the member's behalf.
export const MCP_DEFAULT_SCOPES: readonly McpTokenScope[] = ['READ'];

// The scopes every credential carries, whatever was asked for (spec §3.1). A
// connection that cannot read cannot usefully write: it cannot find the thing it
// was asked to change, and every tool description that says "read it first"
// would be describing something it cannot do. So `READ` is granted — not
// "implied" — on issuance, and the surfaces render it as a fixed choice rather
// than one that can be turned off.
export const MCP_ALWAYS_GRANTED_SCOPES: readonly McpTokenScope[] = ['READ'];

// ── Canonical token shape ──

// A recognisable, greppable prefix: log redaction, secret scanners, and
// support conversations all depend on a token being identifiable on sight.
// The stored value is a SHA-256 hash; the prefix is the only part kept in
// cleartext (data-model D2, D8).
export const MCP_TOKEN_PREFIX = 'shp_';

// 32 random bytes, base64url-encoded (data-model D2).
export const MCP_TOKEN_BYTES = 32;

// How many characters of the token the card exposes, including the prefix —
// enough to match a row against a config file, not enough to use.
export const MCP_TOKEN_PREFIX_LENGTH = 12;

// ── Canonical bounds ──

// Label bound — the member's own name for the credential ("laptop", "ci").
// Trimmed server-side; empty-after-trim is rejected because an unlabelled
// credential is one a member cannot safely revoke.
export const mcpTokenLabelSchema = z
  .string({ message: 'Give this connection a name' })
  .trim()
  .min(1, 'Give this connection a name')
  .max(60, 'Keep the name under 60 characters');

export type McpTokenLabel = z.infer<typeof mcpTokenLabelSchema>;

// ── Request contracts ──

// Creation. `.strict()` is the same firewall the settings profile update uses:
// a stray key (say `workspaceId` or `userId`) is a 400, never a silent strip —
// the test-observable proof that binding comes from the route context and the
// session, not from the request body.
//
// `expiresAt` is optional; omitting it means "no expiry". An expired token is
// treated exactly like a revoked one at auth time (data-model D7) — one
// predicate, one message.
export const createMcpTokenSchema = z
  .object({
    label: mcpTokenLabelSchema,
    scopes: z.array(mcpTokenScopeSchema).min(1).max(4).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export type CreateMcpTokenRequest = z.infer<typeof createMcpTokenSchema>;

// Listing. `all=true` asks for every token in the workspace, which the service
// only honours for OWNER|ADMIN (api-design §2 #3); everyone else receives their
// own tokens regardless of the flag.
export const listMcpTokensQuerySchema = z.object({
  all: z.enum(['true', 'false']).optional(),
});

export type ListMcpTokensQuery = z.infer<typeof listMcpTokensQuerySchema>;

// ── Response contracts ──

// One credential as it is listed and rendered. Never contains the token or its
// hash — `tokenPrefix` is the only identifying fragment, and `revokedAt` /
// `expiresAt` drive the surface's state chips.
export const mcpTokenCardSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  label: z.string(),
  tokenPrefix: z.string(),
  scopes: z.array(mcpTokenScopeSchema),
  expiresAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type McpTokenCard = z.infer<typeof mcpTokenCardSchema>;

// The only shape in the product that carries a usable secret, returned exactly
// once on creation (201). A member who loses it revokes and creates another —
// there is no "reveal again" path by design.
export const createMcpTokenResponseSchema = mcpTokenCardSchema.extend({
  token: z.string(),
});

export type CreateMcpTokenResponse = z.infer<
  typeof createMcpTokenResponseSchema
>;

export const listMcpTokensResponseSchema = z.object({
  tokens: z.array(mcpTokenCardSchema),
});

export type ListMcpTokensResponse = z.infer<typeof listMcpTokensResponseSchema>;

// Revocation is idempotent and returns the resulting card, so the surface can
// render the new state without a second read (api-design §2 #4).
export const revokeMcpTokenResponseSchema = mcpTokenCardSchema;

export type RevokeMcpTokenResponse = z.infer<
  typeof revokeMcpTokenResponseSchema
>;

// Deletion. Revocation keeps the row (it is a timestamp, and it is the audit
// trail); deletion removes it for good — which is the only way a revoked
// connection leaves the list (api-design §2 #5).
//
// The body is the product's standard destructive-action confirmation, the same
// literal `{ confirm: true }` that comment/project/workspace deletion require:
// the surface asks, and the request repeats the answer, so a stray DELETE from
// a script cannot destroy a credential by accident.
export const deleteMcpTokenSchema = confirmActionSchema;

export const deleteMcpTokenResponseSchema = z.object({
  deletedTokenId: z.string(),
});

export type DeleteMcpTokenResponse = z.infer<
  typeof deleteMcpTokenResponseSchema
>;
