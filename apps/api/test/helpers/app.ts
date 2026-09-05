import supertest from 'supertest';
import { createApp, type CreateAppOptions } from '../../src/app.js';
import { InMemoryAvatarStorage } from '../../src/features/settings/r2.js';

/**
 * Shared in-memory avatar storage for tests (settings F11, data-model §8):
 * every test app injects it unless explicitly overridden, so no test ever
 * touches real R2. Tests that exercise avatars clear/inspect it per-test.
 */
export const testAvatarStorage = new InMemoryAvatarStorage();

/**
 * Builds a fresh Express app (fresh rate-limit stores, etc.) and returns a
 * supertest agent bound to it. Readiness is enabled so /readyz responds.
 */
export function createTestApp(options: CreateAppOptions = {}) {
  const app = createApp({
    ready: true,
    avatarStorage: testAvatarStorage,
    ...options,
  });
  return supertest(app);
}
