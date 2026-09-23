import * as Sentry from '@sentry/nextjs';

/**
 * Next's instrumentation hook. `register()` runs once per runtime at boot and
 * loads the matching SDK config; `onRequestError` reports the server-side
 * errors Next already knows about — Server Components, route handlers, the
 * proxy (middleware) and Server Actions. The browser reports itself through
 * `instrumentation-client.ts`, and error boundaries add their throws on top.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
