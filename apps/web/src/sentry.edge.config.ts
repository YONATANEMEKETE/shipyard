import { initSentry } from './lib/sentry';

/**
 * Edge-runtime SDK initialisation. Loaded by `instrumentation.ts` via the
 * `NEXT_RUNTIME === 'edge'` branch of `register()`.
 */
initSentry();
