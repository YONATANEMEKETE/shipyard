import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Comments contracts
//
// Owned by the comments module (F8). Consumed by both the API (server-side
// validation, response shapes) and the web app (composer, conversation,
// mention rendering). Mirrors the Prisma models in
// apps/api/prisma/schema.prisma (data-model.md §2).
//
// List cursor/limit *wire* coercion lives in the API's route-local
// schemas.ts (same split as issues/cycles); this file holds the canonical
// domain shapes both sides share — no parallel shapes.
// ─────────────────────────────────────────────────────────────────────────────

// ── Canonical bounds & mention grammar (data-model D5/D6) ──

// Content bounds 1–10,000 chars, trimmed server-side. Matches the
// issue-description 10k bound so composer, validation, and column agree.
export const commentContentSchema = z
  .string({ message: 'Write something first' })
  .trim()
  .min(1, 'Write something first')
  .max(10000, 'Keep the comment under 10,000 characters');

export type CommentContent = z.infer<typeof commentContentSchema>;

// Single-token @handle grammar — one word, no spaces (D6). Resolution is
// case-insensitive against full `user.name` or any whitespace-separated word
// of it, among current workspace members only. Unknown tokens stay literal.
export const mentionTokenRegex = /@([A-Za-z0-9_.-]+)/g;

// ── Request contracts ──

export const createCommentSchema = z.object({
  content: commentContentSchema,
  // NOTE: no mentions field — mentions are derived server-side from content
  // (D1/D6). The client may read the member directory for suggestion UX, but
  // anything it sends is ignored; the server re-parses authoritatively.
});

export type CreateCommentRequest = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  // Full replacement; editedAt is set server-side (D4).
  content: commentContentSchema,
});

export type UpdateCommentRequest = z.infer<typeof updateCommentSchema>;

// ── Response contracts ──

// The comment author rendered on a card. authorId is the opaque Better Auth
// id; authorship is structural (Restrict), not a liveness check.
export const commentAuthorCardSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string().email(),
  image: z.string().nullable(),
});

export type CommentAuthorCard = z.infer<typeof commentAuthorCardSchema>;

// One resolved mention — a join row rendered with the user's current profile.
// Joins whose user is gone fall back to literal text from `content` (D3).
export const commentMentionCardSchema = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

export type CommentMentionCard = z.infer<typeof commentMentionCardSchema>;

// Card shape — what list/detail both render from. Mentions ship inline in
// encounter order so the conversation needs no second fetch.
export const commentCardSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  issueId: z.string(),
  author: commentAuthorCardSchema,
  content: z.string(),
  mentions: z.array(commentMentionCardSchema),
  // null ⇒ never edited (D4); the client renders `(edited)` + this time.
  editedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CommentCard = z.infer<typeof commentCardSchema>;

// Delete comment response. The row is gone (no tombstone); the client drops
// it from the cached conversation. Mention joins + their notifications die
// with it (D8); siblings, issues, and users are untouched.
export const deleteCommentResponseSchema = z.object({
  deletedCommentId: z.string(),
});

export type DeleteCommentResponse = z.infer<typeof deleteCommentResponseSchema>;
