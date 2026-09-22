import { env } from './env.js';

/**
 * Every browser origin allowed to make cross-origin calls to the API.
 *
 * One list, two consumers that must never drift:
 *   - the CORS middleware (`common/middlewares/cors.ts`) decides which
 *     origins get Access-Control headers;
 *   - Better Auth's `trustedOrigins` validates the Origin header on
 *     state-changing auth requests (its CSRF guard).
 *
 * The web app calls the API from its own origin (`WEB_URL`). Additional
 * origins — Vercel preview deployments, temporary hosts — come from
 * `EXTRA_TRUSTED_ORIGINS`.
 */
export const trustedOrigins: readonly string[] = [
  env.WEB_URL,
  ...env.EXTRA_TRUSTED_ORIGINS,
];
