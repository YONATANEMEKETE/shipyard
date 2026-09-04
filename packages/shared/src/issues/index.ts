import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Issues + Labels contracts
//
// Owned by the issues module (F5). Consumed by both the API (server-side
// validation, response shapes) and the web app (forms, mutations, render map).
// Mirrors the Prisma enums in apps/api/prisma/schema.prisma (data-model.md §2)
// and the endpoint contracts (api-design.md §5).
//
// List/filter/sort/cursor *wire* coercion lives in the API's route-local
// schemas.ts (same split as projects); this file holds the canonical domain
// shapes both sides share — no parallel shapes.
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums (mirror Prisma) ──

// Fixed workflow BACKLOG | TODO | IN_PROGRESS | DONE — free transitions in any
// direction (spec §3.2). No ARCHIVED value — archive is `archivedAt` (D1).
export const issueStatusSchema = z.enum([
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'DONE',
]);

export type IssueStatus = z.infer<typeof issueStatusSchema>;

// Priority scale (spec Q1 resolved). NO_PRIORITY is the default; sort rank is
// Urgent > High > Medium > Low > No Priority (data-model D9).
export const issuePrioritySchema = z.enum([
  'NO_PRIORITY',
  'URGENT',
  'HIGH',
  'MEDIUM',
  'LOW',
]);

export type IssuePriority = z.infer<typeof issuePrioritySchema>;

// Append-only audit events (data-model D7). One row per changed concern — a
// multi-field PATCH emits one row per concern. Description edits emit nothing
// (bounded noise). F7 widens this additively with CYCLE_CHANGED.
export const issueHistoryEventSchema = z.enum([
  'CREATED',
  'STATUS_CHANGED',
  'BLOCKED_SET',
  'BLOCKED_CLEARED',
  'ASSIGNED',
  'UNASSIGNED',
  'PRIORITY_CHANGED',
  'PROJECT_CHANGED',
  'DUE_DATE_CHANGED',
  'TITLE_CHANGED',
  'ARCHIVED',
  'RESTORED',
  'LABEL_ADDED',
  'LABEL_REMOVED',
]);

export type IssueHistoryEvent = z.infer<typeof issueHistoryEventSchema>;

// ── Canonical bounds (match DB column types, data-model D11) ──

// Title is the only mandatory field (spec §3.1); trimmed server-side.
export const issueTitleSchema = z
  .string({ message: 'Give your issue a title' })
  .trim()
  .min(1, 'Give your issue a title')
  .max(255, 'Keep the issue title under 255 characters');

export type IssueTitle = z.infer<typeof issueTitleSchema>;

export const issueDescriptionSchema = z
  .string()
  .max(10000, 'Description must be 10,000 characters or less')
  .optional();

export type IssueDescription = z.infer<typeof issueDescriptionSchema>;

// Optional reason on the orthogonal blocked flag; empty normalizes to null
// server-side. Only settable on unfinished issues (spec §3.3, rule 6).
export const blockedReasonSchema = z
  .string()
  .trim()
  .max(500, 'Keep the blocked reason under 500 characters')
  .optional();

export type BlockedReason = z.infer<typeof blockedReasonSchema>;

// Label name — trimmed, unique per workspace case-insensitively via the D6
// functional index. Any member may create labels (spec Q2 resolved).
export const labelNameSchema = z
  .string({ message: 'Give your label a name' })
  .trim()
  .min(1, 'Give your label a name')
  .max(60, 'Keep the label name under 60 characters');

export type LabelName = z.infer<typeof labelNameSchema>;

export const labelColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Use a valid hex color — #RRGGBB');

export type LabelColor = z.infer<typeof labelColorSchema>;

// Day-precision dates travel as YYYY-MM-DD strings end-to-end (data-model D10,
// @db.Date). A regex is the canonical shape; the API coerces to a Date. Past
// dates are allowed (overdue is a feature).
export const issueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date — YYYY-MM-DD');

export type IssueDate = z.infer<typeof issueDateSchema>;

// Default label color when none is supplied (data-model §2.2).
export const DEFAULT_LABEL_COLOR = '#6B7280';

// ── Request contracts ──

export const createIssueSchema = z.object({
  title: issueTitleSchema,
  description: issueDescriptionSchema,
  // Omitted ⇒ NO_PRIORITY server-side.
  priority: issuePrioritySchema.optional(),
  // Omitted ⇒ BACKLOG server-side (overridable so boards can create-into-column).
  status: issueStatusSchema.optional(),
  // Better Auth user id — opaque (not a cuid), so validate length, not format
  // (same convention as the projects ownerId filter). Must resolve to a
  // current member of the same workspace (service invariant, D3).
  assigneeId: z.string().min(1).nullable().optional(),
  projectId: z.string().cuid().nullable().optional(),
  labelIds: z.array(z.string().cuid()).max(20).optional(),
  dueDate: issueDateSchema.nullable().optional(),
  // NOTE: no cycleId in F5 — added by F7 (data-model D5).
});

export type CreateIssueRequest = z.infer<typeof createIssueSchema>;

