import { AppError } from '../../common/errors/AppError.js';

/**
 * Notifications domain errors (api-design.md §7). Each extends {@link AppError}
 * so the global error handler emits the standard envelope with its `code` and
 * `statusCode`. Services throw these; controllers never build error bodies.
 *
 * Shared-cross-module errors (CONFIRMATION_REQUIRED) are reused from the
 * workspace module. This module has no WORKSPACE_NOT_FOUND (no workspace
 * scope), no FORBIDDEN_ROLE (recipient isolation replaces roles), and no
 * archived codes (no freeze axis — §6.1).
 */

export const NotificationErrorCodes = {
  NOTIFICATION_NOT_FOUND: 'NOTIFICATION_NOT_FOUND',
} as const;

export type NotificationErrorCode =
  (typeof NotificationErrorCodes)[keyof typeof NotificationErrorCodes];

/**
 * 404 — :notificationId unknown **or** owned by another recipient. Deliberately
 * identical (inverted leak test): a foreign row is indistinguishable from a
 * random cuid — recipient isolation, not existence, is the boundary.
 */
export class NotificationNotFoundError extends AppError {
  constructor(message = 'Notification not found') {
    super(404, NotificationErrorCodes.NOTIFICATION_NOT_FOUND, message);
  }
}
