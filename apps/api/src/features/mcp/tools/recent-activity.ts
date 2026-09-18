import {
  MCP_TOOL_NAMES,
  recentActivityArgumentsSchema,
  truncationNote,
  type McpListSummary,
} from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { activityService } from '../../activity/service.js';
import { listActivityQuerySchema } from '../../activity/schemas.js';
import {
  listResult,
  resolveAssigneeId,
  toolInputSchema,
  type McpToolContext,
} from './context.js';

/**
 * `shipyard_recent_activity` — what has been happening, newest first.
 *
 * The only read tool that walks a cursor: the activity feed is the one
 * unbounded stream in the product, so it is the one place a caller may be told
 * "there is more, here is how to get it". Every other list reports a count and
 * asks the caller to narrow.
 *
 * `area` and `actor` are the two questions people actually ask ("what happened
 * on issues", "what did Sam do"), so they are filters here rather than
 * something the caller is expected to filter itself.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = recentActivityArgumentsSchema.parse(raw);
  const { context, credential } = tool;

  const actorId =
    args.actor === undefined
      ? undefined
      : args.actor.trim().toLowerCase() === 'me'
        ? credential.userId
        : await resolveAssigneeId(args.actor, tool);

  if (typeof actorId === 'object') return actorId;

  const page = await activityService.list(
    context.workspaceId,
    listActivityQuerySchema.parse({
      area: args.area,
      actorId,
      limit: args.limit,
      cursor: args.cursor,
    }),
  );

  const summary: McpListSummary = {
    returned: page.events.length,
    truncated: page.nextCursor !== null,
    ...(page.nextCursor === null ? {} : { cursor: page.nextCursor }),
  };

  return listResult({
    heading: `Activity in ${context.slug}`,
    note: truncationNote(summary),
    lines: page.events.map(
      (event) =>
        `- ${event.createdAt}${event.actorName === '' ? '' : ` ${event.actorName}`} · ${event.area.toLowerCase()} · ${event.summary}`,
    ),
    summary,
    structured: {
      events: page.events,
      summary,
    },
  });
}

export const recentActivityTool: McpToolEntry = {
  scope: 'READ',
  argumentsSchema: recentActivityArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.recentActivity,
    title: 'Recent activity',
    description: [
      'Read the activity feed of this workspace, newest first: issue changes, comments, project and cycle updates, membership changes.',
      'Use it for "what happened this week", "what did Sam do", "what changed on this project lately".',
      'Filter by area (ISSUE, PROJECT, CYCLE, MEMBER, COMMENT) or by actor.',
      'If the result carries a cursor, pass it back to read the next page — this is the only tool with paging.',
    ].join(' '),
    inputSchema: toolInputSchema(recentActivityArgumentsSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
