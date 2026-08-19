import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

const dir = path.dirname(fileURLToPath(import.meta.url));

// Load apps/api/.env first, then the repo-root .env for gaps (same rules as
// src/common/config/env.ts so the CLI sees the same DATABASE_URL as the app).
// App-local values win; the merged result feeds the datasource below.
const appEnv =
  loadEnv({ path: path.join(dir, '.env'), quiet: true }).parsed ?? {};
const rootEnv =
  loadEnv({ path: path.join(dir, '../../.env'), quiet: true }).parsed ?? {};
const env = { ...rootEnv, ...appEnv };

export default defineConfig({
  schema: path.join(dir, 'prisma', 'schema.prisma'),
  datasource: {
    url: env.DATABASE_URL,
  },
});
