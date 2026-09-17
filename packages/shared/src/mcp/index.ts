// ─────────────────────────────────────────────────────────────────────────────
// MCP contracts (umbrella)
//
// The mcp feature's shared surface, split by audience:
//   protocol.ts — the wire: JSON-RPC envelopes, the protocol revision, error
//                 codes, tool definitions as advertised, and result shapes.
//   tokens.ts   — credentials: scopes, the token shape, and the create / list /
//                 revoke contracts behind the agent-access surface.
//
// Tool-specific argument contracts join them in ./tools.ts as the tools ship
// (M5 reads, M7 writes) — never ahead of the handler that validates with them.
// See shipyard-design/04-Engineering/features/mcp/api-design.md.
// ─────────────────────────────────────────────────────────────────────────────

export * from './protocol.js';
export * from './tokens.js';
