import { MCP_TOOL_NAMES, listMembersArgumentsSchema } from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { membersService } from '../../members/service.js';
import { listResult, toolInputSchema, type McpToolContext } from './context.js';

/**
 * `shipyard_list_members` — who is in this workspace, and what they may do.
 *
 * The tool that makes every other tool's people-filters usable: an agent asked
 * "what is Omar working on" has to learn that `Omar` is a person here before it
 * can filter anything.
 *
 * Names and roles only. The member card carries an email address, and the agent
 * surface never repeats one back (spec §7 Q2) — an address may be *matched* as
 * input, because that is how people refer to each other, but never returned.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = listMembersArgumentsSchema.parse(raw);

  const members = await membersService.listMembers(tool.context.workspaceId);
  const shown = members.slice(0, args.limit);

  return listResult({
    heading: `Members of ${tool.context.slug}`,
    note:
      shown.length === members.length
        ? `all ${members.length}`
        : `${shown.length} of ${members.length} shown`,
    lines: shown.map(
      (member) => `- ${member.name} · ${member.role.toLowerCase()}`,
    ),
    structured: {
      members: shown.map((member) => ({
        userId: member.userId,
        name: member.name,
        role: member.role,
      })),
      summary: {
        returned: shown.length,
        total: members.length,
        truncated: shown.length < members.length,
      },
    },
  });
}

export const listMembersTool: McpToolEntry = {
  scope: 'READ',
  argumentsSchema: listMembersArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.listMembers,
    title: 'List members',
    description: [
      'List the people in this workspace with their role (owner, admin, member).',
      'Use it before filtering by a person: the assignee filter takes a name, and this is how you learn the names.',
      'Roles tell you what a person may do — only owners and admins can delete issues.',
    ].join(' '),
    inputSchema: toolInputSchema(listMembersArgumentsSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler,
};
