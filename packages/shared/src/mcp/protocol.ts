import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// MCP protocol contracts
//
// Owned by the mcp module. Consumed by the API (`/mcp`'s envelope, version and
// result handling) and by tests. Mirrors the MCP specification revision
// 2026-07-28 — see shipyard-design/04-Engineering/features/mcp/api-design.md §5
// and ADR-005.
//
// Scope discipline: this file describes the *wire* — JSON-RPC envelopes, the
// protocol revision, error codes, and the shape of a tool result. It does not
// describe tools. A tool's definition is code in the API's registry, and a
// tool's own argument contract lands in ./tools.ts with the tool that needs it
// (M5 reads, M7 writes) so a contract never ships ahead of its handler.
// ─────────────────────────────────────────────────────────────────────────────

// ── Protocol revision ──

// The single revision this server speaks. Modern revisions carry version,
// identity and capabilities as per-request metadata — no `initialize`
// handshake, no protocol-level sessions, no standalone GET stream (ADR-005).
export const MCP_PROTOCOL_VERSION = '2026-07-28';

export const MCP_SUPPORTED_VERSIONS = [MCP_PROTOCOL_VERSION] as const;

// ── Transport header names ──

// Canonical spelling from the spec. HTTP field names are case-insensitive and
// Express lower-cases everything it reads, so lookups use the lower-case form.
export const MCP_HEADERS = {
  protocolVersion: 'MCP-Protocol-Version',
  method: 'Mcp-Method',
  name: 'Mcp-Name',
} as const;

// JSON-RPC methods this server implements. An unimplemented method is a 404
// with `methodNotFound` — never a 400 (api-design §5.2).
export const MCP_METHODS = {
  discover: 'server/discover',
  listTools: 'tools/list',
  callTool: 'tools/call',
} as const;

export type McpMethod = (typeof MCP_METHODS)[keyof typeof MCP_METHODS];

// ── Error codes ──

// Standard JSON-RPC codes plus the two this revision reserves for itself
// (`-32020`, `-32022`). Codes are partitioned by the spec: `-32000…-32019` is
// legacy and must not be emitted, `-32020…-32099` is spec-owned. Application
// error codes travel inside tool results, never here (api-design §8).
export const MCP_ERROR_CODES = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  headerMismatch: -32020,
  unsupportedProtocolVersion: -32022,
} as const;

// Namespaced `_meta` keys for server-side diagnostics that must NOT become
// model-visible prose: the domain error code and the request id ride here, so
// logs can be joined to a report without spending tokens or inviting the model
// to pattern-match on a code the sentence already explained.
export const MCP_META_KEYS = {
  serverInfo: 'io.modelcontextprotocol/serverInfo',
  errorCode: 'io.shipyard/errorCode',
  requestId: 'io.shipyard/requestId',
} as const;

// ── JSON-RPC 2.0 envelope ──

// Request: `id` must be present and must not be null. Notifications (no `id`)
// are accepted and answered with 202; the core protocol defines none
// client→server over HTTP, so an accepted notification does nothing.
export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number().int()]),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

export const jsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

export type JsonRpcNotification = z.infer<typeof jsonRpcNotificationSchema>;

// Per-request metadata. The protocol version is mandatory and must equal the
// `MCP-Protocol-Version` header; clientInfo/clientCapabilities are recorded
// for diagnostics and never trusted for authorization.
export const mcpRequestMetaSchema = z.object({
  'io.modelcontextprotocol/protocolVersion': z.string().min(1),
  'io.modelcontextprotocol/clientInfo': z
    .object({ name: z.string(), version: z.string() })
    .optional(),
  'io.modelcontextprotocol/clientCapabilities': z
    .record(z.string(), z.unknown())
    .optional(),
});

export type McpRequestMeta = z.infer<typeof mcpRequestMetaSchema>;

// ── Tool definitions (as the server advertises them) ──

// Hints only — the spec is explicit that clients must not make tool-use
// decisions on annotations from an untrusted server, and that Shipyard's own
// permission checks are the real gate. `destructiveHint` defaults to true per
// the spec, which is why every tool declares it explicitly rather than
// inheriting "potentially destructive" by omission.
export const mcpToolAnnotationsSchema = z.object({
  title: z.string().optional(),
  readOnlyHint: z.boolean().optional(),
  destructiveHint: z.boolean().optional(),
  idempotentHint: z.boolean().optional(),
  openWorldHint: z.boolean().optional(),
});

export type McpToolAnnotations = z.infer<typeof mcpToolAnnotationsSchema>;

export const jsonSchemaObjectSchema = z
  .object({
    $schema: z.string().optional(),
    type: z.literal('object'),
  })
  .catchall(z.unknown());

export type JsonSchemaObject = z.infer<typeof jsonSchemaObjectSchema>;

export const mcpToolSchema = z.object({
  name: z.string().min(1).max(128),
  title: z.string().optional(),
  description: z.string().min(1),
  inputSchema: jsonSchemaObjectSchema,
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  annotations: mcpToolAnnotationsSchema.optional(),
});

export type McpTool = z.infer<typeof mcpToolSchema>;

// ── Results ──

// v1 returns text blocks only: every result carries one short human-readable
// sentence, and machine-stable shapes additionally travel in
// `structuredContent` (api-design §7).
export const mcpTextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export type McpTextContent = z.infer<typeof mcpTextContentSchema>;

// `isError: true` means the call was understood and failed as a *domain*
// outcome (validation, permission, archived resource, conflict, limit). The
// model reads that text to correct itself, so the mapper in the API always
// supplies an actionable sentence (api-design §8.2).
export const mcpCallToolResultSchema = z.object({
  resultType: z.literal('complete'),
  content: z.array(mcpTextContentSchema),
  structuredContent: z.unknown().optional(),
  isError: z.boolean().optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

export type McpCallToolResult = z.infer<typeof mcpCallToolResultSchema>;

// `server/discover` — the server's business card, and the one place
// cross-tool guidance lives (`instructions`).
export const mcpServerInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
});

export const mcpDiscoverResultSchema = z.object({
  resultType: z.literal('complete'),
  supportedVersions: z.array(z.string().min(1)).min(1),
  capabilities: z.object({
    tools: z.object({ listChanged: z.boolean().optional() }).optional(),
  }),
  _meta: z.object({
    [MCP_META_KEYS.serverInfo]: mcpServerInfoSchema,
  }),
  instructions: z.string().optional(),
  ttlMs: z.number().int().nonnegative(),
  cacheScope: z.enum(['public', 'private']),
});

export type McpDiscoverResult = z.infer<typeof mcpDiscoverResultSchema>;

// `tools/list` — deterministic order, cacheable, and credential-dependent
// (a token only discovers the tools its scopes permit), hence private scope.
// No `nextCursor` in v1: the registry is small enough to return whole.
export const mcpListToolsResultSchema = z.object({
  resultType: z.literal('complete'),
  tools: z.array(mcpToolSchema),
  ttlMs: z.number().int().nonnegative(),
  cacheScope: z.enum(['public', 'private']),
});

export type McpListToolsResult = z.infer<typeof mcpListToolsResultSchema>;

// JSON-RPC error response body (protocol-level failures only).
export const jsonRpcErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
});

export type JsonRpcError = z.infer<typeof jsonRpcErrorSchema>;
