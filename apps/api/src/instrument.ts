import { startTelemetry } from './common/telemetry/index.js';
import * as Sentry from '@sentry/node';
import { env } from './common/config/env.js';

/**
 * Telemetry preload. This file is loaded before any other application module —
 * via `--import` in the dev and start scripts (apps/api/package.json,
 * apps/api/scripts/start.sh) — because the SDKs must be initialised before
 * Express, pg and pino are loaded for their hooks to take effect.
 */

// Server telemetry (OpenTelemetry → Grafana Cloud): traces, metrics and the
// trace/span ids pino log lines carry. Stays off without an OTLP endpoint.
startTelemetry();

/**
 * Error monitoring (Sentry). Errors only: `tracesSampleRate` /
 * `tracesSampler` are deliberately absent. Setting either of them (even to 0)
 * turns tracing on.
 */
Sentry.init({
  dsn: env.SENTRY_API_DSN,
  environment: env.NODE_ENV,
  // The code version this event belongs to: Render injects the deploy's commit
  // SHA at runtime, and SENTRY_RELEASE overrides it on hosts that don't.
  release: env.SENTRY_RELEASE ?? process.env.RENDER_GIT_COMMIT,
  // No DSN (tests, fresh clones): the client is disabled — nothing is sent.
  enabled: env.SENTRY_API_DSN !== undefined,
  // Automatic collection only: no IP harvesting, no request/response bodies,
  // no bound SQL parameters — those carry the user's own content (issue text,
  // comments, email addresses). The parameterized query text still arrives,
  // and anything set explicitly with Sentry.setUser() is always sent.
  dataCollection: {
    userInfo: false,
    httpBodies: [],
    databaseQueryData: false,
  },
});
