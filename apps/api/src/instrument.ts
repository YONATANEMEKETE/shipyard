import * as Sentry from '@sentry/node';
import { env } from './common/config/env.js';

/**
 * Error monitoring (Sentry). This file is loaded before any other application
 * module — via `--import` in the dev and start scripts (apps/api/package.json,
 * apps/api/scripts/start.sh) — because the SDK must be initialised before
 * Express and pg are loaded for its hooks to take effect.
 *
 * Errors only: `tracesSampleRate` / `tracesSampler` are deliberately absent.
 * Setting either of them (even to 0) turns tracing on.
 */
Sentry.init({
  dsn: env.SENTRY_API_DSN,
  environment: env.NODE_ENV,
  // The code version this event belongs to: Render injects the deploy's commit
  // SHA at runtime, and SENTRY_RELEASE overrides it on hosts that don't.
  release: env.SENTRY_RELEASE ?? process.env.RENDER_GIT_COMMIT,
  // No DSN (tests, fresh clones): the client is disabled — nothing is sent.
  enabled: env.SENTRY_API_DSN !== undefined,
});
