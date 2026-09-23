import { initSentry } from './lib/sentry';

/**
 * Browser-side SDK initialisation. Next loads this file on the client before
 * the app renders (Next.js 15.3+ convention, replacing `sentry.client.config.ts`).
 */
initSentry();
