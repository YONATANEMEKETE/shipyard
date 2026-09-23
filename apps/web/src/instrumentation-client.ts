import { initAnalytics } from './lib/posthog';
import { initSentry } from './lib/sentry';

/**
 * Browser-side SDK initialisation. Next loads this file on the client before
 * the app renders (Next.js 15.3+ convention, replacing `sentry.client.config.ts`).
 *
 * Sentry starts first: anything thrown by the analytics initialiser is then
 * still reported. `initAnalytics` is awaited by nobody on purpose — it fetches
 * its SDK in a separate chunk so the first paint does not wait for it.
 */
initSentry();
void initAnalytics();
