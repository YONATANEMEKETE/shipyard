import { MCP_TOOL_NAMES, restoreIssueArgumentsSchema } from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { issuesService } from '../../issues/service.js';
import {
  issueLine,
  issueProjection,
  listResult,
  resolveIssueRef,
  toolInputSchema,
  type McpToolContext,
} from './context.js';

/**
 * `shipyard_restore_issue` — put an archived issue back on the board.
 *
 * The undo for `shipyard_archive_issue`, and the pair exists so the reversible
 * action is always one call away in both directions — the restore an archive
 * implies must not require a different kind of credential or a different tool
 * family. It restores to the state the issue already had: nothing about the work
 * is recomputed, only `archivedAt` is cleared, with the `RESTORED` history row
 * and the activity row the service writes.
 *
 * It resolves an archived issue, which is the one place on this surface where
 * reading an archived record is the point rather than a surprise — hence the
 * description inviting the caller to name it directly.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = restoreIssueArgumentsSchema.parse(raw);
  const { context, credential } = tool;

  const found = await resolveIssueRef(args.issue, tool);
  if (!found.ok) return found.result;

  const restored = await issuesService.restore(
    context,
    credential.userId,
    found.value.id,
    true,
  );

  return listResult({
    heading: `Restored ${restored.identifier}`,
    note: 'back on the board',
    lines: [
      issueLine(restored),
      '- it appears in list results again, in the state it had before it was archived',
    ],
    structured: { issue: issueProjection(restored) },
  });
}

export const restoreIssueTool: McpToolEntry = {
  scope: 'ISSUES_DELETE',
  argumentsSchema: restoreIssueArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.restoreIssue,
    title: 'Restore an archived issue',
    description: [
      'Bring an archived issue back to the board, in the state it had when it was archived.',
      'Use it when the person says something was archived by mistake or is needed again; the issue is named exactly as it was, by its SHIP-42 identifier.',
      'It changes nothing else about the issue — status, assignee, labels and history are all as they were.',
      'An issue that is not archived is refused rather than restored twice.',
      'There is no restore for a permanently deleted issue — that call cannot be undone, which is why this tool exists.',
    ].join(' '),
    inputSchema: toolInputSchema(restoreIssueArgumentsSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
