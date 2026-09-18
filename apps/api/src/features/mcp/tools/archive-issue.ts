import { MCP_TOOL_NAMES, archiveIssueArgumentsSchema } from '@shipyard/shared';
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
 * `shipyard_archive_issue` — take an issue off the board without losing it.
 *
 * Reversible, and therefore an ordinary gated action rather than a deletion
 * (spec §3.4): archiving is not deleting, and the tool says which one it is so
 * a model never treats the two as interchangeable. The issue keeps its history
 * and stays readable by identifier, which is the product's own rule (F5) and the
 * reason `archive` is safe to offer at all.
 *
 * The service's `confirm` flag is satisfied here rather than asked of the
 * caller: its purpose on the HTTP surface is to make a stray request impossible,
 * and a call named `shipyard_archive_issue` naming one issue is already that
 * intent stated. The service still owns everything else — the workspace-writable
 * check, the `ALREADY_ARCHIVED` refusal, the `ARCHIVED` history row and the
 * activity row.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = archiveIssueArgumentsSchema.parse(raw);
  const { context, credential } = tool;

  const found = await resolveIssueRef(args.issue, tool);
  if (!found.ok) return found.result;

  const archived = await issuesService.archive(
    context,
    credential.userId,
    found.value.id,
    true,
  );

  return listResult({
    heading: `Archived ${archived.identifier}`,
    note: 'reversible — nothing was deleted',
    lines: [
      issueLine(archived),
      '- it stays readable by identifier, and shipyard_restore_issue puts it back',
      '- it no longer appears in list results unless includeArchived is asked for',
    ],
    structured: { issue: issueProjection(archived) },
  });
}

export const archiveIssueTool: McpToolEntry = {
  scope: 'ISSUES_DELETE',
  argumentsSchema: archiveIssueArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.archiveIssue,
    title: 'Archive an issue',
    description: [
      'Take an issue off the board while keeping it — archived is not deleted, and everything about it survives.',
      'Use it for work that is finished with, duplicated or dropped; use shipyard_restore_issue to bring it back.',
      'Of the three lifecycle tools this is the reversible one, so prefer it over shipyard_delete_issue unless the person has clearly asked for permanent removal.',
      'An archived issue can still be read by identifier and still counts as history; an already-archived issue is refused rather than archived twice.',
      'It cannot archive a project or a cycle — only an issue.',
    ].join(' '),
    inputSchema: toolInputSchema(archiveIssueArgumentsSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
