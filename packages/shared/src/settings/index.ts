import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Settings contracts
//
// Owned by the settings module (F11). Consumed by both the API (server-side
// validation, response shapes) and the web app (account/appearance forms,
// avatar picker gates, theme application).
// Mirrors the Prisma enums in apps/api/prisma/schema.prisma (data-model.md §2).
//
// Scope discipline baked into the shapes: profile is account-wide (no
// workspace anywhere), email is read-only here — Auth owns identity writes
// (rule 4, proven structurally by updateProfileSchema being .strict()), and
// view-preference toggles stay in their projects/issues homes (re-exported
// below for the settings shell's convenience only).
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums (mirror Prisma) ──

// Account-wide theme. Absent user_preference row reads as SYSTEM (D6) —
// default is applied at read time, never seeded. SYSTEM itself is resolved
// client-side (OS preference); the server only stores the choice.
export const themePreferenceSchema = z.enum(['LIGHT', 'DARK', 'SYSTEM']);

export type ThemePreference = z.infer<typeof themePreferenceSchema>;

// ── Canonical bounds ──

// Display name bound — first bound ever set on user.name (F1 left it to
// Better Auth). Trimmed server-side; empty-after-trim rejected (nameless
// accounts break mention rendering, D7). Product-facing messages: never leak
// Zod's "String must..." internals.
export const displayNameSchema = z
  .string({ message: 'Enter a display name' })
  .trim()
  .min(1, 'Enter a display name')
  .max(100, 'Keep the display name under 100 characters');

export type DisplayName = z.infer<typeof displayNameSchema>;

// Avatar allowlist — MIME types sniffed server-side, extension must match
// (D3). No GIF (animated-avatar scope rejected for MVP); no server-side
// processing (crop/resize/re-encode) — CSS frames the presentation.
export const avatarMimeAllowlist = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AvatarMime = (typeof avatarMimeAllowlist)[number];

// 2MB cap, enforced before buffering server-side; the web picker mirrors it
// client-side so oversized files die before any network cost.
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

// Multipart field name for the upload (api-design §1 — single `avatar` file
// field). Shared so client FormData and server parsing can never drift.
export const AVATAR_FILE_FIELD = 'avatar';

// ── Request contracts ──

// Profile rename. .strict() is the email firewall (D5): an `email` key (or
// any other key) is a 400 VALIDATION_ERROR, never a silent strip — the
// test-observable proof of rule 4.
export const updateProfileSchema = z
  .object({
    name: displayNameSchema,
  })
  .strict();

export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;

// Theme setter — the only appearance write. Upsert creates the
// user_preference row lazily on first set (no backfill, D6).
export const setAppearanceSchema = z.object({
  theme: themePreferenceSchema,
});

export type SetAppearanceRequest = z.infer<typeof setAppearanceSchema>;

// Literal confirm gate for clearing the avatar (api-design §2.1 #6) — same
// delete discipline as archive/restore in projects (confirmProjectLifecycleSchema).
export const clearAvatarSchema = z.object({
  confirm: z.literal(true),
});

export type ClearAvatarRequest = z.infer<typeof clearAvatarSchema>;

// ── Response contracts ──

// Profile card — what GET/PATCH profile and the app shell render from.
// email is echoed read-only (Auth owns writes, rule 4); emailVerified drives
// the verification badge; image is the public R2 URL or null (initials
// fallback client-side).
export const profileCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  image: z.string().nullable(),
  emailVerified: z.boolean(),
});

export type ProfileCard = z.infer<typeof profileCardSchema>;

// Appearance read — SYSTEM when no row exists yet (read-time default, D6).
export const appearanceSchema = z.object({
  theme: themePreferenceSchema,
});

export type Appearance = z.infer<typeof appearanceSchema>;

// Avatar upload response — the freshly persisted public URL (201).
export const avatarCardSchema = z.object({
  image: z.string(),
});

export type AvatarCard = z.infer<typeof avatarCardSchema>;

// ── Re-exports (convenience only — F4/F5 own these) ──

// The settings shell renders view toggles via the existing F4 endpoints
// (GET/PUT /workspaces/:slug/view-preferences/:scope); nothing here adds a
// scope, shape, or default (data-model §6.4).
export {
  viewScopeSchema,
  viewTypeSchema,
  setViewPreferenceSchema,
  viewPreferenceSchema,
} from '../projects/index.js';

export type {
  ViewScope,
  ViewType,
  SetViewPreferenceRequest,
  ViewPreference,
} from '../projects/index.js';
