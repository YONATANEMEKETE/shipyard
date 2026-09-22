import { createAuthClient } from 'better-auth/client';

/**
 * Better Auth vanilla client.
 *
 * Both the browser and the Next.js middleware (validating sessions) call the
 * API on its own origin — same-site with the web app, but cross-origin, so
 * every request carries credentials. `NEXT_PUBLIC_API_URL` is inlined at
 * build time; the fallback matches the local dev API.
 */
const API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
).replace(/\/+$/, '');

export function resolveBaseURL(): string {
  return `${API_ORIGIN}/api/v1/auth`;
}

export const authClient = createAuthClient({
  baseURL: resolveBaseURL(),
});
