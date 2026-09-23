import { initSentry } from './lib/sentry';

/**
 * Node-runtime SDK initialisation. Loaded by `instrumentation.ts` via the
 * `NEXT_RUNTIME === 'nodejs'` branch of `register()`.
 */
initSentry();
