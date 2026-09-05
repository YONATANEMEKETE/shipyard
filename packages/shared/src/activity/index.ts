import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Activity Log contracts
//
// Owned by the activity module. Consumed by both the API (in-tx emission
// calls, server-side validation, response shapes) and the web app (activity
// page, filters, frozen-row rendering). Mirrors the Prisma enums/model in
// apps/api/prisma/schema.prisma (data-model.md §2).
//
// Event (internal) and card (HTTP) shapes are distinct on purpose — events
// are service-call arguments that never travel over HTTP (D2); cards are
// page responses with frozen snapshots rendered verbatim (D5). Page list
// query *wire* coercion lives in the API's route-local schemas.ts (same
// split as notifications/comments).
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums (mirror Prisma) ──

// The full MVP taxonomy, six areas (spec §3.1). Additive for future areas —
// each new area widens this enum with its own kinds.
export const activityKindSchema = z.enum([
  'WORKSPACE_CREATED',
  'WORKSPACE_UPDATED',
  'WORKSPACE_ARCHIVED',
  'WORKSPACE_RESTORED',
  'MEMBER_INVITED',
  'MEMBER_JOINED',
  'MEMBER_DECLINED',
  'MEMBER_INVITE_REVOKED',
  'MEMBER_REMOVED',
  'MEMBER_LEFT',
  'MEMBER_ROLE_CHANGED',
  'OWNERSHIP_TRANSFERRED',
  'PROJECT_CREATED',
  'PROJECT_RENAMED',
  'PROJECT_STATUS_CHANGED',
  'PROJECT_OWNER_TRANSFERRED',
  'PROJECT_ARCHIVED',
  'PROJECT_RESTORED',
  'PROJECT_DELETED',
  'ISSUE_CREATED',
  'ISSUE_STATUS_CHANGED',
  'ISSUE_ASSIGNED',
  'ISSUE_BLOCKED_SET',
  'ISSUE_BLOCKED_CLEARED',
  'ISSUE_ARCHIVED',
  'ISSUE_RESTORED',
  'ISSUE_DELETED',
  'COMMENT_CREATED',
  'COMMENT_DELETED',
  'CYCLE_CREATED',
  'CYCLE_STARTED',
  'CYCLE_COMPLETED',
  'CYCLE_REOPENED',
  'CYCLE_ARCHIVED',
  'CYCLE_RESTORED',
  'CYCLE_DELETED',
]);

export type ActivityKind = z.infer<typeof activityKindSchema>;

export const activityEntityTypeSchema = z.enum([
  'WORKSPACE',
  'MEMBER',
  'INVITATION',
  'PROJECT',
  'ISSUE',
  'COMMENT',
  'CYCLE',
]);

export type ActivityEntityType = z.infer<typeof activityEntityTypeSchema>;

// Page filter → kind sets, mapped server-side (api-design §5.1).
export const activityAreaSchema = z.enum([
  'workspace',
  'members',
  'projects',
  'issues',
  'comments',
  'cycles',
]);

export type ActivityArea = z.infer<typeof activityAreaSchema>;

// ── Internal event contract (service-to-service, never HTTP bodies) ──

// Composed by the emitting service from frozen values and passed to
// activityService.record(event, tx) inside the source transaction (D2).
// actorName is the member display name — or the invitee EMAIL for
// invitation-lifecycle kinds (MEMBER_INVITED/JOINED/DECLINED/REVOKED); the
// invitee may never be a member, and email matches the invitation row (D4).
export const recordActivityEventSchema = z.object({
  workspaceId: z.string(),
  actorId: z.string(),
  actorName: z.string().max(255),
  kind: activityKindSchema,
  entityType: activityEntityTypeSchema,
  entityId: z.string().nullable().optional(),
  entityTitle: z.string().nullable().optional(),
  summary: z.string().min(1).max(2000),
});

export type RecordActivityEvent = z.infer<typeof recordActivityEventSchema>;

// ── Response contracts (HTTP reads — frozen rows rendered verbatim, D5) ──

// One frozen event. `area` is derived from `kind` (filter chips, icons).
// Deleted-entity rows render `entityTitle`/`actorName` without links; the
// page never 404s for row state (D3).
export const activityEventCardSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string(),
  kind: activityKindSchema,
  area: activityAreaSchema,
  entityType: activityEntityTypeSchema,
  entityId: z.string().nullable(),
  entityTitle: z.string().nullable(),
  summary: z.string(),
  createdAt: z.string().datetime(),
});

export type ActivityEventCard = z.infer<typeof activityEventCardSchema>;

// Page walk (newest-first cursor over (createdAt, id) DESC).
export const activityListPageSchema = z.object({
  events: z.array(activityEventCardSchema),
  nextCursor: z.string().nullable(),
});

export type ActivityListPage = z.infer<typeof activityListPageSchema>;
