import { MCP_TOOL_NAMES, blockIssueArgumentsSchema } from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { issuesService } from '../../issues/service.js';
import {
  changeLine,
  issueLine,
  issueProjection,
  listResult,
  resolveIssueRef,
  toolFailure,
  toolInputSchema,
  type McpToolContext,
} from './context.js';

/**
 * `shipyard_block_issue` — set or clear the orthogonal blocked flag.
 *
 * Blocked is not a status (an issue can be blocked while in progress), which is
 * why it is its own tool: the flag and its reason are one concern, and the
 * reason is the part a person reads. `blocked: false` clears the reason too —
 * the service's rule — and a reason sent alongside it is refused here rather
 * than silently discarded, because a model that asked for "unblock it, because
 * we shipped the dependency" meant one of the two.
 *
 * Blocking an issue that is DONE is refused by the service, with a message
 * written for a reader; that failure travels out through the error mapper as a
 * tool result, not as a protocol error.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = blockIssueArgumentsSchema.parse(raw);
  const { context, credential } = tool;

  if (args.blocked === false && args.reason !== undefined) {
    return toolFailure(
      'A blocked reason only applies while blocked is true. Send blocked: false on its own to unblock and clear the reason, or blocked: true with the reason.',
      'REASON_WITHOUT_BLOCKED',
    );
  }

  const found = await resolveIssueRef(args.issue, tool);
  if (!found.ok) return found.result;

  const before = found.value;

  const after = await issuesService.update(
    context,
    credential.userId,
    before.id,
    {
      blocked: args.blocked,
      ...(args.reason === undefined ? {} : { blockedReason: args.reason }),
    },
  );

  const unchanged =
    after.blocked === before.blocked &&
    after.blockedReason === before.blockedReason;

  if (unchanged) {
    return listResult({
      heading: `${after.identifier} is already ${
        after.blocked ? 'blocked' : 'not blocked'
      }`,
      note: 'nothing changed',
      lines: [issueLine(after)],
      structured: { issue: issueProjection(after) },
    });
  }

  return listResult({
    heading: after.blocked
      ? `Blocked ${after.identifier}`
      : `Unblocked ${after.identifier}`,
    note: 'saved',
    lines: [
      changeLine(
        'blocked',
        before.blocked ? 'yes' : 'no',
        after.blocked ? 'yes' : 'no',
      ),
      ...(after.blocked
        ? [`- reason: ${after.blockedReason ?? 'none given'}`]
        : []),
      '',
      issueLine(after),
    ],
    structured: { issue: issueProjection(after) },
  });
}

export const blockIssueTool: McpToolEntry = {
  scope: 'ISSUES_WRITE',
  argumentsSchema: blockIssueArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.blockIssue,
    title: 'Block or unblock an issue',
    description: [
      'Mark an issue as blocked, or clear that state.',
      'Blocked is separate from status: an issue can be blocked while it is in progress, and it stays in its state.',
      'Send blocked: true with the reason so a person reading the board knows what is waiting; send blocked: false to unblock, which also clears the reason.',
      'An issue that is DONE cannot be blocked — reopen it with shipyard_set_issue_status first if that is what was meant.',
      'It changes nothing if the issue is already in the state you asked for, and says so.',
    ].join(' '),
    inputSchema: toolInputSchema(blockIssueArgumentsSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
