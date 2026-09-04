import { z } from 'zod';

/**
 * Route-local param/query schemas for the notifications module. Response
 * shapes and internal event contracts live in `packages/shared`; these coerce
 * params/query that belong to the router. Kept tiny so validation stays at
 * the route boundary (same split as prior modules).
 *
 * This module is globally scoped by recipient (D2) — there is no slug param
 * anywhere here. `workspaceId` below is a *filter*, never a scope lookup:
 * unknown values match zero rows, never 404.
 */

export const notificationIdParamsSchema = z.object({
  notificationId: z.string().cuid(),
});

function booleanFlag(field: string) {
  return z.preprocess(
    (value: unknown) => {
      if (value === undefined) return undefined;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    },
    z.boolean({ message: `Use ${field}=true|false` }).optional(),
  );
}

const limitSchema = z.preprocess((value: unknown) => {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return value;
}, z.number().int().min(1).max(100).optional());

// Panel walk: newest-first over (createdAt, id) DESC — the only order served.
export const listNotificationsQuerySchema = z.object({
  unreadOnly: booleanFlag('unreadOnly'),
  workspaceId: z.string().cuid().optional(),
  limit: limitSchema,
  cursor: z.string().min(1).optional(),
});

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;

// Mark-all-read scope filter (same zero-match semantics as the panel).
export const readAllQuerySchema = z.object({
  workspaceId: z.string().cuid().optional(),
});

export type ReadAllQuery = z.infer<typeof readAllQuerySchema>;

// Clear-all filters: optional workspace scope + read-only subset.
export const clearAllQuerySchema = z.object({
  workspaceId: z.string().cuid().optional(),
  readOnly: booleanFlag('readOnly'),
});

export type ClearAllQuery = z.infer<typeof clearAllQuerySchema>;

// Mark-read / mark-all-read bodies: empty object required — a body attempting
// a transition (e.g. { read: false }) is rejected, not ignored (D6 one-way).
export const emptyBodySchema = z.object({}).strict();

// Unread-count takes no query — unknown params are rejected, not ignored.
export const emptyQuerySchema = z.object({}).strict();

export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;
