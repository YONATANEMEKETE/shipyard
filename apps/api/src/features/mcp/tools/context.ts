import type {
  IssueCard,
  McpCallToolResult,
  McpListSummary,
  McpTool,
} from '@shipyard/shared';
import { jsonSchemaObjectSchema } from '@shipyard/shared';
import { z } from 'zod';
import type { WorkspaceRequestContext } from '../../../common/guards/workspace-context.js';
import { cyclesService } from '../../cycles/service.js';
import { issuesService } from '../../issues/service.js';
import { membersService } from '../../members/service.js';
import { projectsService } from '../../projects/service.js';
import type { McpCredential } from '../auth.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared plumbing for the read tools (F13, M5)
//
// Everything the eight tools would otherwise each re-invent: turning what a
// person says ("Omar", "website redesign", "SHIP-42") into what the services
// need (a user id, a project id, a workspace-scoped issue), and packing a
// service's answer into a tool result the model can read.
//
// Nothing here makes a decision the owning module owns — no visibility rules, no
// permission checks, no filtering. It maps names to identifiers and results to
// text; the services remain the only place a workspace's rules live.
// ─────────────────────────────────────────────────────────────────────────────

/** What every handler receives: the resolved caller and its credential. */
export interface McpToolContext {
  readonly context: WorkspaceRequestContext;
  readonly credential: McpCredential;
  readonly requestId?: string;
}

/** One `Label: value` line, or nothing when there is no value to show. */
export function line(label: string, value: string): string {
  return `${label}: ${value}`;
}

/**
 * The JSON Schema a model reads, generated from the Zod contract it will be
 * validated against — one definition, two consumers (§6.3).
 */
export function toolInputSchema(schema: z.ZodType): McpTool['inputSchema'] {
  const json = z.toJSONSchema(schema) as {
    required?: string[];
    properties?: Record<string, { default?: unknown }>;
  };

  // `.default()` lands in `required` because a parsed object *will* have the
  // key. That reads, to a model, as "you must send every default" — so the
  // generated schema is corrected to say what is true: the property is
  // optional, and omitting it means the default.
  if (json.required !== undefined && json.properties !== undefined) {
    const properties = json.properties;
    const required = json.required.filter(
      (key) => properties[key]?.default === undefined,
    );

    if (required.length === 0) {
      delete json.required;
    } else {
      json.required = required;
    }
  }

  return jsonSchemaObjectSchema.parse(json);
}

/** One text block plus, where the shape is stable, the same data structured. */
export function toolResult(
  text: string,
  structured?: unknown,
): McpCallToolResult {
  return {
    resultType: 'complete',
    content: [{ type: 'text', text }],
    ...(structured === undefined ? {} : { structuredContent: structured }),
  };
}

/** A list result: the text says how much of the whole it is (§7). */
export function listResult(args: {
  heading: string;
  lines: string[];
  /** Present when the result is a measured slice of something larger. */
  summary?: McpListSummary;
  note: string;
  structured: unknown;
}): McpCallToolResult {
  return toolResult(
    [
      `${args.heading} — ${args.note}`,
      ...(args.lines.length > 0 ? args.lines : ['(nothing matched)']),
    ].join('\n'),
    args.structured,
  );
}

/**
 * A failure the caller can act on: a tool result with `isError: true`, never a
 * protocol error. A name that resolves to nothing is a *domain* outcome — the
 * request was understood perfectly.
 */
export function toolFailure(text: string, code: string): McpCallToolResult {
  return {
    resultType: 'complete',
    content: [{ type: 'text', text }],
    isError: true,
    _meta: { 'io.shipyard/errorCode': code },
  };
}

export interface MemberRef {
  userId: string;
  name: string;
}

/**
 * The assignee filter as the service wants it: a user id, or the `me` alias for
 * the caller. Returns a tool result instead of a string when the reference
 * matches nobody — a name that resolves to nothing is a domain outcome the
 * caller can fix, so it is answered inside the tool, not thrown.
 */
export async function resolveAssigneeId(
  reference: string | undefined,
  tool: McpToolContext,
): Promise<string | undefined | McpCallToolResult> {
  if (reference === undefined) return undefined;
  if (reference.trim().toLowerCase() === 'me') return 'me';

  const person = await resolvePerson(tool.context.workspaceId, reference);
  if (person === null) {
    return toolFailure(
      `No member of this workspace matches "${reference}". Try shipyard_list_members to see who is here, or drop the assignee filter.`,
      'ASSIGNEE_NOT_FOUND',
    );
  }

  return person.userId;
}

