import { env } from '../config/env.js';

// ─────────────────────────────────────────────────────────────────────────────
// Image URL resolution (settings F11, data-model §2.2 — key storage).
//
// `user.image` holds the R2 object KEY for uploaded avatars
// (`avatars/:userId/:uuid.ext`) but ABSOLUTE URLs for OAuth-supplied images
// (Google/GitHub hand us full https URLs — those are stored verbatim, F1
// precedent). Cards across every module (members, comments, issues,
// notifications, activity, projects, dashboard, settings) resolve at read
// time, so the browser always receives a renderable absolute URL and web
// contracts stay `image: string` untouched.
//
// The payoff: swapping the r2.dev development URL for a custom domain is an
// env change (R2_PUBLIC_BASE_URL) — never a data migration.
// ─────────────────────────────────────────────────────────────────────────────

export function resolveImageUrl(image: string | null): string | null {
  if (!image) return null;
  if (/^https?:\/\//.test(image)) return image;
  return `${env.R2_PUBLIC_BASE_URL}/${image}`;
}
