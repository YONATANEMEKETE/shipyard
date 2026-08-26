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
    RESEND_API_KEY: 're_test_api_key',
  };
}

describe('envSchema (startup validation)', () => {
  it('parses a complete valid config', () => {
    const result = envSchema.safeParse(validEnv());
    expect(result.success).toBe(true);
  });

  it.each([
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'RESEND_API_KEY',
  ])('rejects a missing %s', (key) => {
    const env = validEnv();
    delete env[key];
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it.each([
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'RESEND_API_KEY',
  ])('rejects an empty %s', (key) => {
    const result = envSchema.safeParse({ ...validEnv(), [key]: '' });
    expect(result.success).toBe(false);
  });

  it('keeps the provided RESEND_API_KEY value', () => {
    const result = envSchema.safeParse(validEnv());
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('should succeed');
    expect(result.data.RESEND_API_KEY).toBe('re_test_api_key');
  });

  it('applies the RESEND_FROM default when not provided', () => {
    const result = envSchema.safeParse(validEnv());
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('should succeed');
    expect(result.data.RESEND_FROM).toBe('Shipyard <no-reply@yonatanem.com>');
  });

  it('applies defaults for optional fields', () => {
    const result = envSchema.safeParse(validEnv());
    if (!result.success) throw new Error('should succeed');
    expect(result.data.NODE_ENV).toBe('development');
    expect(result.data.API_PORT).toBe(4000);
    expect(result.data.LOG_LEVEL).toBe('info');
  });

  it('applies the API_URL default when not provided', () => {
    const env = validEnv();
    delete env.API_URL;
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('should succeed');
    expect(result.data.API_URL).toBe('http://localhost:4000');
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