/**
 * A person as the tool surface refers to one: name, email, user id, or `me`.
 *
 * Emails are matched but never *returned* — the agent surface shows names only
 * (spec §7 Q2), so a member can be found by the address they know without that
 * address ever entering a result.
 */
export async function resolvePerson(
  workspaceId: string,
  reference: string,
): Promise<MemberRef | null> {
  const members = await membersService.listMembers(workspaceId);
  const needle = reference.trim().toLowerCase();
  const match = members.find(
    (member) =>
      member.userId.toLowerCase() === needle ||
      member.name.toLowerCase() === needle ||
      member.email.toLowerCase() === needle,
  );

  return match === undefined
    ? null
    : { userId: match.userId, name: match.name };
}

export function memberNames(
  members: { userId: string; name: string }[],
): Map<string, string> {
  return new Map(members.map((member) => [member.userId, member.name]));
}

/**
 * A project or cycle as the tool surface refers to one: its name, or its id for
 * callers that already hold one. Names are matched case-insensitively and must
 * be unique in practice — two projects may legitimately share a name, and when
 * they do the first is used and the result says which, rather than failing a
 * request the caller expressed correctly.
 */
export function toIdByNameOrId(
  reference: string | undefined,
  rows: { id: string; name: string }[],
): string | undefined {
  if (reference === undefined) return undefined;

  const needle = reference.trim().toLowerCase();

  return rows.find(
    (row) => row.id === reference || row.name.toLowerCase() === needle,
  )?.id;
}

// ── Writing: resolutions shared by the six write tools (F13, M7) ──
//
// A write has to turn the same words a read does into identifiers, and it has
// one extra duty: when a reference matches nothing it must *say so* and change
// nothing. `Resolved<T>` makes that a type rather than a convention — a
// `{ ok: false }` carries the tool result the caller must return, so a handler
// cannot accidentally fall through and write against an unresolved id.
//
// Nothing here decides anything: the services still own archived state, role
// and state rules, and a failure they raise travels on to the error mapper.

export type Resolved<T> =
  { ok: true; value: T } | { ok: false; result: McpCallToolResult };

/**
 * The issue a caller named, by `SHIP-42` or internal id. Archived issues
 * resolve too — the services are the ones that refuse a write to an archived
 * issue, with a message that says to restore it first.
 */
export async function resolveIssueRef(
  reference: string,
  tool: McpToolContext,
): Promise<Resolved<IssueCard>> {
  const card = await issuesService.resolveRef(
    tool.context,
    tool.credential.userId,
    reference,
  );

  if (card === null) {
    return {
      ok: false,
      result: toolFailure(
        `No issue in this workspace matches "${reference}". Issue identifiers look like SHIP-42 — use shipyard_list_issues or shipyard_search to find the right one, then call this again.`,
        'ISSUE_NOT_FOUND',
      ),
    };
  }

  return { ok: true, value: card };
}

/**
 * The person a caller named, as the user id a write needs. `me` is the
 * credential's owner — on this surface the caller *is* the token, so `me` is
 * the only self-reference that needs no lookup.
 *
 * **Exact match only**, and that is a safety rule rather than strictness: two
 * members may share a first name, and a mutation that picked one of them would
 * hand somebody else's work over silently. The failure therefore names what to
 * send instead — a full name, an email address, a user id, or `me` — because a
 * model that guessed once needs to be told the shape that works.
 *
 * `null` (and an omitted reference) mean "nobody": the caller unassigns by
 * sending null, and the tools pass that through as the service's own unset.
 */
export async function resolveAssigneeUserId(
  reference: string | null,
  tool: McpToolContext,
): Promise<Resolved<string | null>> {
  if (reference === null) return { ok: true, value: null };
  if (reference.trim().toLowerCase() === 'me') {
    return { ok: true, value: tool.credential.userId };
  }

  const person = await resolvePerson(tool.context.workspaceId, reference);

  if (person === null) {
    return {
      ok: false,
      result: toolFailure(
        `No member of this workspace matches "${reference}" exactly. Send the member's full name, their email address, a user id, or "me" — shipyard_list_members shows the full names. Nothing was changed.`,
        'ASSIGNEE_NOT_FOUND',
      ),
    };
  }

  return { ok: true, value: person.userId };
}

