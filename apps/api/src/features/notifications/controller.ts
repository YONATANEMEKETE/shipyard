import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../common/http/responses.js';
import { UnauthorizedError } from '../../common/errors/httpErrors.js';
import { notificationsService } from './service.js';
import type {
  ClearAllQuery,
  ListNotificationsQuery,
  ReadAllQuery,
} from './schemas.js';

/**
 * Notifications controller — HTTP concerns only (parse request, resolve the
 * recipient from the session, call service). Scope here is recipient
 * isolation (D2): every call passes `userId` as the recipient key. There is
 * no workspace context and no role check on any route.
 */

function recipientOf(request: Request): string {
  const userId =
    (request.user as { id?: string } | undefined)?.id ??
    (request.session as { userId?: string } | undefined)?.userId;
  if (!userId) throw new UnauthorizedError();
  return userId;
}

export function listNotificationsController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const query = request.query as unknown as ListNotificationsQuery;
      const page = await notificationsService.list(recipientOf(request), query);
      sendSuccess(response, page);
    } catch (error) {
      next(error);
    }
  })();
}

export function unreadCountController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const count = await notificationsService.unreadCount(
        recipientOf(request),
      );
      sendSuccess(response, count);
    } catch (error) {
      next(error);
    }
  })();
}

export function getNotificationController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const card = await notificationsService.getDetail(
        recipientOf(request),
        String(request.params.notificationId),
      );
      sendSuccess(response, card);
    } catch (error) {
      next(error);
    }
  })();
}

export function markReadController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const card = await notificationsService.markRead(
        recipientOf(request),
        String(request.params.notificationId),
      );
      sendSuccess(response, card);
    } catch (error) {
      next(error);
    }
  })();
}

export function markAllReadController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const query = request.query as unknown as ReadAllQuery;
      const result = await notificationsService.markAllRead(
        recipientOf(request),
        query,
      );
      sendSuccess(response, result);
    } catch (error) {
      next(error);
    }
  })();
}

export function deleteNotificationController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const result = await notificationsService.remove(
        recipientOf(request),
        String(request.params.notificationId),
        (request.body as { confirm?: unknown } | undefined)?.confirm,
      );
      sendSuccess(response, result);
    } catch (error) {
      next(error);
    }
  })();
}

export function clearAllController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const query = request.query as unknown as ClearAllQuery;
      const result = await notificationsService.clearAll(
        recipientOf(request),
        query,
        (request.body as { confirm?: unknown } | undefined)?.confirm,
      );
      sendSuccess(response, result);
    } catch (error) {
      next(error);
    }
  })();
}
