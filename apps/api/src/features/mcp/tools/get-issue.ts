import {
  MCP_TOOL_NAMES,
  getIssueArgumentsSchema,
  truncationNote,
  type McpListSummary,
} from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { issuesService } from '../../issues/service.js';
import {
  line,
  listResult,
  toolFailure,
  toolInputSchema,
  type McpToolContext,
} from './context.js';

/**
 * `shipyard_get_issue` — one issue in full, by the identifier people say out
 * loud.
 *
 * The retrieval counterpart to `shipyard_search`: search finds the fragment, this
 * returns the whole record — description, relations, and the history trail when
 * it is asked for.
 *
 * The identifier may be `SHIP-42` or an internal id, and neither is required to
 * be the *active* state of the issue: reading one thing you already have an
 * identifier for is not a browse, so an archived issue is returned rather than
 * hidden. It says it is archived, which is the part that matters.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = getIssueArgumentsSchema.parse(raw);
  const { context, credential } = tool;

  const card = await issuesService.resolveRef(
    context,
    credential.userId,
    args.issue,
  );

  if (card === null) {
    return toolFailure(
      `No issue in this workspace matches "${args.issue}". Issue identifiers look like SHIP-42 — use shipyard_list_issues or shipyard_search to find one.`,
      'ISSUE_NOT_FOUND',
    );
  }

  const detail = await issuesService.getDetail(
    context,
    card.id,
    credential.userId,
  );
  const description =
    'description' in detail && typeof detail.description === 'string'
      ? detail.description
      : null;

  const history = args.includeHistory
    ? await issuesService.listHistory(context, card.id, { limit: 10 })
    : null;

  const labels = card.labels.map((label) => label.name).join(', ');
  const summary: McpListSummary = {
    returned: history?.history.length ?? 0,
    total: history?.history.length ?? 0,
    truncated: history?.nextCursor != null,
  };

  const lines = [
    line('Issue', `${card.identifier} — ${card.title}`),
    line('Status', card.status.toLowerCase()),
    line('Priority', card.priority.toLowerCase()),
    line(
      'Assignee',
      card.assignee === null ? 'unassigned' : card.assignee.name,
    ),
    card.cycleId === null ? null : line('Cycle', card.cycleId),
    card.labels.length === 0 ? null : line('Labels', labels),
    card.dueDate === null ? null : line('Due', card.dueDate),
    card.blocked
      ? line('Blocked', card.blockedReason ?? 'no reason recorded')
      : null,
  ].filter((entry): entry is string => entry !== null);

  const historyLines =
    history === null
      ? []
      : history.history.map(
          (entry) =>
            `- ${entry.createdAt} ${entry.actor === null ? 'someone' : entry.actor.name} ${entry.event.toLowerCase()}${
              entry.newValue === null ? '' : ` → ${entry.newValue}`
            }`,
        );

  const note =
    history === null
      ? `read in full · ${card.status.toLowerCase()}`
      : history.history.length === 0
        ? 'no history yet'
        : truncationNote(summary);

  const body = [...lines];
  if (description !== null) body.push('', description);
  if (historyLines.length > 0) body.push('', 'History:', ...historyLines);

  return listResult({
    heading: `${card.identifier} ${card.title}`,
    note,
    lines: body,
    structured: {
      issue: detail,
      ...(history === null
        ? {}
        : { history: history.history, historyCursor: history.nextCursor }),
    },
  });
}

export const getIssueTool: McpToolEntry = {
  scope: 'READ',
  argumentsSchema: getIssueArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.getIssue,
    title: 'Get an issue',
    description: [
      'Read one issue in full: description, status, priority, assignee, labels, due date, blocked state, and its history when includeHistory is true.',
      'Pass the identifier as people write it — SHIP-42 — or its internal id.',
      'Use it after shipyard_search or shipyard_list_issues has given you an identifier; do not guess one.',
      'It works for an archived issue too, and says so in the result.',
    ].join(' '),
    inputSchema: toolInputSchema(getIssueArgumentsSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
