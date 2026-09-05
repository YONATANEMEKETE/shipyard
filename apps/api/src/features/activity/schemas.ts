import { z } from 'zod';
import { activityAreaSchema, activityEntityTypeSchema } from '@shipyard/shared';

/**
 * Route-local query schema for the activity module. Response shapes and the
 * internal event contract live in `packages/shared`; this coerces the page
 * walk query that belongs to the router (same split as
 * notifications/comments). `area` maps to kind sets server-side (§5.1).
 */

const limitSchema = z.preprocess((value: unknown) => {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return value;
}, z.number().int().min(1).max(100).optional());

// Page walk: newest-first over (createdAt, id) DESC — the only order served.
// Unknown filter values match zero rows (filters, not scope — never 404).
export const listActivityQuerySchema = z.object({
  area: activityAreaSchema.optional(),
  actorId: z.string().cuid().optional(),
  entityType: activityEntityTypeSchema.optional(),
  limit: limitSchema,
  cursor: z.string().min(1).optional(),
});

export type ListActivityQuery = z.infer<typeof listActivityQuerySchema>;
