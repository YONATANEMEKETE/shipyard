import type {
  Appearance,
  AvatarCard,
  ProfileCard,
  SetAppearanceRequest,
} from '@shipyard/shared';
import { logger } from '../../common/logger/index.js';
import { prisma } from '../../common/db/client.js';
import { resolveImageUrl } from '../../common/storage/imageUrl.js';
import { UnauthorizedError } from '../../common/errors/httpErrors.js';
import { InternalServerError } from '../../common/errors/httpErrors.js';
import { ConfirmationRequiredError } from '../workspace/errors.js';
import {
  buildAvatarKey,
  getAvatarStorage,
  AVATAR_CACHE_CONTROL,
} from './r2.js';
import { settingsRepository, type SettingsUserRow } from './repository.js';

/**
 * Settings service — profile/appearance/avatar flows over self-owned rows
 * (api-design §5.1, data-model §6).
 *
 * Cross-module posture (all negative — the design, reviewable by absence):
 * no imports from Auth internals (narrow repository writes only), no calls
 * into Workspace/Members/Projects/Issues services, no new view-preference
 * code, and no workspace context anywhere — the session user *is* the scope.
 *
 * There is no module errors.ts by design: settings defines zero domain error
 * codes (§7) — validation is Zod at the route boundary, confirmation reuses
 * the workspace module's CONFIRMATION_REQUIRED, and R2 outages surface as
 * 500 via the global handler (storage is the operation, never hygiene).
 */

function toProfileCard(row: SettingsUserRow): ProfileCard {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: resolveImageUrl(row.image),
    emailVerified: row.emailVerified,
  };
}

function requireUser(userId: string): Promise<SettingsUserRow> {
  return settingsRepository.getUser(prisma, userId).then((row) => {
    // The user row always exists under a valid session (F1 invariant) — this
    // branch is defensive only, never a 404 axis (#1/#3, api-design §3).
    if (!row) throw new UnauthorizedError();
    return row;
  });
}

/** Best-effort object cleanup — R2 failure never fails the request (D4). */
async function deleteAvatarObject(key: string): Promise<void> {
  try {
    await getAvatarStorage().delete(key);
  } catch (error) {
    logger.warn(
      { err: error, key },
      '[settings] Avatar cleanup failed — object left orphaned (inert)',
    );
  }
}

export const settingsService = {
  // ── Profile ──────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<ProfileCard> {
    return toProfileCard(await requireUser(userId));
  },

  /**
   * Rename — account-wide, instant (every card joins user.name live).
   * Same-name set is a no-op 200 (no write, F5 no-op discipline). Email is
   * structurally unreachable: the .strict() profile schema rejects the key
   * at the route boundary (rule 4, D5).
   */
  async updateProfile(userId: string, name: string): Promise<ProfileCard> {
    const row = await requireUser(userId);
    if (row.name === name) return toProfileCard(row);
    return toProfileCard(
      await settingsRepository.updateName(prisma, userId, name),
    );
  },

  // ── Appearance ───────────────────────────────────────────────────────

  /** Absent row reads as SYSTEM (read-time default, D6) — never 404. */
  async getAppearance(userId: string): Promise<Appearance> {
    const pref = await settingsRepository.getPreference(prisma, userId);
    return { theme: pref?.theme ?? 'SYSTEM' };
  },

  /** Upsert — lazy user_preference row creation on first set (D6). */
  async setAppearance(
    userId: string,
    request: SetAppearanceRequest,
  ): Promise<Appearance> {
    const pref = await settingsRepository.upsertPreference(
      prisma,
      userId,
      request.theme,
    );
    return { theme: pref.theme };
  },

  // ── Avatar ───────────────────────────────────────────────────────────

  /**
   * Upload/replace — validate → put → persist → best-effort old cleanup
   * (data-model §6.3, D4). R2 put failure ⇒ 500 with user.image unchanged
   * (no persist without put); cleanup failure is logged, never surfaced.
   * The body carries the already-validated file (controller gate chain §8.1).
   */
  async uploadAvatar(
    userId: string,
    file: {
      bytes: Uint8Array;
      mime: 'image/jpeg' | 'image/png' | 'image/webp';
    },
  ): Promise<AvatarCard> {
    const current = await requireUser(userId);
    const oldKey = current.image;

    const key = buildAvatarKey(userId, file.mime);
    try {
      await getAvatarStorage().put(key, file.bytes, {
        contentType: file.mime,
        cacheControl: AVATAR_CACHE_CONTROL,
      });
    } catch (error) {
      logger.error(
        { err: error, userId, key },
        '[settings] Avatar upload failed',
      );
      throw new InternalServerError('Avatar storage is unavailable');
    }

    await settingsRepository.updateImage(prisma, userId, key);

    if (oldKey) void deleteAvatarObject(oldKey);

    return { image: resolveImageUrl(key) ?? key };
  },

  /**
   * Clear — idempotent (already-null ⇒ 200 unchanged card, not an error).
   * Missing `confirm: true` ⇒ 400 CONFIRMATION_REQUIRED (uniform delete
   * discipline; raw confirm arrives from the controller, un-zod'd, so the
   * domain code — not VALIDATION_ERROR — is what the client sees).
   */
  async clearAvatar(userId: string, confirm: unknown): Promise<ProfileCard> {
    if (confirm !== true) throw new ConfirmationRequiredError();

    const row = await requireUser(userId);
    if (!row.image) return toProfileCard(row);

    const updated = await settingsRepository.updateImage(prisma, userId, null);
    void deleteAvatarObject(row.image);

    return toProfileCard(updated);
  },
};
