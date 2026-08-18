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

const parsed = envSchema.safeParse(process.env);

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
