import {
  MCP_TOOL_NAMES,
  listIssuesArgumentsSchema,
  truncationNote,
  type McpListSummary,
} from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { issuesService } from '../../issues/service.js';
import { listIssuesQuerySchema } from '../../issues/schemas.js';
import { projectsService } from '../../projects/service.js';
import { cyclesService } from '../../cycles/service.js';
import {
  listResult,
  resolveAssigneeId,
  toIdByNameOrId,
  toolFailure,
  toolInputSchema,
  type McpToolContext,
} from './context.js';

/**
 * `shipyard_list_issues` — browse and filter the work on the board.
 *
 * The workhorse of the read surface, and the tool most likely to be chosen when
 * it should not be: the description says what it is *not* for (use get_issue
 * when the identifier is known, search when it is not), because that is what
 * teaches a model to stop reaching for a list when it wants one thing.
 *
 * Three translations happen here, and only here:
 * - the caller's words become the service's filters (assignee, project, cycle
 *   and labels by name; `me` meaning the credential's owner);
 * - `includeArchived` means "as well as", while the list query answers one
 *   state per call — so it is two calls, merged, and the count is the sum;
 * - `limit` is applied here, because the list query is deliberately unpaginated
 *   on the HTTP side and the tool surface is the thing that has to keep a
 *   bounded answer. If the request fails, nothing was fetched — the checks all
 *   happen before the first service call.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = listIssuesArgumentsSchema.parse(raw);
  const { context, credential } = tool;

  const [projects, cyclePage, labelPage] = await Promise.all([
    projectsService.list(context, {}),
    cyclesService.list(context, {}),
    issuesService.listLabels(context),
  ]);

  const assigneeId = await resolveAssigneeId(args.assignee, tool);
  if (typeof assigneeId === 'object') return assigneeId;

  const projectId = toIdByNameOrId(args.project, projects);
  if (args.project !== undefined && projectId === undefined) {
    return toolFailure(
      `No project in this workspace matches "${args.project}". Known projects: ${projects.map((project) => project.name).join(', ') || 'none yet'}.`,
      'PROJECT_NOT_FOUND',
    );
  }

  const cycleId = toIdByNameOrId(args.cycle, cyclePage.cycles);
  if (args.cycle !== undefined && cycleId === undefined) {
    return toolFailure(
      `No cycle in this workspace matches "${args.cycle}". Known cycles: ${cyclePage.cycles.map((cycle) => cycle.name).join(', ') || 'none yet'}.`,
      'CYCLE_NOT_FOUND',
    );
  }

  // Labels are matched by name and sent as ids; the API has always expected
  // ids, and an unknown name is a domain failure, not an empty result.
  const wanted: string[] = args.labels ?? [];
  const labels = labelPage.labels.filter((label) =>
    wanted.some(
      (name) => name.trim().toLowerCase() === label.name.toLowerCase(),
    ),
  );
  if (labels.length !== wanted.length) {
    const missing = wanted.filter(
      (name) =>
        !labelPage.labels.some(
          (label) => label.name.toLowerCase() === name.trim().toLowerCase(),
        ),
    );
    return toolFailure(
      `No label named ${missing.join(', ')} in this workspace. Labels here: ${labelPage.labels.map((label) => label.name).join(', ') || 'none yet'}.`,
      'LABEL_NOT_FOUND',
    );
  }

  const query = {
    status: args.status,
    priority: args.priority,
    assigneeId,
    projectId,
    cycleId,
    labels: labels.length > 0 ? labels.map((label) => label.id) : undefined,
    blocked: args.blocked === undefined ? undefined : String(args.blocked),
    dueDateFrom: args.dueAfter,
    dueDateTo: args.dueBefore,
    sort: args.sort,
    order: args.order,
  } as const;

  // One shape for both states — the same route schema the HTTP list validates
  // with, so the tool cannot drift from the endpoint it stands on.
  const active = await issuesService.list(
    context,
    credential.userId,
    listIssuesQuerySchema.parse({ ...query, archived: 'false' }),
  );
  const archived = args.includeArchived
    ? await issuesService.list(
        context,
        credential.userId,
        listIssuesQuerySchema.parse({ ...query, archived: 'true' }),
      )
    : { issues: [] };

  const all = [...active.issues, ...archived.issues];
  const shown = all.slice(0, args.limit);
  const summary: McpListSummary = {
    returned: shown.length,
    total: all.length,
    truncated: all.length > shown.length,
  };

  const projectNames = new Map(
    projects.map((project) => [project.id, project.name]),
  );
  const cycleNames = new Map(
    cyclePage.cycles.map((cycle) => [cycle.id, cycle.name]),
  );

  return listResult({
    heading: `Issues in ${context.slug}`,
    note: truncationNote(summary),
    lines: shown.map((issue) => {
      const bits: string[] = [
        `${issue.identifier} ${issue.title}`,
        issue.status.toLowerCase(),
      ];
      if (issue.priority !== 'NO_PRIORITY')
        bits.push(issue.priority.toLowerCase());
      bits.push(
        issue.assignee === null ? 'unassigned' : `@${issue.assignee.name}`,
      );
      if (issue.projectId !== null) {
        bits.push(projectNames.get(issue.projectId) ?? 'unknown project');
      }
      if (issue.cycleId !== null) {
        bits.push(cycleNames.get(issue.cycleId) ?? 'unknown cycle');
      }
      if (issue.labels.length > 0) {
        bits.push(issue.labels.map((label) => label.name).join('/'));
      }
      if (issue.blocked) {
        bits.push(`blocked: ${issue.blockedReason ?? 'no reason given'}`);
      }
      if (issue.dueDate !== null) bits.push(`due ${issue.dueDate}`);

      return `- ${bits.join(' · ')}`;
    }),
    structured: { issues: shown, summary },
  });
}

export const listIssuesTool: McpToolEntry = {
  scope: 'READ',
  argumentsSchema: listIssuesArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.listIssues,
    title: 'List issues',
    description: [
      'Browse and filter the issues in this workspace.',
      'Use it for "what is in progress", "what is blocked", "what is unassigned", "what is due this week".',
      'If you already have an identifier like SHIP-42, use shipyard_get_issue instead — it returns the whole issue.',
      'If you are looking for something by words and have no identifier, use shipyard_search instead.',
      'Archived issues are excluded unless includeArchived is true.',
    ].join(' '),
    inputSchema: toolInputSchema(listIssuesArgumentsSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
