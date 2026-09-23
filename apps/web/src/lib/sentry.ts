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
    // The code version this event belongs to. Must be the exact value the
    // build tagged the uploaded source maps with (next.config.ts) — otherwise
    // the maps are filed under a release no event refers to and production
    // stack traces stay minified.
    release:
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA,
    // Automatic collection only: no user identity, no cookies, no request or
    // response bodies. What this app renders is the user's own content and
    // none of it needs to leave the browser.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
    },
    // Genuine browser noise, and nothing else — a pattern earns a line here
    // only after it shows up in the issue list as recurring junk. Chunk-load
    // errors are deliberately absent: they are the signal that a deploy and
    // the served bundles disagree, which is worth knowing about.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications.',
    ],
  });
}
