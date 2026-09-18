import {
  MCP_TOOL_NAMES,
  searchArgumentsSchema,
  type McpListSummary,
} from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { searchService } from '../../search/service.js';
import { listResult, toolInputSchema, type McpToolContext } from './context.js';

/**
 * `shipyard_search` — find things by words across every kind of record.
 *
 * Search is the *discovery* tool and get_issue is the *retrieval* tool, and the
 * difference is worth stating in the description: search results are fragments
 * (a title, a status, a snippet), enough to decide what to look at, not enough
 * to answer a question about it.
 *
 * The result is grouped by kind and honest about its own size — "12 issues, 3
 * projects" with the caps applied where the search service applies them, so a
 * reader can tell the difference between "nothing matched" and "the first few
 * matches are these".
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = searchArgumentsSchema.parse(raw);

  const results = await searchService.search(tool.context, {
    q: args.query,
    type: args.type,
    limit: args.limit,
  });

  const groups: { label: string; lines: string[] }[] = [
    {
      label: 'Issues',
      lines: results.issues.map(
        (issue) =>
          `- ${issue.identifier} ${issue.title} · ${issue.status.toLowerCase()}${
            issue.assignee === null ? '' : ` · @${issue.assignee.name}`
          }`,
      ),
    },
    {
      label: 'Projects',
      lines: results.projects.map(
        (project) =>
          `- ${project.name} · ${project.status.toLowerCase()} · ${project.progress.completed}/${project.progress.total} done`,
      ),
    },
    {
      label: 'Cycles',
      lines: results.cycles.map(
        (cycle) =>
          `- ${cycle.name} · ${cycle.status.toLowerCase()} · ${cycle.startDate} → ${cycle.endDate}`,
      ),
    },
    {
      label: 'Members',
      // Names only — the search service returns cards, and the agent surface
      // never repeats an email address back (spec §7 Q2).
      lines: results.members.map(
        (member) => `- ${member.name} · ${member.role.toLowerCase()}`,
      ),
    },
    {
      label: 'Comments',
      lines: results.comments.map(
        (comment) =>
          `- on ${comment.issueTitle} by ${comment.author.name}: ${comment.content.slice(0, 140)}`,
      ),
    },
  ];

  const hit = groups.filter((group) => group.lines.length > 0);
  const total = hit.reduce((sum, group) => sum + group.lines.length, 0);
  const summary: McpListSummary = {
    returned: total,
    total,
    truncated: false,
  };

  return listResult({
    heading: `"${results.q}" in ${tool.context.slug}`,
    note:
      total === 0
        ? 'Nothing matched. Try fewer or different words.'
        : hit
            .map(
              (group) => `${group.lines.length} ${group.label.toLowerCase()}`,
            )
            .join(', '),
    lines: hit.flatMap((group) => [`${group.label}:`, ...group.lines]),
    structured: { q: results.q, summary, ...groupCounts(results) },
  });
}

function groupCounts(results: {
  issues: unknown[];
  projects: unknown[];
  cycles: unknown[];
  members: unknown[];
  comments: unknown[];
}) {
  return {
    counts: {
      issues: results.issues.length,
      projects: results.projects.length,
      cycles: results.cycles.length,
      members: results.members.length,
      comments: results.comments.length,
    },
  };
}

export const searchTool: McpToolEntry = {
  scope: 'READ',
  argumentsSchema: searchArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.search,
    title: 'Search',
    description: [
      'Search issues, projects, cycles, members and comments by words.',
      'Use it when you do not have an identifier: "anything about login", "mentions of onboarding", "who worked on billing".',
      'Results are short fragments, so follow up with shipyard_get_issue once you have an identifier.',
      'To browse by filters rather than words, use shipyard_list_issues.',
    ].join(' '),
    inputSchema: toolInputSchema(searchArgumentsSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
