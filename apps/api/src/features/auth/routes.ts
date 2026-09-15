import { Router } from 'express';
import { setPasswordRequestSchema } from '@shipyard/shared';
import { validate } from '../../common/middlewares/validate.js';
import { setPasswordController } from './controller.js';

/**
 * Auth extension router — mounted under `/api/v1/auth` **before** the
 * better-auth catch-all in `app.ts`, so this path is ours and everything else
 * still falls through to `authNodeHandler`.
 *
 * One route today: the first password for an account that has none. See
 * `controller.ts` for why it has to exist server-side at all.
 */

export const authExtensionRouter = Router();

authExtensionRouter.post(
  '/set-password',
  validate.body(setPasswordRequestSchema),
  setPasswordController,
);
