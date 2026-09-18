import {
  MCP_TOOL_NAMES,
  listCyclesArgumentsSchema,
  truncationNote,
  type McpListSummary,
} from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { cyclesService } from '../../cycles/service.js';
import { listCyclesQuerySchema } from '../../cycles/schemas.js';
import { listResult, toolInputSchema, type McpToolContext } from './context.js';

/**
 * `shipyard_list_cycles` — the time-boxed slices work is committed to.
 *
 * Carries the one piece of state an agent cannot derive from issues: which
 * cycle is *current*. "Are we going to make this cycle?" is a question about a
 * window, and the answer needs the window's end date and its completion count
 * together.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = listCyclesArgumentsSchema.parse(raw);
  const { context } = tool;

  const active = await cyclesService.list(
    context,
    listCyclesQuerySchema.parse({ status: args.status, archived: 'false' }),
  );
  const archived = args.includeArchived
    ? await cyclesService.list(
        context,
        listCyclesQuerySchema.parse({ status: args.status, archived: 'true' }),
      )
    : { cycles: [] };

  const all = [...active.cycles, ...archived.cycles];
  const shown = all.slice(0, args.limit);
  const summary: McpListSummary = {
    returned: shown.length,
    total: all.length,
    truncated: all.length > shown.length,
  };

  return listResult({
    heading: `Cycles in ${context.slug}`,
    note: truncationNote(summary),
    lines: shown.map((cycle) => {
      const bits: string[] = [
        cycle.name,
        cycle.status.toLowerCase(),
        `${cycle.startDate} → ${cycle.endDate}`,
        `${cycle.progress.completed}/${cycle.progress.total} done${
          cycle.progress.percent === null ? '' : ` (${cycle.progress.percent}%)`
        }`,
      ];
      if (cycle.archivedAt !== null) bits.push('archived');

      return `- ${bits.join(' · ')}`;
    }),
    structured: { cycles: shown, summary },
  });
}

export const listCyclesTool: McpToolEntry = {
  scope: 'READ',
  argumentsSchema: listCyclesArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.listCycles,
    title: 'List cycles',
    description: [
      'List the cycles (sprints) in this workspace with their dates, status and completion.',
      'A cycle that is in progress is the current one: use it to judge whether work is likely to land in time.',
      'Use the cycle name with shipyard_list_issues to see what is inside it.',
      'Archived cycles are excluded unless includeArchived is true.',
    ].join(' '),
    inputSchema: toolInputSchema(listCyclesArgumentsSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
