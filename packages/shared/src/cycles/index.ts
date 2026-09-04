import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Cycles contracts
//
// Owned by the cycles module (F7). Consumed by both the API (server-side
// validation, response shapes) and the web app (forms, mutations, render map).
// Mirrors the Prisma enums in apps/api/prisma/schema.prisma (data-model.md §2)
// and the endpoint contracts (api-design.md §5).
//
// List/filter/sort *wire* coercion lives in the API's route-local
// schemas.ts (same split as projects/issues); this file holds the canonical
// domain shapes both sides share — no parallel shapes.
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums (mirror Prisma) ──

// Operational status — only PLANNED | ACTIVE | COMPLETED. ARCHIVED is a
// separate dimension (cycle.archivedAt), NOT an enum value (data-model D1).
// Transitions happen only via named actions (start/complete/reopen), never a
// generic status write (data-model D2).
export const cycleStatusSchema = z.enum(['PLANNED', 'ACTIVE', 'COMPLETED']);

export type CycleStatus = z.infer<typeof cycleStatusSchema>;

// ── Canonical bounds (match DB column types, data-model D4/D11) ──

// Canonical name bound — matches Prisma VarChar(120); trimmed server-side.
// Product-facing messages: never leak Zod's "String must..." internals.
export const cycleNameSchema = z
  .string({ message: 'Give your cycle a name' })
  .trim()
  .min(1, 'Give your cycle a name')
  .max(120, 'Keep the cycle name under 120 characters');

export type CycleName = z.infer<typeof cycleNameSchema>;

export const cycleGoalSchema = z
  .string()
  .max(10000, 'Goal must be 10,000 characters or less')
  .optional();

export type CycleGoal = z.infer<typeof cycleGoalSchema>;

// Day-precision dates travel as YYYY-MM-DD strings end-to-end (data-model D4,
// @db.Date). A regex is the canonical shape; the API coerces to a Date.
// Past start dates are allowed (spec Q2 resolved — cycles can start late).
export const cycleDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date — YYYY-MM-DD');

export type CycleDate = z.infer<typeof cycleDateSchema>;

// ── Request contracts ──

export const createCycleSchema = z
  .object({
    name: cycleNameSchema,
    goal: cycleGoalSchema,
    // Both dates required (spec §2). Creation always lands PLANNED.
    startDate: cycleDateSchema,
    // Must be >= startDate (inclusive bounds — same-day is a valid one-day
    // iteration). YYYY-MM-DD strings compare lexicographically.
    endDate: cycleDateSchema,
  })
  .refine((body) => body.endDate >= body.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

export type CreateCycleRequest = z.infer<typeof createCycleSchema>;

// Nullable optional fields mean "explicitly unset" (goal only); omitted means
// "leave as is". At least one field is required — a no-op patch is rejected.
// NOTE: no status field — transitions are named actions (D2), never generic
// writes.
export const updateCycleSchema = z
  .object({
    name: cycleNameSchema.optional(),
    goal: z
      .string()
      .max(10000, 'Goal must be 10,000 characters or less')
      .nullable()
      .optional(),
    startDate: cycleDateSchema.optional(),
    endDate: cycleDateSchema.optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.goal !== undefined ||
      body.startDate !== undefined ||
      body.endDate !== undefined,
    {
      message: 'At least one of name, goal, startDate or endDate is required',
      path: ['$root'],
    },
  )
  .refine(
    (body) =>
      body.startDate === undefined ||
      body.endDate === undefined ||
      body.endDate >= body.startDate,
    {
      message: 'End date must be on or after the start date',
      path: ['endDate'],
    },
  );

export type UpdateCycleRequest = z.infer<typeof updateCycleSchema>;

// Start/complete/reopen/archive/restore/delete are confirmed actions: the
// server rejects a missing literal confirmation flag with
// CONFIRMATION_REQUIRED (api-design.md §5). Delete confirms with
// `{ confirm: true }` (locked decision — not a typed name: delete is gated to
// future-PLANNED with a narrow blast radius, so typed-name friction buys
// nothing).
export const cycleLifecycleSchema = z.object({ confirm: z.literal(true) });

export type CycleLifecycleRequest = z.infer<typeof cycleLifecycleSchema>;

// ── Response contracts ──

// Progress is derived at read time, never stored (data-model D8):
// total/completed over non-archived issues of the cycle; percent null when
// total is 0. Blocked is never a predicate, so rule 11 holds structurally.
export const cycleProgressSchema = z.object({
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100).nullable(),
});

export type CycleProgress = z.infer<typeof cycleProgressSchema>;

// Card shape — what list/detail both render from. Progress ships inline so
// the list needs no second fetch (derived per data-model §6.7).
export const cycleCardSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  status: cycleStatusSchema,
  startDate: cycleDateSchema,
  endDate: cycleDateSchema,
  archivedAt: z.string().datetime().nullable(),
  progress: cycleProgressSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CycleCard = z.infer<typeof cycleCardSchema>;

// Detail = card + goal. Named alias so a future detail-only field doesn't
// ripple through list consumers.
export const cycleDetailSchema = cycleCardSchema.extend({
  goal: z.string().nullable(),
});

export type CycleDetail = z.infer<typeof cycleDetailSchema>;

// Delete response (api-design #10). Issues survive, unassigned in the same
// transaction — the client shows the count in the confirm dialog.
export const deleteCycleResponseSchema = z.object({
  deletedCycleId: z.string(),
  unassignedIssues: z.number().int().nonnegative(),
});

export type DeleteCycleResponse = z.infer<typeof deleteCycleResponseSchema>;
