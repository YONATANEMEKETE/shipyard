import {
  mcpToolSchema,
  type McpCallToolResult,
  type McpTokenScope,
  type McpTool,
} from '@shipyard/shared';
import type { z } from 'zod';
import { logger } from '../../common/logger/index.js';
import type { McpToolContext } from './tools/context.js';
import { addCommentTool } from './tools/add-comment.js';
import { archiveIssueTool } from './tools/archive-issue.js';
import { assignIssueTool } from './tools/assign-issue.js';
import { blockIssueTool } from './tools/block-issue.js';
import { createIssueTool } from './tools/create-issue.js';
import { deleteIssueTool } from './tools/delete-issue.js';
import { getIssueTool } from './tools/get-issue.js';
import { listCyclesTool } from './tools/list-cycles.js';
import { listIssuesTool } from './tools/list-issues.js';
import { listMembersTool } from './tools/list-members.js';
import { listProjectsTool } from './tools/list-projects.js';
import { recentActivityTool } from './tools/recent-activity.js';
import { restoreIssueTool } from './tools/restore-issue.js';
import { searchTool } from './tools/search.js';
import { setIssueStatusTool } from './tools/set-issue-status.js';
import { updateIssueTool } from './tools/update-issue.js';
import { workspaceOverviewTool } from './tools/workspace-overview.js';

// ─────────────────────────────────────────────────────────────────────────────
// The tool registry (F13)
//
// Tool definitions are **code, not data** (ADR-005): the registry ships with the
// binary, there is no runtime registration and no database table for it. That is
// what makes `tools/list` cacheable and its order deterministic.
//
// M5 ships the eight read tools; M7 adds the six additive writes; M8 adds the
// three gated lifecycle tools (archive / restore / delete), which is the whole
// surface at seventeen. Each landed here as one entry plus its handler, appended
// in the order below, because that order is what clients see — reads first, so
// the vocabulary a write description is written in is already in the caller's
// tool list, and the irreversible call last.
//
// A tool's argument contract is the Zod schema from `packages/shared` — the same
// object the handler validates with. The JSON Schema advertised to the model is
// **generated** from it here, so the advertised contract and the enforced one
// cannot drift; there is no second, hand-written copy to forget.
// ─────────────────────────────────────────────────────────────────────────────

export interface McpToolEntry {
  /** The scope a token must carry to even see this tool (§5.4). */
  readonly scope: McpTokenScope;
  /** The definition as advertised — names, descriptions, JSON Schema, hints. */
  readonly definition: McpTool;
  /** The same contract the handler runs, kept for dispatch-time validation. */
  readonly argumentsSchema: z.ZodType;
  /** Validated arguments plus the resolved caller → a tool result. */
  readonly handler: (
    args: unknown,
    tool: McpToolContext,
  ) => Promise<McpCallToolResult>;
}

/**
 * Fixed order = the order `tools/list` returns, always. Stable prefixes improve
 * client-side caching and prompt-cache hits (§5.4); a `Map` or a sort over a
 * dynamic source would trade that away for nothing.
 *
 * Reads first, in the order a reader needs them: browse, retrieve, discover,
 * then the orientation tools that answer a question with one call. The writes
 * follow, in the order the write table lists them (§6.2), and the gated
 * lifecycle tools last (§6.3) — the irreversible one at the end of the list.
 */
export const MCP_TOOL_REGISTRY: readonly McpToolEntry[] = [
  listIssuesTool,
  getIssueTool,
  searchTool,
  listProjectsTool,
  listCyclesTool,
  workspaceOverviewTool,
  recentActivityTool,
  listMembersTool,
  createIssueTool,
  updateIssueTool,
  setIssueStatusTool,
  assignIssueTool,
  blockIssueTool,
  addCommentTool,
  archiveIssueTool,
  restoreIssueTool,
  deleteIssueTool,
];

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
