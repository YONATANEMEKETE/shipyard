// ─────────────────────────────────────────────────────────────────────────────
// Browser analytics (PostHog)
//
// Started from `instrumentation-client.ts`. The SDK is imported dynamically:
// it is ~94 KB gzipped and has no business on the critical path of a landing
// page, so it arrives in its own chunk just after the app renders instead of
// holding up the first paint.
//
// Anything that calls into this module before the SDK is up — the identity
// island, for instance — is remembered and applied the moment it arrives, so
// arriving late cannot lose an identity or resurrect a signed-out one.
//
// This module deliberately exposes no `track()` for our product events. Every
// event in the contract (`@shipyard/shared` → `analytics/index.ts`) fires
// server-side, where the write actually happened and where a closed tab cannot
// lose it. The browser's job is the layer only it can see — pageviews,
// autocapture, Web Vitals — and PostHog's own SDK emits those. A UI-only event
// would be the reason to add one here.
//
// Without a project token nothing starts: local development, tests and
// self-hosted deployments stay silent and phone-home-free, the same rule the
// Sentry initialiser follows.
// ─────────────────────────────────────────────────────────────────────────────

type PostHogSdk = (typeof import('posthog-js'))['default'];
type PendingIdentity = { kind: 'identify'; userId: string } | { kind: 'reset' };

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

let posthog: PostHogSdk | null = null;
let pending: PendingIdentity | null = null;

export async function initAnalytics(): Promise<void> {
  if (!projectToken || posthog) return;

  const { default: sdk } = await import('posthog-js');

  sdk.init(projectToken, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    // Their dated defaults preset. The explicit entries below are the ones we
    // depend on, so they do not ride on the preset's contents.
    defaults: '2026-05-30',
    // App Router navigations count too, not just hard page loads.
    capture_pageview: 'history_change',
    // Web Vitals (LCP, INP, CLS, FCP) — what the Web Analytics page graphs.
    capture_performance: true,
    // The DOM here is issue titles and comments. Autocapture keeps the shape of
    // an interaction — what was clicked, where — but never its text, so the
    // no-personal-data rule holds for the one channel we do not author.
    mask_all_text: true,
    // Visitors stay anonymous until they sign in; a person profile is created
    // only by `identify`, which the identity island calls.
    person_profiles: 'identified_only',
  });

  posthog = sdk;

  // Whatever happened while the SDK was loading — last one wins, which is
  // exactly the session's current state.
  if (pending?.kind === 'identify') sdk.identify(pending.userId);
  if (pending?.kind === 'reset') sdk.reset();
  pending = null;
}

/**
 * Ties this browser to the signed-in person. The id is the Shipyard user id —
 * never an email or a name.
 */
export function identifyAnalyticsUser(userId: string): void {
  if (!posthog) {
    pending = { kind: 'identify', userId };
    return;
  }

  posthog.identify(userId);
}

/**
 * On sign-out: forget the person, so the next visitor on this browser is not
 * merged into the previous one's history.
 */
export function resetAnalytics(): void {
  if (!posthog) {
    pending = { kind: 'reset' };
    return;
  }

  posthog.reset();
}
