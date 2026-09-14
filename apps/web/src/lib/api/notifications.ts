import type {
  ClearAllResponse,
  DeleteNotificationResponse,
  MarkAllReadResponse,
  NotificationCard,
  NotificationListPage,
  UnreadCount,
} from '@shipyard/shared';

import { requestJson } from '@/lib/api/request';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications API client — recipient-scoped attention surface (F6)
//
// The one global API family in the product: no `:slug` in any path (D2), the
// bell follows the human across workspaces. Every request forwards the HttpOnly
// session cookie via credentials:include; the session *is* the scope key.
// Response envelopes: success { data }, error { error: { code, message, ... } }.
// Mirrors apps/api/src/features/notifications/routes.ts and the shared contracts
// in packages/shared/src/notifications.
// ─────────────────────────────────────────────────────────────────────────────

export class NotificationsApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
  }) {
    super(args.message);
    this.name = 'NotificationsApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

const NOTIFICATIONS_BASE = '/api/v1/notifications';

// ── Query params (mirror the route-local listNotificationsQuerySchema) ──

export interface ListNotificationsParams {
  /** Walk the unread subset only. Omitted means "all". */
  unreadOnly?: 'true' | 'false';
  /** Optional per-workspace filter — a filter, never a scope lookup (D2). */
  workspaceId?: string;
  /** 1..100, server default 25. Omitted lets the server decide. */
  limit?: number;
  /** Opaque base64url of (createdAt, id) — bound to the newest-first order. */
  cursor?: string;
}

export interface MarkAllReadParams {
  workspaceId?: string;
}

export interface ClearAllParams {
  workspaceId?: string;
  /** `true` clears read rows only, leaving unread badges untouched. */
  readOnly?: 'true' | 'false';
}

function buildQuery(params?: object): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

// ── Panel + badge ──

/** #1 — newest-first panel page (cursor walk to `nextCursor: null`). */
export function listNotifications(
  params?: ListNotificationsParams,
): Promise<NotificationListPage> {
  return requestJson<NotificationListPage>(
    `${NOTIFICATIONS_BASE}${buildQuery(params)}`,
    { method: 'GET' },
    'Failed to load notifications',
    NotificationsApiError,
  );
}

/** #2 — the ~60s poll target. Cheap covered-index count, never 404s. */
export function getUnreadCount(): Promise<UnreadCount> {
  return requestJson<UnreadCount>(
    `${NOTIFICATIONS_BASE}/unread-count`,
    { method: 'GET' },
    'Failed to load unread count',
    NotificationsApiError,
  );
}

// ── Row ──

/** #3 — permalink validation before navigation; foreign id reads as 404. */
export function getNotification(
  notificationId: string,
): Promise<NotificationCard> {
  return requestJson<NotificationCard>(
    `${NOTIFICATIONS_BASE}/${encodeURIComponent(notificationId)}`,
    { method: 'GET' },
    'Failed to load notification',
    NotificationsApiError,
  );
}

/** #4 — one-way, idempotent. Re-marking keeps the first `readAt`. */
export function markNotificationRead(
  notificationId: string,
): Promise<NotificationCard> {
  return requestJson<NotificationCard>(
    `${NOTIFICATIONS_BASE}/${encodeURIComponent(notificationId)}/read`,
    { method: 'POST', body: JSON.stringify({}) },
    'Failed to mark notification read',
    NotificationsApiError,
  );
}

/** #6 — permanent. `{ confirm: true }` is the documented delete literal. */
export function deleteNotification(
  notificationId: string,
): Promise<DeleteNotificationResponse> {
  return requestJson<DeleteNotificationResponse>(
    `${NOTIFICATIONS_BASE}/${encodeURIComponent(notificationId)}`,
    { method: 'DELETE', body: JSON.stringify({ confirm: true }) },
    'Failed to delete notification',
    NotificationsApiError,
  );
}

// ── Bulk ──

/** #5 — one statement over `readAt IS NULL`; `0` is a valid success. */
export function markAllNotificationsRead(
  params?: MarkAllReadParams,
): Promise<MarkAllReadResponse> {
  return requestJson<MarkAllReadResponse>(
    `${NOTIFICATIONS_BASE}/read-all${buildQuery(params)}`,
    { method: 'POST', body: JSON.stringify({}) },
    'Failed to mark all notifications read',
    NotificationsApiError,
  );
}

/** #7 — permanent, irreversible. Clears the whole inbox by default. */
export function clearAllNotifications(
  params?: ClearAllParams,
): Promise<ClearAllResponse> {
  return requestJson<ClearAllResponse>(
    `${NOTIFICATIONS_BASE}${buildQuery(params)}`,
    { method: 'DELETE', body: JSON.stringify({ confirm: true }) },
    'Failed to clear notifications',
    NotificationsApiError,
  );
}

export { NotificationsApiError as default };
