import type { NextFunction, Request, Response } from 'express';
import type { AvatarMime } from '@shipyard/shared';
import { AVATAR_FILE_FIELD } from '@shipyard/shared';
import { sendSuccess } from '../../common/http/responses.js';
import {
  UnauthorizedError,
  ValidationError,
} from '../../common/errors/httpErrors.js';
import { settingsService } from './service.js';
import {
  extensionMatches,
  isAllowedAvatarMime,
  sniffAvatarMime,
} from './schemas.js';

/**
 * Settings controller — HTTP concerns only (parse session/body/file, call
 * service, map result/errors). Self-scope: `req.session.userId` keys every
 * call — no workspace context, no roles (api-design §3/§4).
 */

function userIdOf(request: Request): string {
  const userId =
    (request.user as { id?: string } | undefined)?.id ??
    (request.session as { userId?: string } | undefined)?.userId;
  if (!userId) throw new UnauthorizedError();
  return userId;
}

// ── Profile ──────────────────────────────────────────────────────────────

export function getProfileController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const card = await settingsService.getProfile(userIdOf(request));
      sendSuccess(response, card);
    } catch (error) {
      next(error);
    }
  })();
}

export function updateProfileController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const body = request.body as { name: string };
      const card = await settingsService.updateProfile(
        userIdOf(request),
        body.name,
      );
      sendSuccess(response, card);
    } catch (error) {
      next(error);
    }
  })();
}

// ── Appearance ───────────────────────────────────────────────────────────

export function getAppearanceController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const appearance = await settingsService.getAppearance(userIdOf(request));
      sendSuccess(response, appearance);
    } catch (error) {
      next(error);
    }
  })();
}

export function setAppearanceController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const body = request.body as { theme: 'LIGHT' | 'DARK' | 'SYSTEM' };
      const appearance = await settingsService.setAppearance(
        userIdOf(request),
        body,
      );
      sendSuccess(response, appearance);
    } catch (error) {
      next(error);
    }
  })();
}

// ── Avatar ───────────────────────────────────────────────────────────────

/**
 * Gate chain over the parsed file part, in the documented order (api-design
 * §8.1): part present → claimed MIME ∈ allowlist → magic-byte sniff agrees →
 * extension matches. The 2MB cap already fired inside multer's stream parser
 * (pre-buffer) and was mapped to a 400 there — so by the time a file reaches
 * here, every remaining gate is cheap and R2 is never called on failure.
 */
function avatarInputOf(request: Request): {
  bytes: Uint8Array;
  mime: AvatarMime;
} {
  const file = (request as Request & { file?: Express.Multer.File }).file;

  if (!file) {
    throw new ValidationError('Avatar file is required', [
      { field: AVATAR_FILE_FIELD, message: 'Attach an image to upload' },
    ]);
  }

  if (file.size === 0 || file.buffer.length === 0) {
    throw new ValidationError('Avatar file is empty', [
      {
        field: AVATAR_FILE_FIELD,
        message: 'The uploaded file contains no data',
      },
    ]);
  }

  if (!isAllowedAvatarMime(file.mimetype)) {
    throw new ValidationError('Unsupported avatar type', [
      {
        field: AVATAR_FILE_FIELD,
        message: 'Use a JPEG, PNG, or WebP image',
      },
    ]);
  }

  const sniffed = sniffAvatarMime(file.buffer);
  if (sniffed === null || sniffed !== file.mimetype) {
    throw new ValidationError('Avatar content does not match its type', [
      {
        field: AVATAR_FILE_FIELD,
        message: 'The file is not the image type it claims to be',
      },
    ]);
  }

  if (!extensionMatches(sniffed, file.originalname)) {
    throw new ValidationError('Avatar extension does not match its type', [
      {
        field: AVATAR_FILE_FIELD,
        message: 'The file extension does not match the image type',
      },
    ]);
  }

  return { bytes: file.buffer, mime: sniffed };
}

export function uploadAvatarController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const card = await settingsService.uploadAvatar(
        userIdOf(request),
        avatarInputOf(request),
      );
      // 201 — a new immutable object exists at a new key (api-design §5.1).
      sendSuccess(response, card, 201);
    } catch (error) {
      next(error);
    }
  })();
}

export function clearAvatarController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const confirm = (request.body as { confirm?: unknown } | undefined)
        ?.confirm;
      const card = await settingsService.clearAvatar(
        userIdOf(request),
        confirm,
      );
      sendSuccess(response, card);
    } catch (error) {
      next(error);
    }
  })();
}
