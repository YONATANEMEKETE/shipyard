import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer, { type MulterError } from 'multer';
import { AVATAR_FILE_FIELD, AVATAR_MAX_BYTES } from '@shipyard/shared';
import { requireSession } from '../../common/middlewares/requireSession.js';
import { validate } from '../../common/middlewares/validate.js';
import { ValidationError } from '../../common/errors/httpErrors.js';
import { updateProfileSchema, setAppearanceSchema } from '@shipyard/shared';
import {
  clearAvatarController,
  getAppearanceController,
  getProfileController,
  setAppearanceController,
  updateProfileController,
  uploadAvatarController,
} from './controller.js';

/**
 * Settings routes — account paths only, session-only guard chain
 * (api-design §2/§4): `requireSession` + self-scope. There is deliberately
 * NO workspace-context/role/archived guard on any route (reviewable absence)
 * — onboarding users with zero workspaces must reach every endpoint here.
 *
 * Route-table is exactly these six (§2.1). Delegated sections are client
 * links, never proxy endpoints (§5.3, rule 5) — a proxy-shaped path like
 * `POST /settings/change-password` must 404, which the integration tests
 * assert directly.
 *
 * Avatar upload is the one non-JSON route: multer parses `multipart/form-data`
 * with `limits.fileSize = 2MB` — the stream aborts at the cap BEFORE full
 * buffering (the design's "floods die before R2"), and MulterErrors map to
 * `400 VALIDATION_ERROR` with the field in details.
 */

const uploadAvatarPart = multer({
  storage: multer.memoryStorage(),
  limits: {
    // Pre-buffer cap — bytes beyond 2MB never enter memory (D3).
    fileSize: AVATAR_MAX_BYTES,
    files: 1,
  },
}).single(AVATAR_FILE_FIELD);

function requireAvatarPart(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  uploadAvatarPart(request, response, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (typeof (error as MulterError).code === 'string') {
      const multerError = error as MulterError;
      if (multerError.code === 'LIMIT_FILE_SIZE') {
        next(
          new ValidationError('Avatar is too large', [
            {
              field: AVATAR_FILE_FIELD,
              message: 'Keep the avatar under 2MB',
            },
          ]),
        );
        return;
      }
      if (multerError.code === 'LIMIT_UNEXPECTED_FILE') {
        next(
          new ValidationError('Unexpected file field', [
            {
              field: AVATAR_FILE_FIELD,
              message: `Send exactly one file field named "${AVATAR_FILE_FIELD}"`,
            },
          ]),
        );
        return;
      }
    }

    next(error);
  });
}

// ── Settings router (mounted under /api/v1/settings) ──────────────────────

export const settingsRouter = Router();

// #1 — Profile card (name, read-only email, avatar, verification flag).
settingsRouter.get('/profile', requireSession, getProfileController);

// #2 — Rename (.strict() schema — an `email` key is a 400, D5/rule 4).
settingsRouter.patch(
  '/profile',
  requireSession,
  validate.body(updateProfileSchema),
  updateProfileController,
);

// #3 — Theme read; absent row ⇒ SYSTEM (D6).
settingsRouter.get('/appearance', requireSession, getAppearanceController);

// #4 — Theme set (upsert, lazy row creation).
settingsRouter.put(
  '/appearance',
  requireSession,
  validate.body(setAppearanceSchema),
  setAppearanceController,
);

// #5 — Upload/replace avatar (multipart [avatar]; 201 — new immutable object).
settingsRouter.post(
  '/avatar',
  requireSession,
  requireAvatarPart,
  uploadAvatarController,
);

// #6 — Clear avatar; `{ confirm: true }` enforced in the service so a missing
// literal surfaces as 400 CONFIRMATION_REQUIRED, not VALIDATION_ERROR.
settingsRouter.delete('/avatar', requireSession, clearAvatarController);
