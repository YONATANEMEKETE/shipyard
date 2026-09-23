import {
  type AnalyticsEventName,
  type AnalyticsEventProperties,
  parseAnalyticsEvent,
} from '@shipyard/shared';
import { PostHog } from 'posthog-node';

import { env } from '../config/env.js';
import { logger } from '../logger/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Product analytics (PostHog) — the server reporter
//
// The single place the API emits product events. Each call sits where the write
// actually committed, next to the `logger.info` that already records the same
// business event — so an event exists exactly when the thing it describes
// exists, whichever door the request came through (the web UI or an agent).
//
// Event names and property shapes live in `@shipyard/shared` → `analytics/
// index.ts`, which the browser reporter imports too; nothing here invents one.
//
// Without a project token the reporter is a no-op: tests, local development and
// self-hosted deployments stay silent and phone-home-free — the same rule the
// Sentry initialiser and the browser reporter follow.
//
// Delivery is best-effort by design. `captureEvent` never throws into the
// request path: analytics must not be able to fail a write that succeeded.
// ─────────────────────────────────────────────────────────────────────────────

let client: PostHog | null = null;

if (env.POSTHOG_PROJECT_TOKEN) {
  client = new PostHog(env.POSTHOG_PROJECT_TOKEN, {
    host: env.POSTHOG_HOST,
    // Small batches. A workspace's events do not arrive in floods, and events
    // that sit in a buffer are events a crash can lose.
    flushAt: 10,
    flushInterval: 5000,
  });
}

/**
 * Reports one product event. `distinctId` — PostHog's person key — is the
 * acting user's id: never an email, never a name.
 *
 * Properties are validated against the shared contract first, so a typo or a
 * missing id surfaces as a log line naming the event rather than as a malformed
 * row in a dashboard.
 */
export function captureEvent<E extends AnalyticsEventName>(
  distinctId: string,
  event: E,
  properties: AnalyticsEventProperties<E>,
): void {
  if (!client) return;

  try {
    client.capture({
      distinctId,
      event,
      properties: parseAnalyticsEvent(event, properties),
    });
  } catch (error) {
    logger.warn({ err: error, event }, 'analytics.event_rejected');
  }
}

/**
 * Flushes what is buffered before the process exits — called from the shutdown
 * path beside the logger and Sentry flushes, so the last events of a run are
 * not the ones that get lost.
 */
export async function flushAnalytics(): Promise<void> {
  await client?.shutdown();
}
