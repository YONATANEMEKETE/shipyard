import { describe, it, expect } from 'vitest';
import { envSchema } from '../../src/common/config/envSchema.js';

function validEnv(): Record<string, string> {
  return {
    API_URL: 'http://localhost:4000',
    WEB_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://shipyard:shipyard@localhost:5433/shipyard',
    BETTER_AUTH_SECRET: 'a-very-long-secret-with-at-least-32-chars',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GITHUB_CLIENT_ID: 'github-client-id',
    GITHUB_CLIENT_SECRET: 'github-client-secret',
    RESEND_API_KEY: 'resend-api-key',
    EMAIL_FROM: 'Shipyard <noreply@example.com>',
  };
}

describe('envSchema (startup validation)', () => {
  it('parses a complete valid config', () => {
    const result = envSchema.safeParse(validEnv());
    expect(result.success).toBe(true);
  });

  it('applies defaults for optional fields', () => {
    const result = envSchema.safeParse(validEnv());
    if (!result.success) throw new Error('should succeed');
    expect(result.data.NODE_ENV).toBe('development');
    expect(result.data.API_PORT).toBe(4000);
    expect(result.data.LOG_LEVEL).toBe('info');
  });

  it('rejects a missing required API_URL', () => {
    const env = validEnv();
    delete env.API_URL;
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid API_URL', () => {
    const result = envSchema.safeParse({ ...validEnv(), API_URL: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid DATABASE_URL', () => {
    const result = envSchema.safeParse({
      ...validEnv(),
      DATABASE_URL: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a BETTER_AUTH_SECRET shorter than 32 chars', () => {
    const result = envSchema.safeParse({
      ...validEnv(),
      BETTER_AUTH_SECRET: 'too-short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-range API_PORT', () => {
    const result = envSchema.safeParse({ ...validEnv(), API_PORT: '99999' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid NODE_ENV', () => {
    const result = envSchema.safeParse({ ...validEnv(), NODE_ENV: 'staging' });
    expect(result.success).toBe(false);
  });
});
