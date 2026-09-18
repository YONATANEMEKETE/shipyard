import {
  mcpToolSchema,
  type McpTokenScope,
  type McpTool,
} from '@shipyard/shared';
import { logger } from '../../common/logger/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// The tool registry (F13)
//
// Tool definitions are **code, not data** (ADR-005): the registry ships with the
// binary, there is no runtime registration and no database table for it. That is
// what makes `tools/list` cacheable and its order deterministic.
//
// M3 (this milestone) ships the registry **empty** — the transport, discovery
// and the tools/list contract are what it establishes, and the gate is an MCP
// client connecting and receiving a valid, empty tool list. The eight read tools
// arrive in M5, the writes in M7, the gated lifecycle tools in M8; each lands
// here as one entry plus its handler, in the order below, because that order is
// what clients see.
// ─────────────────────────────────────────────────────────────────────────────

export interface McpToolEntry {
  /** The scope a token must carry to even see this tool (§5.4). */
  readonly scope: McpTokenScope;
  /** The definition as advertised — names, descriptions, JSON Schema, hints. */
  readonly definition: McpTool;
}

/**
 * Fixed order = the order `tools/list` returns, always. Stable prefixes improve
 * client-side caching and prompt-cache hits (§5.4); a `Map` or a sort over a
 * dynamic source would trade that away for nothing.
 */
export const MCP_TOOL_REGISTRY: readonly McpToolEntry[] = [];

/**
 * The tools a caller may discover.
 *
 * `scopes` is the credential's scope list; omitting it means "no credential
 * filter" (the M3 transport has no credential yet — M4 resolves one, M5 passes
 * its scopes here). A definition that fails its own contract is logged and
 * skipped rather than failing the list: one bad entry must never cost a caller
 * the whole surface (§5.4).
 */
export function advertisedTools(scopes?: readonly McpTokenScope[]): McpTool[] {
  const permitted =
    scopes === undefined
      ? MCP_TOOL_REGISTRY
      : MCP_TOOL_REGISTRY.filter((entry) => scopes.includes(entry.scope));

  const tools: McpTool[] = [];

  for (const entry of permitted) {
    const parsed = mcpToolSchema.safeParse(entry.definition);

    if (!parsed.success) {
      logger.error(
        {
          tool: entry.definition.name,
          issues: parsed.error.issues.map((issue) => issue.message),
        },
        'mcp.registry.malformed_tool',
      );
      continue;
    }

    tools.push(parsed.data);
  }

  return tools;
}

/** Registry lookup by advertised name — the `tools/call` dispatch key (§5.5). */
export function findTool(name: string): McpToolEntry | undefined {
  return MCP_TOOL_REGISTRY.find((entry) => entry.definition.name === name);
}
