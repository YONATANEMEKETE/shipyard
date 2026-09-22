import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The allowlist is derived once at module load from the parsed env, so these
 * tests re-import the config modules with `vi.resetModules()` after setting
 * `process.env` — the same mechanism a fresh process boot would use.
 */
describe('trustedOrigins', () => {
  const original = process.env.EXTRA_TRUSTED_ORIGINS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.EXTRA_TRUSTED_ORIGINS;
    } else {
      process.env.EXTRA_TRUSTED_ORIGINS = original;
    }
    vi.resetModules();
  });

  it('always includes WEB_URL', async () => {
    vi.resetModules();
    const { trustedOrigins } =
      await import('../../src/common/config/trustedOrigins.js');
    const { env } = await import('../../src/common/config/env.js');

    expect(trustedOrigins[0]).toBe(env.WEB_URL);
  });

  it('appends EXTRA_TRUSTED_ORIGINS entries after WEB_URL', async () => {
    process.env.EXTRA_TRUSTED_ORIGINS =
      'https://shipyard-git-preview.vercel.app, https://preview-2.example.com';
    vi.resetModules();
    const { trustedOrigins } =
      await import('../../src/common/config/trustedOrigins.js');
    const { env } = await import('../../src/common/config/env.js');

    expect(trustedOrigins).toEqual([
      env.WEB_URL,
      'https://shipyard-git-preview.vercel.app',
      'https://preview-2.example.com',
    ]);
  });
});
