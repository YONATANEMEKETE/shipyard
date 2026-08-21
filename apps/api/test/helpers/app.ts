import supertest from 'supertest';
import { createApp } from '../../src/app.js';

/**
 * Builds a fresh Express app (fresh rate-limit stores, etc.) and returns a
 * supertest agent bound to it. Readiness is enabled so /readyz responds.
 */
export function createTestApp() {
  const app = createApp({ ready: true });
  return supertest(app);
}
