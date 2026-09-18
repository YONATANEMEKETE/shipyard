import { MCP_TOOL_NAMES, updateIssueArgumentsSchema } from '@shipyard/shared';
import type { UpdateIssueRequest } from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { issuesService } from '../../issues/service.js';
import {
  changeLine,
  issueLine,
  issueProjection,
  listResult,
  resolveCycleRef,
  resolveIssueRef,
  resolveProjectRef,
  toolFailure,
  toolInputSchema,
  type McpToolContext,
} from './context.js';

/**
 * `shipyard_update_issue` — change what an issue says, or where it sits.
 *
 * Deliberately **not** the status/assignee/blocked tool: those three have their
 * own tools, and an argument surface that overlaps is how a model picks by coin
 * flip (the reason the write set is six tools rather than one). This one owns
 * the content and the planning relations.
 *
 * The `null` rule is the service's, kept verbatim: an omitted field is left
 * alone, and `null` unsets it — so "take it out of the cycle" is expressible,
 * and "I did not mention the cycle" is not the same request.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = updateIssueArgumentsSchema.parse(raw);
  const { context, credential } = tool;

  const found = await resolveIssueRef(args.issue, tool);
  if (!found.ok) return found.result;

  const before = found.value;
  const patch: UpdateIssueRequest = {};
  const sent: string[] = [];

  if (args.title !== undefined) {
    patch.title = args.title;
    sent.push(changeLine('title', before.title, args.title));
  }
  if (args.description !== undefined) {
    patch.description = args.description;
    sent.push(
      args.description === null
        ? '- description: cleared'
        : '- description: replaced',
    );
  }
  if (args.priority !== undefined) {
    patch.priority = args.priority;
    sent.push(
      changeLine(
        'priority',
        before.priority.toLowerCase(),
        args.priority.toLowerCase(),
      ),
    );
  }
  if (args.dueDate !== undefined) {
    patch.dueDate = args.dueDate;
    sent.push(changeLine('due', before.dueDate, args.dueDate));
  }
  if (args.project !== undefined) {
    const project = await resolveProjectRef(args.project, tool);
    if (!project.ok) return project.result;

    patch.projectId = project.value ?? null;
    sent.push(
      args.project === null
        ? '- project: detached'
        : `- project: moved to "${args.project}"`,
    );
  }
  if (args.cycle !== undefined) {
    const cycle = await resolveCycleRef(args.cycle, tool);
    if (!cycle.ok) return cycle.result;

    patch.cycleId = cycle.value ?? null;
    sent.push(
      args.cycle === null
        ? '- cycle: detached'
        : `- cycle: moved into "${args.cycle}"`,
    );
  }

  // `issue` alone is a legal envelope and a useless request; saying so is more
  // use to a model than a silent no-op it cannot see.
  if (sent.length === 0) {
    return toolFailure(
      'Nothing was sent to change. Pass at least one of title, description, priority, dueDate, project or cycle — omit a field to leave it as it is, or send null to unset it.',
      'NOTHING_TO_CHANGE',
    );
  }

  const after = await issuesService.update(
    context,
    credential.userId,
    before.id,
    patch,
  );

  return listResult({
    heading: `Updated ${after.identifier}`,
    note: 'saved',
    lines: [...sent, '', issueLine(after)],
    structured: { issue: issueProjection(after) },
  });
}

export const updateIssueTool: McpToolEntry = {
  scope: 'ISSUES_WRITE',
  argumentsSchema: updateIssueArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.updateIssue,
    title: 'Update an issue',
    description: [
      'Change an issue’s content or planning: title, description, priority, due date, project or cycle.',
      'Pass only what should change. A field you leave out keeps its current value; send null to clear it (null project or cycle detaches the issue).',
      'Use shipyard_set_issue_status to move it between states, shipyard_assign_issue to change who owns it, and shipyard_block_issue for the blocked flag — this tool does not touch those.',
      'The issue is named the way people write it (SHIP-42) or by its internal id; do not guess an identifier, read the issue first.',
      'It returns the fields you changed and the issue as it now stands.',
    ].join(' '),
    inputSchema: toolInputSchema(updateIssueArgumentsSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
