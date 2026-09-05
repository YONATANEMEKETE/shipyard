import { prisma } from '../../common/db/client.js';
import type { Prisma } from '../../generated/client.js';

/**
 * Settings repository — Prisma access only. No business decisions live here.
 *
 * Deliberately narrow writes into Better Auth's `user` table (F11's only
 * hand-edit of auth-owned data): `name` and `image` — never email, password,
 * sessions, or accounts (rule 4; the .strict() profile schema is the
 * structural firewall). Everything else reads/writes the settings-owned
 * `user_preference` table. Every operation is single-row, single-statement,
 * self-scoped by the caller passing `userId` explicitly (session-only guard
 * chain — no workspace context exists on any settings route).
 */

export type DbClient = Prisma.TransactionClient | typeof prisma;

/** Card projection — the only user columns settings ever reads or writes. */
const userCardSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  emailVerified: true,
} satisfies Prisma.UserSelect;

export type SettingsUserRow = Prisma.UserGetPayload<{
  select: typeof userCardSelect;
}>;

export const settingsRepository = {
  getUser(client: DbClient, userId: string): Promise<SettingsUserRow | null> {
    return client.user.findUnique({
      where: { id: userId },
      select: userCardSelect,
    });
  },

  updateName(
    client: DbClient,
    userId: string,
    name: string,
  ): Promise<SettingsUserRow> {
    return client.user.update({
      where: { id: userId },
      data: { name },
      select: userCardSelect,
    });
  },

  /** `image` carries the R2 object key (or null) — never a URL (data-model D8). */
  updateImage(
    client: DbClient,
    userId: string,
    image: string | null,
  ): Promise<SettingsUserRow> {
    return client.user.update({
      where: { id: userId },
      data: { image },
      select: userCardSelect,
    });
  },

  getPreference(client: DbClient, userId: string) {
    return client.userPreference.findUnique({
      where: { userId },
      select: { theme: true },
    });
  },

  /** Lazy row creation — the only preference write (no backfill anywhere, D6). */
  upsertPreference(
    client: DbClient,
    userId: string,
    theme: 'LIGHT' | 'DARK' | 'SYSTEM',
  ) {
    return client.userPreference.upsert({
      where: { userId },
      create: { userId, theme },
      update: { theme },
      select: { theme: true },
    });
  },
};
