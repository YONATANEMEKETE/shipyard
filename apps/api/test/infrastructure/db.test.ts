import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../helpers/db.js';

describe('test database infrastructure', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('connects to the testcontainer database', async () => {
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(result[0]?.ok).toBe(1);
  });

  it('resetDatabase is idempotent', async () => {
    await expect(resetDatabase()).resolves.toBeUndefined();
  });
});
