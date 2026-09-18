import { z } from 'zod';

import { activityAreaSchema } from '../activity/index.js';
import {
  issueDateSchema,
  issueDescriptionSchema,
  issuePrioritySchema,
  issueStatusSchema,
  issueTitleSchema,
} from '../issues/index.js';
import { commentContentSchema } from '../comments/index.js';
import { cycleStatusSchema } from '../cycles/index.js';
import { projectStatusSchema } from '../projects/index.js';
import { searchTypeSchema } from '../search/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// MCP tool contracts (F13, M5) — the argument shapes of the eight read tools.
//
// Argument schemas live here, with the rest of the shared contracts, for the
// reason the whole package exists: the tool's Zod schema *is* the validation the
// handler runs, and the JSON Schema advertised in `tools/list` is generated from
// it. One definition, two consumers — a re-typed `limit` bound would have the
// model reading one contract and the server enforcing another.
//
// Field names are the tool surface's, not the HTTP API's: `assignee` (not
// `assigneeId`), `project` (not `projectId`), `dueBefore` (not `dueDateTo`), and
// `me` is a legal assignee. That translation happens once, in the tool, so the
// model never sees an id-shaped parameter it would have to obtain first.
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared pieces ──

// `SHIP-42` or a workspace-scoped id. Accepted as written, never required: the
// product's own identifier is what a person says out loud.
const issueReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .describe('An issue identifier such as SHIP-42, or its internal id.');

const personReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .describe(
    'A member name, email or user id. "me" means the person this credential belongs to.',
  );

const limitSchema = (max: number, fallback: number) =>
  z
    .number()
    .int()
    .min(1)
    .max(max)
    .default(fallback)
    .describe(`How many results to return (1–${max}, default ${fallback}).`);

const includeArchivedSchema = z
  .boolean()
  .default(false)
  .describe('Include archived work. Excluded by default.');

// ── The eight read tools (api-design §6.1) ──

export const listIssuesArgumentsSchema = z
  .object({
    status: z.array(issueStatusSchema).optional(),
    priority: z.array(issuePrioritySchema).optional(),
    assignee: personReferenceSchema.optional(),
    project: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('A project name or id.'),
    cycle: z.string().trim().min(1).optional().describe('A cycle name or id.'),
    labels: z
      .array(z.string().trim().min(1))
      .optional()
      .describe('Label names; an issue must carry all of them.'),
    blocked: z.boolean().optional(),
    dueBefore: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('An ISO date; matches issues due on or before it.'),
    dueAfter: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('An ISO date; matches issues due on or after it.'),
    includeArchived: includeArchivedSchema,
    sort: z
      .enum(['createdAt', 'updatedAt', 'priority', 'dueDate', 'seqNumber'])
      .optional()
      .describe('seqNumber means "by issue number".'),
    order: z.enum(['asc', 'desc']).optional(),
    limit: limitSchema(50, 25),
  })
  .strict();

export const getIssueArgumentsSchema = z
  .object({
    issue: issueReferenceSchema,
    includeHistory: z
      .boolean()
      .default(false)
      .describe('Also return the issue’s recent history.'),
  })
  .strict();

export const searchArgumentsSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe(
        'What to look for. Issues, projects, cycles, members, comments.',
      ),
    type: searchTypeSchema
      .optional()
      .describe('Narrow to one kind of thing. Omit to search everything.'),
    limit: limitSchema(50, 10),
  })
  .strict();

export const listProjectsArgumentsSchema = z
  .object({
    status: projectStatusSchema.optional(),
    includeArchived: includeArchivedSchema,
    limit: limitSchema(50, 25),
  })
  .strict();

export const listCyclesArgumentsSchema = z
  .object({
    status: cycleStatusSchema.optional(),
    includeArchived: includeArchivedSchema,
    limit: limitSchema(50, 25),
  })
  .strict();

