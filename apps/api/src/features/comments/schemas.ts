import { z } from 'zod';

/**
 * Route-local param/query schemas for the comments module. Request *body*
 * shapes live in `packages/shared` (contracts); these coerce params/query
 * that belong to the router. Kept tiny so validation stays at the route
 * boundary (same split as issues/cycles).
 */

export const issueCommentParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  issueId: z.string().cuid(),
});

export const commentIdParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  issueId: z.string().cuid(),
  commentId: z.string().cuid(),
});

const limitSchema = z.preprocess((value: unknown) => {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return value;
}, z.number().int().min(1).max(100).optional());

// Conversation reads are chronological (oldest first); cursor walks
// (createdAt, id) ASC — the only order this endpoint serves.
export const listCommentsQuerySchema = z.object({
  limit: limitSchema,
  cursor: z.string().min(1).optional(),
});

export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
export type IssueCommentParams = z.infer<typeof issueCommentParamsSchema>;
export type CommentIdParams = z.infer<typeof commentIdParamsSchema>;
