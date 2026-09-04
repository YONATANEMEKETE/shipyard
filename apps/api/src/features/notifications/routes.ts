import { Router } from 'express';
import { confirmActionSchema } from '@shipyard/shared';
import { requireSession } from '../../common/middlewares/requireSession.js';
import { validate } from '../../common/middlewares/validate.js';
import {
  clearAllQuerySchema,
  emptyBodySchema,
  emptyQuerySchema,
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
  readAllQuerySchema,
} from './schemas.js';
import {
  clearAllController,
  deleteNotificationController,
  getNotificationController,
  listNotificationsController,
  markAllReadController,
  markReadController,
  unreadCountController,
} from './controller.js';

/**
 * Notifications routes — one global family (api-design.md §2), scoped by
 * recipient (D2), never by workspace:
 *  - `/notifications...` — panel, badge, row actions, bulk actions
 *
 * Guard chain is the documented divergence: `requireSession` only. No
 * `resolveWorkspaceContext`, no `requireWorkspaceRole`, no `rejectArchived`
 * anywhere here — recipient ownership replaces all of it. There is
 * deliberately NO create route (rule 7 — sourceless events unmintable).
 *
 * Static paths (`/unread-count`, `/read-all`) are registered before
 * `/:notificationId` so they never parse as an id.
 */

// ── Notifications router (mounted under /api/v1/notifications) ───────────

export const notificationsRouter = Router();

// Panel — newest first; unreadOnly + workspaceId compose with the cursor.
notificationsRouter.get(
  '/',
  requireSession,
  validate.query(listNotificationsQuerySchema),
  listNotificationsController,
);

// Badge poll target — no query params by design.
notificationsRouter.get(
  '/unread-count',
  requireSession,
  validate.query(emptyQuerySchema),
  unreadCountController,
);

// Mark all read — optional workspace scope, empty body.
notificationsRouter.post(
  '/read-all',
  requireSession,
  validate.all({ query: readAllQuerySchema, body: emptyBodySchema }),
  markAllReadController,
);

// Clear all — optional workspace/readOnly scope, confirmed.
notificationsRouter.delete(
  '/',
  requireSession,
  validate.all({ query: clearAllQuerySchema, body: confirmActionSchema }),
  clearAllController,
);

// Row detail.
notificationsRouter.get(
  '/:notificationId',
  requireSession,
  validate.params(notificationIdParamsSchema),
  getNotificationController,
);

// Mark read — one-way idempotent action, empty body.
notificationsRouter.post(
  '/:notificationId/read',
  requireSession,
  validate.all({ params: notificationIdParamsSchema, body: emptyBodySchema }),
  markReadController,
);

// Delete one — confirmed, permanent.
notificationsRouter.delete(
  '/:notificationId',
  requireSession,
  validate.all({
    params: notificationIdParamsSchema,
    body: confirmActionSchema,
  }),
  deleteNotificationController,
);
