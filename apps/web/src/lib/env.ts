/**
 * Public (browser-safe) environment values.
 *
 * NEXT_PUBLIC_* vars are inlined at build time by Next.js; the fallback
 * keeps local dev working without an .env file.
 */
export const env = {
  /** Base URL of the Shipyard API server (no trailing slash). */
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
} as const;
