import { createAuthClient } from 'better-auth/client';

/**
 * Better Auth vanilla client.
 *
 * In the browser it targets the same origin (`/api/v1/auth`), which Next.js
 * rewrites to the internal-only API server — that keeps session cookies
 * first-party and avoids any CORS surface. Outside the browser (the Next.js
 * proxy validating sessions), it calls the API server directly.
 */
export function resolveBaseURL(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/v1/auth`;
  }
  const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
  return `${apiUrl}/api/v1/auth`;
}

export const authClient = createAuthClient({
  baseURL: resolveBaseURL(),
});