// Orientation in one call takes no arguments — every question it answers is
// "whose?", and that is the credential's, not the caller's, to say.
export const workspaceOverviewArgumentsSchema = z.object({}).strict();

export const recentActivityArgumentsSchema = z
  .object({
    area: activityAreaSchema.optional(),
    actor: personReferenceSchema
      .optional()
      .describe(
        'Only what this member did; "me" means the credential’s owner.',
      ),
    limit: limitSchema(50, 20),
    cursor: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Pass the cursor from a previous result to read the next page.',
      ),
  })
  .strict();

export const listMembersArgumentsSchema = z
  .object({
    limit: limitSchema(50, 25),
  })
  .strict();

// ── The six additive write tools (api-design §6.2, M7) ──
//
// Bounds are **borrowed** from the modules that own them (`issueTitleSchema`,
// `issueDescriptionSchema`, `issueDateSchema`, `commentContentSchema`) rather
// than re-typed here: a re-stated 255 is how the model ends up reading one
// contract while the service enforces another.
//
// Optional means "leave as it is" and `null` means "unset" — the service's own
// semantics (`updateIssueSchema`), kept verbatim on this surface so the model
// learns one rule rather than two. Every write names names: projects, cycles,
// labels and people are matched by the words a person says.

export const createIssueArgumentsSchema = z
  .object({
    title: issueTitleSchema.describe('What the work is, in one line.'),
    description: issueDescriptionSchema.describe(
      'Longer detail. Omit for none.',
    ),
    priority: issuePrioritySchema
      .optional()
      .describe('Defaults to NO_PRIORITY.'),
    status: issueStatusSchema
      .optional()
      .describe('Defaults to BACKLOG. Omit unless you were asked for a state.'),
    assignee: personReferenceSchema
      .optional()
      .describe(
        'Who owns it: a member name, email or user id, or "me". Omit for unassigned.',
      ),
    project: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('A project name or id. Omit for no project.'),
    labels: z
      .array(z.string().trim().min(1))
      .max(20)
      .optional()
      .describe('Label names that already exist in this workspace.'),
    dueDate: issueDateSchema
      .optional()
      .describe('An ISO date — YYYY-MM-DD. Omit for no due date.'),
  })
  .strict();

export const updateIssueArgumentsSchema = z
  .object({
    issue: issueReferenceSchema,
    title: issueTitleSchema.optional(),
    description: issueDescriptionSchema.describe(
      'Replaces the description. Send null to clear it.',
    ),
    priority: issuePrioritySchema.optional(),
    dueDate: issueDateSchema
      .nullable()
      .optional()
      .describe('An ISO date — YYYY-MM-DD. Send null to clear it.'),
    project: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .optional()
      .describe(
        'A project name or id to move it to. Send null to detach it from its project.',
      ),
    cycle: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .optional()
      .describe(
        'A cycle name or id to put it in. Send null to take it out of its cycle.',
      ),
  })
  .strict();

export const setIssueStatusArgumentsSchema = z
  .object({
    issue: issueReferenceSchema,
    status: issueStatusSchema.describe(
      'The state to move it to: BACKLOG, TODO, IN_PROGRESS or DONE.',
    ),
  })
  .strict();

export const assignIssueArgumentsSchema = z
  .object({
    issue: issueReferenceSchema,
    assignee: personReferenceSchema
      .nullable()
      .describe(
        'A member name, email or user id, or "me" for the person this connection belongs to. Send null to unassign.',
      ),
  })
  .strict();

export const blockIssueArgumentsSchema = z
  .object({
    issue: issueReferenceSchema,
    blocked: z
      .boolean()
      .describe(
        'true marks it blocked, false clears the blocked state and its reason.',
      ),
    reason: z
      .string()
      .trim()
      .max(500, 'Keep the blocked reason under 500 characters')
      .optional()
      .describe('Why it is blocked. Only meaningful with blocked: true.'),
  })
  .strict();

