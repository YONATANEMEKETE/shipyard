import { MCP_TOOL_NAMES, deleteIssueArgumentsSchema } from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { issuesService } from '../../issues/service.js';
import {
  listResult,
  resolveIssueRef,
  toolInputSchema,
  type McpToolContext,
} from './context.js';

/**
 * `shipyard_delete_issue` — remove an issue for good.
 *
 * The only irreversible call on this surface, so it is gated four times: the
 * tool is advertised only to a credential carrying `ISSUES_DELETE` (§5.4), the
 * scope is re-checked at dispatch, the owning service re-asserts a **live**
 * Owner/Admin role on every call, and the call is annotated `destructiveHint:
 * true` so the host can put it in front of the person.
 *
 * **It does not ask the caller to type a confirmation.** spec §3.4 is explicit
 * that a model-typed confirmation is never accepted as consent — confirmation is
 * the person's, delivered through the client that is actually talking to them.
 * So consent is the host's approval of a destructive-annotated call, the
 * identifier the product's own delete contract demands is supplied by *this
 * tool* from the reference it resolved (nobody repeats anything), and the
 * server-side gates that remain are the scope and the live role. The deferred
 * in-protocol half of that story is elicitation/MRTR (§12) — when it lands, this
 * tool is where it lands.
 *
 * The blast radius is the product's, unchanged: comments and history cascade,
 * mention and assignment notifications go with them, and the activity row is
 * written *after* the row is gone so the record of the deletion survives it.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = deleteIssueArgumentsSchema.parse(raw);
  const { context, credential } = tool;

  const found = await resolveIssueRef(args.issue, tool);
  if (!found.ok) return found.result;

  const before = found.value;
  const removed = await issuesService.remove(
    context,
    credential.userId,
    before.id,
    before.identifier,
  );

  return listResult({
    heading: `Deleted ${removed.identifier}`,
    note: 'permanent — this cannot be undone',
    lines: [
      `${removed.identifier} ${before.title}`,
      '- its comments, labels and history went with it',
      '- if it might be needed again, that was an archive: shipyard_archive_issue is reversible',
    ],
    structured: { deleted: { identifier: removed.identifier } },
  });
}

export const deleteIssueTool: McpToolEntry = {
  scope: 'ISSUES_DELETE',
  argumentsSchema: deleteIssueArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.deleteIssue,
    title: 'Delete an issue permanently',
    description: [
      'Delete an issue for good — it, its comments and its history are removed, and there is no way back from this surface.',
      'Only use it when the person has explicitly asked for this issue to be permanently deleted. Archiving is usually what was meant: it takes the issue off the board and keeps it, and shipyard_restore_issue brings it back.',
      'Say what will be lost before you call it, and name the identifier: this is the one action here that a person cannot undo.',
      'It needs a connection with the delete permission, held by an Owner or Admin, and the person must approve the call in their client — do not call it speculatively or as part of cleaning up without being asked.',
      'Deleting a comment, a project, a cycle or a label is not offered at all.',
    ].join(' '),
    inputSchema: toolInputSchema(deleteIssueArgumentsSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    },
  },
  handler,
};
