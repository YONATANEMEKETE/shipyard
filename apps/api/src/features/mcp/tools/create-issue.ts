import { MCP_TOOL_NAMES, createIssueArgumentsSchema } from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { issuesService } from '../../issues/service.js';
import {
  issueLine,
  issueProjection,
  listResult,
  resolveAssigneeUserId,
  resolveLabelIds,
  resolveProjectRef,
  toolInputSchema,
  type McpToolContext,
} from './context.js';

/**
 * `shipyard_create_issue` — file new work.
 *
 * The one additive write with no identifier to resolve: it is what an agent
 * reaches for when a person says "track this". Everything it can name —
 * assignee, project, labels — is resolved **before** the first write, because a
 * create that failed halfway would leave an issue wearing three of its four
 * labels; the resolution failures are tool results, so nothing is created.
 *
 * The service stays the authority on the rest: the sequence number, the
 * `CREATED` history row, the activity row, and the assignment notification that
 * fires when the assignee is somebody other than the token's owner.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = createIssueArgumentsSchema.parse(raw);
  const { context, credential } = tool;

  const assignee = await resolveAssigneeUserId(args.assignee ?? null, tool);
  if (!assignee.ok) return assignee.result;

  const project = await resolveProjectRef(args.project, tool);
  if (!project.ok) return project.result;

  const labels = await resolveLabelIds(args.labels, tool);
  if (!labels.ok) return labels.result;

  const created = await issuesService.create(context, credential.userId, {
    title: args.title,
    ...(args.description === undefined
      ? {}
      : { description: args.description }),
    ...(args.priority === undefined ? {} : { priority: args.priority }),
    ...(args.status === undefined ? {} : { status: args.status }),
    assigneeId: assignee.value,
    projectId: project.value ?? null,
    ...(labels.value.length === 0 ? {} : { labelIds: labels.value }),
    ...(args.dueDate === undefined ? {} : { dueDate: args.dueDate }),
  });

  return listResult({
    heading: `Created ${created.identifier}`,
    note: 'saved',
    lines: [issueLine(created)],
    structured: { issue: issueProjection(created) },
  });
}

export const createIssueTool: McpToolEntry = {
  scope: 'ISSUES_WRITE',
  argumentsSchema: createIssueArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.createIssue,
    title: 'Create an issue',
    description: [
      'File a new issue in this workspace and return it with the identifier it was given.',
      'Use it for new work that should be tracked; to change work that already exists, use shipyard_update_issue, shipyard_set_issue_status, shipyard_assign_issue or shipyard_block_issue.',
      'Only the title is required. Status defaults to BACKLOG and priority to NO_PRIORITY, so pass them only if the person asked for a particular one.',
      'The assignee, project and labels are given by name and must already exist in this workspace; the reporter is the person this connection belongs to.',
      'It cannot create cycles or projects, and it cannot put the new issue in a cycle — create it first, then use shipyard_update_issue.',
    ].join(' '),
    inputSchema: toolInputSchema(createIssueArgumentsSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  handler,
};
