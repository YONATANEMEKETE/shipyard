import {
  MCP_TOOL_NAMES,
  workspaceOverviewArgumentsSchema,
} from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { dashboardService } from '../../dashboard/service.js';
import { listResult, toolInputSchema, type McpToolContext } from './context.js';

/**
 * `shipyard_workspace_overview` — the orientation call.
 *
 * The one tool an agent should reach for first in an unfamiliar workspace, and
 * the reason the other seven can stay narrow: "what is going on here" is one
 * question, and answering it with a list of assigned issues plus three other
 * round trips is how an agent burns a context window finding out it is in an
 * empty workspace.
 *
 * Reads through the same service the product's home page reads, so the answer a
 * person sees and the answer the agent gives cannot disagree.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  workspaceOverviewArgumentsSchema.parse(raw);
  const { context, credential } = tool;

  const dashboard = await dashboardService.compose(
    context.workspaceId,
    credential.userId,
  );

  const myWork = [
    ...[...dashboard.myWork.assigned].map(
      (issue) =>
        `- mine: ${issue.identifier} ${issue.title} · ${issue.status.toLowerCase()}`,
    ),
    ...[...dashboard.myWork.created].map(
      (issue) =>
        `- opened by me: ${issue.identifier} ${issue.title} · ${issue.status.toLowerCase()}`,
    ),
  ];

  const cycle =
    dashboard.currentCycle === null
      ? ['No cycle is in progress.']
      : [
          `Cycle ${dashboard.currentCycle.name}: ${dashboard.currentCycle.startDate} → ${dashboard.currentCycle.endDate}, ${dashboard.currentCycle.progress.completed}/${dashboard.currentCycle.progress.total} done${
            dashboard.currentCycle.progress.percent === null
              ? ''
              : ` (${dashboard.currentCycle.progress.percent}%)`
          }`,
        ];

  const projects =
    dashboard.activeProjects.length === 0
      ? ['No active projects.']
      : [
          `Active projects: ${dashboard.activeProjects
            .map(
              (project) =>
                `${project.name} (${project.progress.completed}/${project.progress.total})`,
            )
            .join(', ')}`,
        ];

  const activity =
    dashboard.recentActivity.length === 0
      ? ['Nothing has happened yet.']
      : [
          'Recent activity:',
          ...dashboard.recentActivity
            .slice(0, 5)
            .map((item) => `- ${item.text}`),
        ];

  return listResult({
    heading: `Workspace ${context.slug}`,
    note: `${dashboard.myWork.assigned.length} assigned to the credential's owner`,
    lines: [
      ...cycle,
      ...projects,
      '',
      'Your work:',
      ...(myWork.length === 0 ? ['Nothing open is assigned to you.'] : myWork),
      '',
      ...activity,
    ],
    structured: {
      workspaceId: dashboard.workspaceId,
      currentCycle: dashboard.currentCycle,
      activeProjects: dashboard.activeProjects,
      myWork: dashboard.myWork,
      recentActivity: dashboard.recentActivity,
    },
  });
}

export const workspaceOverviewTool: McpToolEntry = {
  scope: 'READ',
  argumentsSchema: workspaceOverviewArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.workspaceOverview,
    title: 'Workspace overview',
    description: [
      'A summary of this workspace: the cycle in progress and how far along it is, the active projects, the work assigned to the person this credential acts as, and what has happened recently.',
      'Use it first when you need orientation, before listing or searching anything.',
      'It takes no arguments — it always describes the workspace the credential belongs to.',
    ].join(' '),
    inputSchema: toolInputSchema(workspaceOverviewArgumentsSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
