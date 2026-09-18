import { MCP_TOOL_NAMES, assignIssueArgumentsSchema } from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { issuesService } from '../../issues/service.js';
import {
  changeLine,
  issueLine,
  issueProjection,
  listResult,
  resolveAssigneeUserId,
  resolveIssueRef,
  toolInputSchema,
  type McpToolContext,
} from './context.js';

/**
 * `shipyard_assign_issue` — give work to somebody, or take it back.
 *
 * The `null` case is the reason this is a tool and not a field: unassigning is
 * a real request ("nobody is on this yet"), and on a field it would be
 * indistinguishable from forgetting to send the key. Assigning the person who
 * already owns it is the service's no-op, reported as one — and assigning
 * somebody new is what writes the `ASSIGNED` history row and the assignment
 * notification, which the service owns.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = assignIssueArgumentsSchema.parse(raw);
  const { context, credential } = tool;

  const found = await resolveIssueRef(args.issue, tool);
  if (!found.ok) return found.result;

  const before = found.value;
  const assignee = await resolveAssigneeUserId(args.assignee, tool);
  if (!assignee.ok) return assignee.result;

  if (before.assignee?.userId === assignee.value) {
    return listResult({
      heading: `${before.identifier} is already ${
        args.assignee === null
          ? 'unassigned'
          : `assigned to ${before.assignee?.name ?? 'that person'}`
      }`,
      note: 'nothing changed',
      lines: [issueLine(before)],
      structured: { issue: issueProjection(before) },
    });
  }

  const after = await issuesService.update(
    context,
    credential.userId,
    before.id,
    {
      assigneeId: assignee.value,
    },
  );

  return listResult({
    heading:
      after.assignee === null
        ? `Unassigned ${after.identifier}`
        : `Assigned ${after.identifier} to ${after.assignee.name}`,
    note: 'saved',
    lines: [
      changeLine(
        'assignee',
        before.assignee?.name ?? null,
        after.assignee?.name ?? null,
      ),
      '',
      issueLine(after),
    ],
    structured: { issue: issueProjection(after) },
  });
}

export const assignIssueTool: McpToolEntry = {
  scope: 'ISSUES_WRITE',
  argumentsSchema: assignIssueArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.assignIssue,
    title: 'Assign an issue',
    description: [
      'Give an issue to a workspace member, or take it off whoever has it.',
      'The assignee is a member name, an email address, a user id, or "me" for the person this connection belongs to; send null to unassign.',
      'Use shipyard_list_members when you do not know who is in the workspace — a name that matches nobody changes nothing and lists who is here.',
      'The member is notified by the workspace itself; you do not need to say anything about that.',
      'Assigning the person who already owns the issue changes nothing and says so.',
    ].join(' '),
    inputSchema: toolInputSchema(assignIssueArgumentsSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
