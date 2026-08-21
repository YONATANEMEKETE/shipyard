import { prisma } from '../../src/common/db/client.js';

/**
 * Truncates every user table in the public schema. Called in beforeEach to
 * keep integration tests isolated. With no tables yet this is a no-op.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;

  if (tables.length === 0) {
    return;
  }

  const names = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

export async function disconnectDb(): Promise<void> {
  const { disconnectDb: close } = await import('../../src/common/db/client.js');
  await close();
}

export { prisma };
