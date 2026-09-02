import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Projects contracts
//
// Owned by the projects module (F4). Consumed by both the API (server-side
// validation, response shapes) and the web app (forms, mutations, render map).
// Mirrors the Prisma enums in apps/api/prisma/schema.prisma (data-model.md §2)
// and the endpoint contracts (api-design.md §5).
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums (mirror Prisma) ──

// Operational status — only PLANNED | ACTIVE | COMPLETED. ARCHIVED is a separate
// dimension (project.archivedAt), NOT an enum value (data-model D1).
export const projectStatusSchema = z.enum(['PLANNED', 'ACTIVE', 'COMPLETED']);

export type ProjectStatus = z.infer<typeof projectStatusSchema>;

// Generic per-user-per-workspace view preference, shared with Issues (F5).
// PROJECT ships here; F5 widens this string with 'ISSUE' (additive enum widen).
export const viewScopeSchema = z.enum(['PROJECT']);

export type ViewScope = z.infer<typeof viewScopeSchema>;

// Presentation choice, stored per scope; LIST is the absent-row default (rule 12).
export const viewTypeSchema = z.enum(['LIST', 'KANBAN']);

export type ViewType = z.infer<typeof viewTypeSchema>;

// Canonical name bound — matches Prisma VarChar(120); trimmed server-side.
// Product-facing messages: never leak Zod's "String must..." internals.
export const projectNameSchema = z
  .string({ message: 'Give your project a name' })
  .trim()
  .min(1, 'Give your project a name')
  .max(120, 'Keep the project name under 120 characters');

export type ProjectName = z.infer<typeof projectNameSchema>;

// Day-precision dates travel as YYYY-MM-DD strings end-to-end (data-model D4,
// @db.Date). A regex is the canonical shape; the API coerces to a Date.
export const projectDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date — YYYY-MM-DD');

// ── Request contracts ──

export const createProjectSchema = z.object({
  name: projectNameSchema,
  description: z
    .string()
    .max(10000, 'Description must be 10,000 characters or less')
    .optional(),
  startDate: projectDateSchema.optional(),
  targetDate: projectDateSchema.optional(),
  // Optional — the column the project is created in. Omitted → defaults to
  // ACTIVE server-side (spec §3.1). Not a form field; threaded through so the
  // board + button can create directly into a status column.
  status: projectStatusSchema.optional(),
});

export type CreateProjectRequest = z.infer<typeof createProjectSchema>;

// Nullable optional fields mean "explicitly unset"; omitted means "leave as is".
export const updateProjectSchema = z.object({
  name: projectNameSchema.optional(),
  description: z
    .string()
    .max(10000, 'Description must be 10,000 characters or less')
    .nullable()
    .optional(),
  status: projectStatusSchema.optional(),
  startDate: projectDateSchema.nullable().optional(),
  targetDate: projectDateSchema.nullable().optional(),
});

export type UpdateProjectRequest = z.infer<typeof updateProjectSchema>;

// Ownership transfer targets a workspace *membership* row id (F3 convention).
export const transferProjectOwnerSchema = z.object({
  targetMemberId: z.string().cuid(),
});

export type TransferProjectOwnerRequest = z.infer<
  typeof transferProjectOwnerSchema
>;

// Set the viewer's presentation choice for a scope (Projects now; Issues in F5).
export const setViewPreferenceSchema = z.object({
  scope: viewScopeSchema,
  view: viewTypeSchema,
});

export type SetViewPreferenceRequest = z.infer<typeof setViewPreferenceSchema>;

// Literal confirm gate for archive/restore.
export const confirmProjectLifecycleSchema = z.object({
  confirm: z.literal(true),
});

export type ConfirmProjectLifecycleRequest = z.infer<
  typeof confirmProjectLifecycleSchema
>;

// Typed-name confirmation for permanent delete (spec §3.2, api-design #8).
export const deleteProjectSchema = z.object({
  confirmName: z
    .string()
    .trim()
    .min(1, 'Type the project name to confirm')
    .max(120, 'Keep the project name under 120 characters'),
});

export type DeleteProjectRequest = z.infer<typeof deleteProjectSchema>;

// ── Response contracts ──

// The Project Owner expressed as a membership card. memberId is the workspace
// membership row id (joined from ownerId → user.id); ownership grants no
// permissions (spec rule 3), so this is display only.
export const projectOwnerCardSchema = z.object({
  memberId: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string().email(),
  image: z.string().nullable(),
});

export type ProjectOwnerCard = z.infer<typeof projectOwnerCardSchema>;

// Card shape — what list/board/detail all render from. Dates are strings.
// Description ships on the list payload too (board cards render it), so
// card ≈ detail today; detail stays a named schema for future growth.
export const projectCardSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  status: projectStatusSchema,
  owner: projectOwnerCardSchema,
  description: z.string().nullable(),
  startDate: projectDateSchema.nullable(),
  targetDate: projectDateSchema.nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ProjectCard = z.infer<typeof projectCardSchema>;

// Detail = card today (description already ships on the card). Named alias so
// a future detail-only field doesn't ripple through list consumers.
export const projectDetailSchema = projectCardSchema;

export type ProjectDetail = z.infer<typeof projectDetailSchema>;

// View-preference response for GET/PUT #9/#10 (api-design §5.2).
export const viewPreferenceSchema = z.object({
  view: viewTypeSchema,
});

export type ViewPreference = z.infer<typeof viewPreferenceSchema>;

// Delete response (api-design #8). unassignedIssues is 0 until F5 wires the
// issue unassign leg; the client shows it in the confirm warning.
export const deleteProjectResponseSchema = z.object({
  deletedProjectId: z.string(),
  unassignedIssues: z.number().int().nonnegative(),
});

export type DeleteProjectResponse = z.infer<typeof deleteProjectResponseSchema>;
