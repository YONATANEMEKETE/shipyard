import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('resolveBaseURL', () => {
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  const originalEnv = process.env.API_URL;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    if (originalWindow === undefined) {
      delete (globalThis as unknown as Record<string, unknown>).window;
    } else {
      (globalThis as unknown as Record<string, unknown>).window =
        originalWindow;
    }
    if (originalEnv === undefined) {
      delete process.env.API_URL;
    } else {
      process.env.API_URL = originalEnv;
    }
  });

  it('returns window origin in browser', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://web.example.com' },
    } as unknown as Window & typeof globalThis);

    const { resolveBaseURL } = await import('@/lib/auth-client');

    expect(resolveBaseURL()).toBe('https://web.example.com/api/v1/auth');
  });

  it('returns API_URL env on server when set', async () => {
    // Ensure window undefined (server)
    delete (globalThis as unknown as Record<string, unknown>).window;
    process.env.API_URL = 'https://api.example.com';

    const { resolveBaseURL } = await import('@/lib/auth-client');

    expect(resolveBaseURL()).toBe('https://api.example.com/api/v1/auth');
  });

  it('falls back to localhost when no window and no env', async () => {
    delete (globalThis as unknown as Record<string, unknown>).window;
    delete process.env.API_URL;

    const { resolveBaseURL } = await import('@/lib/auth-client');

    expect(resolveBaseURL()).toBe('http://localhost:4000/api/v1/auth');
  });

  it('authClient is created with resolved baseURL', async () => {
    // Verify module loads without throwing and exports authClient
    delete (globalThis as unknown as Record<string, unknown>).window;
    process.env.API_URL = 'http://localhost:4000';

    const mod = await import('@/lib/auth-client');
    expect(mod.authClient).toBeDefined();
    expect(typeof mod.resolveBaseURL).toBe('function');
  });
});
