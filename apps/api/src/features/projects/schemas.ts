import { z } from 'zod';
import {
  projectDateSchema,
  projectStatusSchema,
  viewScopeSchema,
} from '@shipyard/shared';

/**
 * Route-local param/query schemas for the projects module. Request *body*
 * shapes live in `packages/shared` (contracts); these coerce params/query that
 * belong to the router. Kept tiny so validation stays at the route boundary.
 */

export const slugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
});

export const projectIdParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  projectId: z.string().cuid(),
});

// :scope is validated against the ViewScope enum at the route boundary
// (api-design.md §3.2). F5 widens `viewScopeSchema` with 'ISSUE'.
export const viewScopeParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  scope: viewScopeSchema,
});

// List filters exact-match query params (api-design.md §5.1 / §11). Query
// values arrive as strings; `archived` is coerced from 'true'/'false'.
export const listProjectsQuerySchema = z.object({
  status: projectStatusSchema.optional(),
  // Filters by an opaque Better Auth user id (not a cuid), so validate length, not format.
  ownerId: z.string().min(1).optional(),
  startDate: projectDateSchema.optional(),
  targetDate: projectDateSchema.optional(),
  sort: z
    .enum(['createdAt', 'name', 'targetDate', 'startDate', 'status'])
    .optional(),
  order: z.enum(['asc', 'desc']).optional(),
  archived: z.enum(['true', 'false']).optional(),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type ViewScopeParams = z.infer<typeof viewScopeParamsSchema>;
