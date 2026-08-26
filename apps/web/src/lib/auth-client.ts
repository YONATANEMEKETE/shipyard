import { createAuthClient } from 'better-auth/client';

import { env } from '@/lib/env';

/**
 * Better Auth vanilla client.
 *
 * Points at the Better Auth instance served by the Shipyard API under
 * /api/v1/auth (the API's auth.ts sets basePath to the same value). The
 * vanilla build is used instead of better-auth/react so it works in every
 * context — client components today, and the Next.js proxy (edge runtime)
 * for real session validation during route protection.
 */
export const authClient = createAuthClient({
  baseURL: `${env.apiUrl}/api/v1/auth`,
});
