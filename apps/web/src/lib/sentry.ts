import * as Sentry from '@sentry/nextjs';

/**
 * Error reporting (Sentry), shared by all three runtimes.
 *
 * `instrumentation-client.ts` (browser), `sentry.server.config.ts` (Node) and
 * `sentry.edge.config.ts` (edge) each call this, so the options live in one
 * place. The DSN must be a `NEXT_PUBLIC_` variable: Next inlines only that
 * prefix into the browser bundle, and a DSN is write-only — it can submit
 * events, never read anything back — so it is safe to ship.
 *
 * Errors only: no `tracesSampleRate`/`tracesSampler`. Setting either of them
 * (even to 0) turns tracing on.
 */
export function initSentry(): void {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // No DSN (local dev, previews without the variable): the client is
    // disabled and nothing is sent.
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    // Vercel reports production | preview | development; anywhere else the
    // Node convention applies.
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
