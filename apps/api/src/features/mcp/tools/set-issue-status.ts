import {
  MCP_TOOL_NAMES,
  setIssueStatusArgumentsSchema,
} from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { issuesService } from '../../issues/service.js';
import {
  changeLine,
  issueLine,
  issueProjection,
  listResult,
  resolveIssueRef,
  toolInputSchema,
  type McpToolContext,
} from './context.js';

/**
 * `shipyard_set_issue_status` — move an issue between states.
 *
 * Its own tool rather than a field on the update tool, because "what is in
 * progress" is the question agents are asked most and the transition rule is
 * the thing they get wrong: the four states are freely reachable in any
 * direction, and moving to DONE clears the blocked flag implicitly (a finished
 * issue is not blocked) — which the result says out loud rather than leaving
 * the model to infer it from a state diff.
 *
 * Setting the state it is already in is a no-op in the service (no write, no
 * history row), and it is reported as exactly that rather than as a success.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = setIssueStatusArgumentsSchema.parse(raw);
  const { context, credential } = tool;

  const found = await resolveIssueRef(args.issue, tool);
  if (!found.ok) return found.result;

  const before = found.value;

  if (before.status === args.status) {
    return listResult({
      heading: `${before.identifier} is already ${args.status.toLowerCase()}`,
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
      status: args.status,
    },
  );

  const clearedBlocked = before.blocked && !after.blocked;

  return listResult({
    heading: `Moved ${after.identifier} to ${after.status.toLowerCase()}`,
    note: 'saved',
    lines: [
      changeLine(
        'status',
        before.status.toLowerCase(),
        after.status.toLowerCase(),
      ),
      ...(clearedBlocked
        ? ['- blocked: cleared — a finished issue is not blocked']
        : []),
      '',
      issueLine(after),
    ],
    structured: { issue: issueProjection(after) },
  });
}

export const setIssueStatusTool: McpToolEntry = {
  scope: 'ISSUES_WRITE',
  argumentsSchema: setIssueStatusArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.setIssueStatus,
    title: 'Set an issue’s status',
    description: [
      'Move an issue to BACKLOG, TODO, IN_PROGRESS or DONE.',
      'Any state can follow any other; there is no required order, and DONE means finished rather than archived.',
      'Use it whenever the question is about progress ("start this", "mark it done", "it is in review"); use shipyard_update_issue for content and planning fields instead.',
      'Moving an issue to DONE also clears its blocked flag, and the result says so.',
      'Setting the state it is already in changes nothing and says so; it is never an error.',
    ].join(' '),
    inputSchema: toolInputSchema(setIssueStatusArgumentsSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
