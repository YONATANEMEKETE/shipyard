import type {
  McpCallToolResult,
  McpListSummary,
  McpTool,
} from '@shipyard/shared';
import { jsonSchemaObjectSchema } from '@shipyard/shared';
import { z } from 'zod';
import type { WorkspaceRequestContext } from '../../../common/guards/workspace-context.js';
import { membersService } from '../../members/service.js';
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
