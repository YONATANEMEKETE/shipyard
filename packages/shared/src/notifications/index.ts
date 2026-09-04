import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications contracts
//
// Owned by the notifications module (F6). Consumed by both the API (in-tx
// emission/retraction calls, server-side validation, response shapes) and the
// web app (bell badge, panel, deep-link navigation, copy presenter).
// Mirrors the Prisma enums in apps/api/prisma/schema.prisma (data-model.md §2).
//
// Event (internal) and card (HTTP) shapes are distinct on purpose — events
// are service-call arguments that never travel over HTTP (D9); cards are poll
// responses with live joins (D3). Panel list query *wire* coercion lives in
// the API's route-local schemas.ts (same split as issues/cycles/comments).
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums (mirror Prisma) ──

// The only MVP event types (spec §3.1). Additive for future types — each new
// type widens this enum with its own nullable source ref.
export const notificationTypeSchema = z.enum(['ASSIGNMENT', 'MENTION']);

export type NotificationType = z.infer<typeof notificationTypeSchema>;

// ── Internal event contracts (service-to-service, never HTTP bodies) ──

// Issues create-with-assignee / actual-change reassign. Same-person,
// unassign, and self-assign are filtered by the caller (D8); F6
// trusts-but-verifies recipient liveness in-tx.
export const assignmentEventSchema = z.object({
  workspaceId: z.string(),
  issueId: z.string(),
  newAssigneeId: z.string(),
  actorId: z.string(),
});

export type AssignmentEvent = z.infer<typeof assignmentEventSchema>;

// Comment create, once per distinct resolved recipient. Deduped upstream via
// the comment_mention PK; self already excluded (D8).
export const mentionEventSchema = z.object({
  workspaceId: z.string(),
  issueId: z.string(),
  commentId: z.string(),
  recipientId: z.string(),
  actorId: z.string(),
});

export type MentionEvent = z.infer<typeof mentionEventSchema>;

// ── Response contracts (HTTP reads — live joins, D3) ──

// Actor rendered on a card. "Former member" fallback when actorId IS NULL
// (D5) — the name/image below are read-time values, never snapshots.
export const notificationActorCardSchema = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

export type NotificationActorCard = z.infer<typeof notificationActorCardSchema>;

// The related issue, joined live (D3): renames flow through, archived issues
// stay navigable read-only, deleted issues cascade the row away (rule 5).
// workspaceSlug is the navigation target (/w/:slug/issues/:id).
export const notificationIssueCardSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  workspaceId: z.string(),
  workspaceSlug: z.string(),
  archivedAt: z.string().datetime().nullable(),
});

export type NotificationIssueCard = z.infer<typeof notificationIssueCardSchema>;

export const notificationCardSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  type: notificationTypeSchema,
  actor: notificationActorCardSchema.nullable(),
  issue: notificationIssueCardSchema,
  // Set for MENTION (comment-context scroll target); null for ASSIGNMENT.
  commentId: z.string().nullable(),
  // null ⇒ unread (D6); the only legal mutation is unread→read.
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type NotificationCard = z.infer<typeof notificationCardSchema>;

// Panel page (newest-first cursor over (createdAt, id) DESC).
export const notificationListPageSchema = z.object({
  notifications: z.array(notificationCardSchema),
  nextCursor: z.string().nullable(),
});

export type NotificationListPage = z.infer<typeof notificationListPageSchema>;

// Badge poll response — derived, never stored (spec rule 4).
export const unreadCountSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
});

export type UnreadCount = z.infer<typeof unreadCountSchema>;

// Mark-all-read response.
export const markAllReadResponseSchema = z.object({
  markedCount: z.number().int().nonnegative(),
});

export type MarkAllReadResponse = z.infer<typeof markAllReadResponseSchema>;

// Clear-all response.
export const clearAllResponseSchema = z.object({
  deletedCount: z.number().int().nonnegative(),
});

export type ClearAllResponse = z.infer<typeof clearAllResponseSchema>;

// Delete-one response. The row is gone; the client drops it from the panel.
export const deleteNotificationResponseSchema = z.object({
  deletedNotificationId: z.string(),
});

export type DeleteNotificationResponse = z.infer<
  typeof deleteNotificationResponseSchema
>;
