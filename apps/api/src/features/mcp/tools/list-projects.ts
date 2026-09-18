import {
  MCP_TOOL_NAMES,
  listProjectsArgumentsSchema,
  truncationNote,
  type McpListSummary,
} from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { projectsService } from '../../projects/service.js';
import { listProjectsQuerySchema } from '../../projects/schemas.js';
import { listResult, toolInputSchema, type McpToolContext } from './context.js';

/**
 * `shipyard_list_projects` — the containers the work sits in.
 *
 * Answers "what are we working on at the moment" without dragging in every
 * issue: name, status, owner, dates and progress. An agent asked about
 * "the website redesign" can find the project here and then filter issues by it,
 * which is the path the descriptions encourage.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = listProjectsArgumentsSchema.parse(raw);
  const { context } = tool;

  const active = await projectsService.list(
    context,
    listProjectsQuerySchema.parse({
      status: args.status,
      archived: 'false',
    }),
  );
  const archived = args.includeArchived
    ? await projectsService.list(
        context,
        listProjectsQuerySchema.parse({
          status: args.status,
          archived: 'true',
        }),
      )
    : [];

  const all = [...active, ...archived];
  const shown = all.slice(0, args.limit);
  const summary: McpListSummary = {
    returned: shown.length,
    total: all.length,
    truncated: all.length > shown.length,
  };

  return listResult({
    heading: `Projects in ${context.slug}`,
    note: truncationNote(summary),
    lines: shown.map((project) => {
      const bits: string[] = [
        project.name,
        project.status.toLowerCase(),
        `owner @${project.owner.name}`,
      ];
      if (project.targetDate !== null)
        bits.push(`target ${project.targetDate}`);
      bits.push(
        `${project.progress.completed}/${project.progress.total} done${
          project.progress.percent === null
            ? ''
            : ` (${project.progress.percent}%)`
        }`,
        `${project.workers.length} ${project.workers.length === 1 ? 'worker' : 'workers'}`,
      );
      if (project.archivedAt !== null) bits.push('archived');

      return `- ${bits.join(' · ')}`;
    }),
    structured: { projects: shown, summary },
  });
}

export const listProjectsTool: McpToolEntry = {
  scope: 'READ',
  argumentsSchema: listProjectsArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.listProjects,
    title: 'List projects',
    description: [
      'List the projects in this workspace with their status, owner, dates and progress.',
      'Use it to find the project a question is about, then pass its name to shipyard_list_issues.',
      'Archived projects are excluded unless includeArchived is true.',
      'For the issues inside a project, use shipyard_list_issues with the project filter.',
    ].join(' '),
    inputSchema: toolInputSchema(listProjectsArgumentsSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
