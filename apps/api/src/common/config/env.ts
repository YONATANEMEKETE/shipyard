import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { envSchema, type Env } from './envSchema.js';

// Load apps/api/.env first, then fall back to the repo-root .env for gaps.
// Existing values are never overridden, so the app-local file wins.
loadEnv({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});
loadEnv({
  path: fileURLToPath(new URL('../../../../../.env', import.meta.url)),
  quiet: true,
});

const parsed = envSchema.safeParse({
  // Test-only fallbacks: integration tests inject an in-memory fake R2
  // adapter, so real credentials are never needed under NODE_ENV=test.
  // Vitest sets NODE_ENV=test; real env values still win when present.
  ...(process.env.NODE_ENV === 'test'
    ? {
        R2_ENDPOINT: 'http://localhost:9000',
        R2_PUBLIC_BUCKET: 'shipyard-test-bucket',
        R2_ACCESS_KEY_ID: 'test-access-key',
        R2_SECRET_ACCESS_KEY: 'test-secret-key',
        R2_PUBLIC_BASE_URL: 'http://localhost:9000/shipyard-test-bucket',
      }
    : {}),
  ...process.env,
});

if (!parsed.success) {
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  throw new Error(
    'Failed to load environment configuration. Check your .env file.',
  );
}

export const env: Readonly<Env> = Object.freeze(parsed.data);