// Nullable optional fields mean "explicitly unset"; omitted means "leave as
// is". Label membership is NOT managed here — use attach/detach endpoints.
export const updateIssueSchema = z.object({
  title: issueTitleSchema.optional(),
  description: z
    .string()
    .max(10000, 'Description must be 10,000 characters or less')
    .nullable()
    .optional(),
  status: issueStatusSchema.optional(),
  priority: issuePrioritySchema.optional(),
  // null ⇒ unassign.
  assigneeId: z.string().min(1).nullable().optional(),
  // null ⇒ detach from project.
  projectId: z.string().cuid().nullable().optional(),
  dueDate: issueDateSchema.nullable().optional(),
  blocked: z.boolean().optional(),
  blockedReason: blockedReasonSchema.nullable().optional(),
});

export type UpdateIssueRequest = z.infer<typeof updateIssueSchema>;

export const createLabelSchema = z.object({
  name: labelNameSchema,
  // Omitted ⇒ DEFAULT_LABEL_COLOR server-side.
  color: labelColorSchema.optional(),
});

export type CreateLabelRequest = z.infer<typeof createLabelSchema>;

export const updateLabelSchema = z.object({
  name: labelNameSchema.optional(),
  color: labelColorSchema.optional(),
});

export type UpdateLabelRequest = z.infer<typeof updateLabelSchema>;

// Attach body (#13). Detach (#14) carries :labelId in the path, no body.
export const attachLabelSchema = z.object({
  labelId: z.string().cuid(),
});

export type AttachLabelRequest = z.infer<typeof attachLabelSchema>;

// Typed-identifier confirmation for permanent delete (api-design #7). Titles
// are non-unique so the SHIP-### identifier is the only unambiguous
// confirmation key — must equal the issue's exact identifier server-side.
export const deleteIssueSchema = z.object({
  confirmIdentifier: z
    .string()
    .trim()
    .min(1, 'Type the issue identifier to confirm'),
});

export type DeleteIssueRequest = z.infer<typeof deleteIssueSchema>;

// ── Response contracts ──

// A workspace member rendered on an issue (assignee or creator). userId is the
// opaque Better Auth id; membership liveness is a service invariant (D3).
export const issueAssigneeCardSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string().email(),
  image: z.string().nullable(),
});

export type IssueAssigneeCard = z.infer<typeof issueAssigneeCardSchema>;

export const labelCardSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  color: z.string(),
});

export type LabelCard = z.infer<typeof labelCardSchema>;

// Card shape — what list/board/detail all render from. Labels ship inline so
// the board needs no second fetch. `identifier` is SHIP-{seqNumber}, rendered
// verbatim by the web (no zero-padding — padding is presentational).
export const issueCardSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  seqNumber: z.number().int().positive(),
  identifier: z.string(),
  title: z.string(),
  status: issueStatusSchema,
  priority: issuePrioritySchema,
  assignee: issueAssigneeCardSchema.nullable(),
  projectId: z.string().nullable(),
  // F7 adds: cycleId
  dueDate: issueDateSchema.nullable(),
  blocked: z.boolean(),
  blockedReason: z.string().nullable(),
  labels: z.array(labelCardSchema),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type IssueCard = z.infer<typeof issueCardSchema>;

// Detail = card + description + creator. Named alias so a future detail-only
// field doesn't ripple through list consumers.
export const issueDetailSchema = issueCardSchema.extend({
  description: z.string().nullable(),
  creator: issueAssigneeCardSchema,
});

export type IssueDetail = z.infer<typeof issueDetailSchema>;

export const issueHistoryCardSchema = z.object({
  id: z.string(),
  event: issueHistoryEventSchema,
  actor: issueAssigneeCardSchema.nullable(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type IssueHistoryCard = z.infer<typeof issueHistoryCardSchema>;

// Collection pages — cursor pagination (spec Q4 resolved). `nextCursor null`
// ⇒ end of results. Cursor is sort-specific (api-design §5.1).
export const listIssuesResponseSchema = z.object({
  issues: z.array(issueCardSchema),
  nextCursor: z.string().nullable(),
});

export type ListIssuesResponse = z.infer<typeof listIssuesResponseSchema>;

export const listIssueHistoryResponseSchema = z.object({
  history: z.array(issueHistoryCardSchema),
  nextCursor: z.string().nullable(),
});

export type ListIssueHistoryResponse = z.infer<
  typeof listIssueHistoryResponseSchema
>;

// Delete issue response (#7). The sequence is untouched — the identifier is
// never reused (spec rule 4).
export const deleteIssueResponseSchema = z.object({
  deletedIssueId: z.string(),
  identifier: z.string(),
});

export type DeleteIssueResponse = z.infer<typeof deleteIssueResponseSchema>;

// Delete label response (#12). Joins cascade; issues survive untouched
// (spec §3.7).
export const deleteLabelResponseSchema = z.object({
  deletedLabelId: z.string(),
  unlinkedIssues: z.number().int().nonnegative(),
});

export type DeleteLabelResponse = z.infer<typeof deleteLabelResponseSchema>;