export const addCommentArgumentsSchema = z
  .object({
    issue: issueReferenceSchema,
    body: commentContentSchema.describe(
      'The comment text. Mention a teammate with @Name — mentions notify them.',
    ),
  })
  .strict();

// ── Names ──

// Prefixed and unique within this server (§5.4). Exported so the registry, the
// handlers and the tests all spell them the same way.
export const MCP_TOOL_NAMES = {
  listIssues: 'shipyard_list_issues',
  getIssue: 'shipyard_get_issue',
  search: 'shipyard_search',
  listProjects: 'shipyard_list_projects',
  listCycles: 'shipyard_list_cycles',
  workspaceOverview: 'shipyard_workspace_overview',
  recentActivity: 'shipyard_recent_activity',
  listMembers: 'shipyard_list_members',
  createIssue: 'shipyard_create_issue',
  updateIssue: 'shipyard_update_issue',
  setIssueStatus: 'shipyard_set_issue_status',
  assignIssue: 'shipyard_assign_issue',
  blockIssue: 'shipyard_block_issue',
  addComment: 'shipyard_add_comment',
} as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[keyof typeof MCP_TOOL_NAMES];

/** Every tool's argument contract, keyed by advertised name. */
export const MCP_TOOL_ARGUMENTS = {
  [MCP_TOOL_NAMES.listIssues]: listIssuesArgumentsSchema,
  [MCP_TOOL_NAMES.getIssue]: getIssueArgumentsSchema,
  [MCP_TOOL_NAMES.search]: searchArgumentsSchema,
  [MCP_TOOL_NAMES.listProjects]: listProjectsArgumentsSchema,
  [MCP_TOOL_NAMES.listCycles]: listCyclesArgumentsSchema,
  [MCP_TOOL_NAMES.workspaceOverview]: workspaceOverviewArgumentsSchema,
  [MCP_TOOL_NAMES.recentActivity]: recentActivityArgumentsSchema,
  [MCP_TOOL_NAMES.listMembers]: listMembersArgumentsSchema,
  [MCP_TOOL_NAMES.createIssue]: createIssueArgumentsSchema,
  [MCP_TOOL_NAMES.updateIssue]: updateIssueArgumentsSchema,
  [MCP_TOOL_NAMES.setIssueStatus]: setIssueStatusArgumentsSchema,
  [MCP_TOOL_NAMES.assignIssue]: assignIssueArgumentsSchema,
  [MCP_TOOL_NAMES.blockIssue]: blockIssueArgumentsSchema,
  [MCP_TOOL_NAMES.addComment]: addCommentArgumentsSchema,
} as const;

// ── Result shaping (§7) ──

/**
 * How many rows a list returned, how many matched, and whether that is the whole
 * story. Every list result carries this: an agent that cannot tell a truncated
 * answer from a complete one will report "there are 25 issues" about a workspace
 * with 84, which is worse than returning nothing.
 */
export const mcpListSummarySchema = z.object({
  returned: z.number().int().nonnegative(),
  /** Omitted when the source pages by cursor and does not know its own size. */
  total: z.number().int().nonnegative().optional(),
  truncated: z.boolean(),
  /** Present only when there is a next page to ask for. */
  cursor: z.string().optional(),
});

export type McpListSummary = z.infer<typeof mcpListSummarySchema>;

/** Text that says what was shown of what, and what to do about it (§7). */
export function truncationNote(summary: McpListSummary): string {
  if (!summary.truncated) {
    return `All ${summary.total ?? summary.returned} shown.`;
  }

  // A cursor means the source can be walked further; without one, the only way
  // to see past the cap is to ask a narrower question.
  if (summary.cursor !== undefined) {
    return `${summary.returned} shown — pass the cursor for the next page.`;
  }

  return `${summary.returned} of ${summary.total} shown — narrow the filters or raise the limit to see more.`;
}
