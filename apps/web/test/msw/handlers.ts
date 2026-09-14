import { http, HttpResponse } from 'msw';

/**
 * Default request handlers. Add feature-specific handlers here as the app
 * gains API endpoints. Tests can override per-test via server.use(...).
 */
export const handlers = [
  http.get('*/api/v1/workspaces/:slug/projects', () => {
    return HttpResponse.json({ data: { projects: [] } });
  }),
  // Member detail — single-fetch stats bundle (projectsOwned/issuesAssigned,
  // no cycles). Default zeros; tests override per-test via server.use(...).
  http.get('*/api/v1/workspaces/:slug/members/:memberId', ({ params }) => {
    const memberId =
      typeof params.memberId === 'string' ? params.memberId : 'cm0mem0001';
    return HttpResponse.json({
      data: {
        id: memberId,
        userId: 'usr_2',
        workspaceId: 'ws_1',
        name: 'Alex Rivera',
        email: 'alex@harbor.test',
        image: null,
        role: 'MEMBER',
        createdAt: '2026-08-14T09:00:00.000Z',
        stats: { projectsOwned: 0, issuesAssigned: 0 },
      },
    });
  }),
  // ── Notifications (F6) ──────────────────────────────────────────────────
  // Static paths are registered before `:notificationId` so the row handler
  // never swallows `/unread-count`. Defaults are "empty inbox"; tests override
  // per-case via server.use(...).
  http.get('*/api/v1/notifications/unread-count', () => {
    return HttpResponse.json({ data: { unreadCount: 0 } });
  }),
  http.post('*/api/v1/notifications/read-all', () => {
    return HttpResponse.json({ data: { markedCount: 0 } });
  }),
  http.get('*/api/v1/notifications', () => {
    return HttpResponse.json({ data: { notifications: [], nextCursor: null } });
  }),
  http.post('*/api/v1/notifications/:notificationId/read', ({ params }) => {
    return HttpResponse.json({
      data: { id: params.notificationId, readAt: new Date().toISOString() },
    });
  }),
  http.delete('*/api/v1/notifications/:notificationId', ({ params }) => {
    return HttpResponse.json({
      data: { deletedNotificationId: params.notificationId },
    });
  }),
  http.delete('*/api/v1/notifications', () => {
    return HttpResponse.json({ data: { deletedCount: 0 } });
  }),
  http.all('http://localhost:4000/*', () => {
    return HttpResponse.json(
      { error: { code: 'NOT_IMPLEMENTED', message: 'No handler registered' } },
      { status: 501 },
    );
  }),
];
