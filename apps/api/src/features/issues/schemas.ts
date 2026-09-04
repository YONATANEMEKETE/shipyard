import { z } from 'zod';
import {
  issueDateSchema,
  issuePrioritySchema,
  issueStatusSchema,
} from '@shipyard/shared';

/**
 * Route-local param/query schemas for the issues module. Request *body*
 * shapes live in `packages/shared` (contracts); these coerce params/query
 * that belong to the router. Kept tiny so validation stays at the route
 * boundary (same split as projects).
 */

export const slugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
});

export const issueIdParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  issueId: z.string().cuid(),
});

export const labelIdParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  labelId: z.string().cuid(),
});

export const issueLabelParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  issueId: z.string().cuid(),
  labelId: z.string().cuid(),
});

/**
 * Repeatable-or-comma-separated enum filter. Express delivers `?status=A&B`
 * as `['A','B']` and `?status=A,B` as `'A,B'`; both normalize to `['A','B']`.
 * Absent stays absent; empty (e.g. `?status=`) normalizes to absent so the
 * client can always send the key.
 */
function multiEnum<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.preprocess((value: unknown) => {
    if (value === undefined) return undefined;
    const raw: unknown[] = Array.isArray(value) ? value : [value];
    const parts = raw
      .flatMap((part) => (typeof part === 'string' ? part.split(',') : []))
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length === 0) return undefined;
    return parts;
  }, z.array(valueSchema).optional());
}

/** Comma-separated label-id filter (AND semantics — issue must carry all). */
const labelsFilterSchema = z.preprocess((value: unknown) => {
  if (value === undefined) return undefined;
  const raw: unknown[] = Array.isArray(value) ? value : [value];
  const parts = raw
    .flatMap((part) => (typeof part === 'string' ? part.split(',') : []))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return undefined;
  return parts;
}, z.array(z.string().cuid()).max(20).optional());

const limitSchema = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return value;
}, z.number().int().min(1).max(100).optional());

// List filters/sort/cursor (api-design.md §5.1). Query values arrive as
// strings; `blocked`/`archived` stay string enums here and the service maps
// them to booleans so the wire shape stays explicit at the boundary.
export const listIssuesQuerySchema = z.object({
  status: multiEnum(issueStatusSchema),
  priority: multiEnum(issuePrioritySchema),
  // Opaque Better Auth user id (not a cuid) or the `me` alias for the caller.
  assigneeId: z.string().min(1).optional(),
  projectId: z.string().cuid().optional(),
  labels: labelsFilterSchema,
  blocked: z.enum(['true', 'false']).optional(),
  dueDateFrom: issueDateSchema.optional(),
  dueDateTo: issueDateSchema.optional(),
  // F5 basic search: ILIKE title/description + exact SHIP-###. Trimmed
  // server-side; <2 chars ignored (not an error); >200 rejected here.
  q: z.string().max(200, 'Keep the search under 200 characters').optional(),
  sort: z
    .enum(['createdAt', 'updatedAt', 'priority', 'dueDate', 'seqNumber'])
    .optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: limitSchema,
  cursor: z.string().min(1).optional(),
  archived: z.enum(['true', 'false']).optional(),
});

export type ListIssuesQuery = z.infer<typeof listIssuesQuerySchema>;

// History reads are chronological (oldest first); cursor walks (createdAt,id).
export const listHistoryQuerySchema = z.object({
  limit: limitSchema,
  cursor: z.string().min(1).optional(),
});

export type ListHistoryQuery = z.infer<typeof listHistoryQuerySchema>;
export type IssueIdParams = z.infer<typeof issueIdParamsSchema>;
export type LabelIdParams = z.infer<typeof labelIdParamsSchema>;
export type IssueLabelParams = z.infer<typeof issueLabelParamsSchema>;
