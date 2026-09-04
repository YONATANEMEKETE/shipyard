import { z } from 'zod';
import { cycleStatusSchema } from '@shipyard/shared';

/**
 * Route-local param/query schemas for the cycles module. Request *body*
 * shapes live in `packages/shared` (contracts); these coerce params/query
 * that belong to the router. Kept tiny so validation stays at the route
 * boundary (same split as projects/issues).
 */

export const slugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
});

export const cycleIdParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  cycleId: z.string().cuid(),
});

// List filters/sort (api-design.md §5.1). No pagination — cycles are few.
// Strict: unknown params (e.g. limit/cursor from the issues endpoint) are
// rejected rather than silently ignored — there is no second pagination mode.
export const listCyclesQuerySchema = z
  .object({
    status: cycleStatusSchema.optional(),
    archived: z.enum(['true', 'false']).optional(),
    sort: z
      .enum(['createdAt', 'name', 'startDate', 'endDate', 'status'])
      .optional(),
    order: z.enum(['asc', 'desc']).optional(),
  })
  .strict();

export type ListCyclesQuery = z.infer<typeof listCyclesQuerySchema>;
export type CycleIdParams = z.infer<typeof cycleIdParamsSchema>;
