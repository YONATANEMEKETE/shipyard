import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('resolveBaseURL', () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalEnv;
    }
    vi.resetModules();
  });

  it('targets the configured API origin in every environment', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';

    const { resolveBaseURL } = await import('@/lib/auth-client');

    expect(resolveBaseURL()).toBe('https://api.example.com/api/v1/auth');
  });

  it('falls back to the local dev API when unset', async () => {
    delete process.env.NEXT_PUBLIC_API_URL;

    const { resolveBaseURL } = await import('@/lib/auth-client');

    expect(resolveBaseURL()).toBe('http://localhost:4000/api/v1/auth');
  });

  it('ignores a trailing slash on the configured origin', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com/';

    const { resolveBaseURL } = await import('@/lib/auth-client');

    expect(resolveBaseURL()).toBe('https://api.example.com/api/v1/auth');
  });

  it('authClient is created with resolved baseURL', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:4000';

    const mod = await import('@/lib/auth-client');

    expect(mod.authClient).toBeDefined();
    expect(typeof mod.resolveBaseURL).toBe('function');
  });
});
