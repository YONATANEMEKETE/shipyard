import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const execAsync = promisify(exec);

let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;

async function applySchema(databaseUrl: string): Promise<void> {
  // Migrations are the source of truth since the first auth migration.
  // prisma.config.ts honors the explicit DATABASE_URL env override below.
  // cwd is the api package root (parent of test/), where prisma.config.ts lives.
  const apiRoot = fileURLToPath(new URL('..', import.meta.url));
  await execAsync('pnpm exec prisma migrate deploy', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('shipyard_test')
    .withUsername('shipyard')
    .withPassword('shipyard')
    .start();

  const databaseUrl = container.getConnectionUri();
  // Propagate to forked test processes; app env.ts honors the existing value.
  process.env.DATABASE_URL = databaseUrl;

  await applySchema(databaseUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
