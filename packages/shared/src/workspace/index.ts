import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Workspace contracts
//
// Owned by the workspace module (F2). Consumed by both the API (server-side
// validation, response shapes) and the web app (forms, mutations, render map).
// Mirrors the Prisma enums in apps/api/prisma/schema.prisma (data-model.md §2)
// and the WORKSPACE_ICON_KEYS allow-list (data-model.md §3 D4).
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums (mirror Prisma) ──

export const workspaceStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

export type WorkspaceStatus = z.infer<typeof workspaceStatusSchema>;

// F2 writes only OWNER; F3 widens the enum in place (ADMIN, MEMBER).
export const workspaceRoleSchema = z.enum(['OWNER']);

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

// ── Icon keys (D4: preset Lucide keys, no uploads) ──

// Canonical allow-list: the API rejects any icon outside this set and the web
// builds its IconPair (key → LucideIcon) render map from it, so both resolve
// identically. Keys are kebab-case, ≤32 chars, additive-only.
export const WORKSPACE_ICON_KEYS = [
  'rocket',
  'boxes',
  'layout-dashboard',
  'ship-wheel',
  'globe',
  'telescope',
  'target',
  'zap',
  'layers',
  'folder',
  'star',
  'shield',
  'anchor',
  'cpu',
  'briefcase',
  'sailboat',
  'ship',
  'hard-hat',
  'building-2',
  'package',
  'compass',
  'flag',
] as const;

export const iconSchema = z.enum(WORKSPACE_ICON_KEYS);

export type WorkspaceIconKey = z.infer<typeof iconSchema>;

// Trimmed to match VarChar(80); names may duplicate (never identifiers).
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Workspace name is required')
  .max(80, 'Workspace name must be 80 characters or fewer');

// ── Request contracts ──

export const createWorkspaceSchema = z.object({
  name: nameSchema,
  icon: iconSchema.optional(),
});

export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceSchema>;

// At least one of { name, icon } required — a no-op patch is rejected.
export const updateWorkspaceSchema = z
  .object({
    name: nameSchema.optional(),
    icon: iconSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.icon !== undefined, {
    message: 'At least one of name or icon is required',
    path: ['$root'],
  });

export type UpdateWorkspaceRequest = z.infer<typeof updateWorkspaceSchema>;

// Archive/restore are confirmed actions: the server rejects a missing literal
// confirmation flag with CONFIRMATION_REQUIRED (api-design.md §5).
export const confirmActionSchema = z.object({ confirm: z.literal(true) });

export type ConfirmActionRequest = z.infer<typeof confirmActionSchema>;

// Exact-name typed confirmation (spec rule 7); trimmed for comparison.
export const deleteWorkspaceSchema = z.object({
  confirmName: z
    .string()
    .trim()
    .min(1, 'Type the workspace name to confirm deletion'),
});

export type DeleteWorkspaceRequest = z.infer<typeof deleteWorkspaceSchema>;

// ── Response contracts ──

export const workspaceCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  status: workspaceStatusSchema,
  role: workspaceRoleSchema,
  memberCount: z.number().int(),
});

export type WorkspaceCard = z.infer<typeof workspaceCardSchema>;

export const workspaceDetailSchema = workspaceCardSchema.extend({
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
});

export type WorkspaceDetail = z.infer<typeof workspaceDetailSchema>;