/** A project by name or id; `null` and omitted both stay unset. */
export async function resolveProjectRef(
  reference: string | null | undefined,
  tool: McpToolContext,
): Promise<Resolved<string | null | undefined>> {
  if (reference === undefined || reference === null) {
    return { ok: true, value: reference };
  }

  const projects = await projectsService.list(tool.context, {});
  const id = toIdByNameOrId(reference, projects);

  if (id === undefined) {
    return {
      ok: false,
      result: toolFailure(
        `No project in this workspace matches "${reference}". Known projects: ${projects.map((project) => project.name).join(', ') || 'none yet'}.`,
        'PROJECT_NOT_FOUND',
      ),
    };
  }

  return { ok: true, value: id };
}

/** A cycle by name or id; `null` and omitted both stay unset. */
export async function resolveCycleRef(
  reference: string | null | undefined,
  tool: McpToolContext,
): Promise<Resolved<string | null | undefined>> {
  if (reference === undefined || reference === null) {
    return { ok: true, value: reference };
  }

  const page = await cyclesService.list(tool.context, {});
  const id = toIdByNameOrId(reference, page.cycles);

  if (id === undefined) {
    return {
      ok: false,
      result: toolFailure(
        `No cycle in this workspace matches "${reference}". Known cycles: ${page.cycles.map((cycle) => cycle.name).join(', ') || 'none yet'}.`,
        'CYCLE_NOT_FOUND',
      ),
    };
  }

  return { ok: true, value: id };
}

/**
 * Label names as the ids the service takes. An unknown name fails the whole
 * call rather than attaching the labels that did match: a create that silently
 * dropped one of four labels is worse than one that asked again.
 */
export async function resolveLabelIds(
  names: string[] | undefined,
  tool: McpToolContext,
): Promise<Resolved<string[]>> {
  if (names === undefined || names.length === 0) {
    return { ok: true, value: [] };
  }

  const page = await issuesService.listLabels(tool.context);
  const wanted = names.map((name) => name.trim().toLowerCase());
  const matched = page.labels.filter((label) =>
    wanted.includes(label.name.toLowerCase()),
  );

  if (matched.length !== wanted.length) {
    const missing = names.filter(
      (name) =>
        !page.labels.some(
          (label) => label.name.toLowerCase() === name.trim().toLowerCase(),
        ),
    );

    return {
      ok: false,
      result: toolFailure(
        `No label named ${missing.join(', ')} in this workspace. Labels here: ${page.labels.map((label) => label.name).join(', ') || 'none yet'}.`,
        'LABEL_NOT_FOUND',
      ),
    };
  }

  return { ok: true, value: matched.map((label) => label.id) };
}

/** `before → after`, for a change the caller asked for. */
export function changeLine(
  label: string,
  before: string | null,
  after: string | null,
): string {
  return `- ${label}: ${before ?? 'none'} → ${after ?? 'none'}`;
}

/** One issue as a write confirms it: identifier, title, and its current state. */
export function issueLine(issue: {
  identifier: string;
  title: string;
  status: string;
  assignee: { name: string } | null;
  blocked: boolean;
}): string {
  return [
    `${issue.identifier} ${issue.title}`,
    issue.status.toLowerCase(),
    issue.assignee === null ? 'unassigned' : `@${issue.assignee.name}`,
    ...(issue.blocked ? ['blocked'] : []),
  ].join(' · ');
}

/**
 * An issue as this surface returns it (api-design §7).
 *
 * Names, not ids — every action here takes a name or an identifier, so an
 * internal id is a token the model would have to carry for no reason. And
 * **no email address**: the member projections on this surface are a name,
 * never the address, which is why this exists rather than the service's own
 * detail object (whose assignee and creator carry one).
 */
export function issueProjection(issue: {
  identifier: string;
  title: string;
  status: string;
  priority: string;
  assignee: { name: string } | null;
  dueDate: string | null;
  blocked: boolean;
  blockedReason: string | null;
  labels: { name: string }[];
  archivedAt: string | null;
}) {
  return {
    identifier: issue.identifier,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    assignee: issue.assignee === null ? null : issue.assignee.name,
    dueDate: issue.dueDate,
    blocked: issue.blocked,
    blockedReason: issue.blockedReason,
    labels: issue.labels.map((label) => label.name),
    archivedAt: issue.archivedAt,
  };
}
