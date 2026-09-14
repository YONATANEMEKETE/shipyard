import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCard } from '@shipyard/shared';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
}));

import { NotificationsBell } from '@/components/notifications/notifications-bell';
import { ToastProvider } from '@/components/providers/toast-provider';
import { server } from '../../msw/server.js';

// ─────────────────────────────────────────────────────────────────────────────
// Bell + panel wiring — the read/write round trips against MSW-served
// `/api/v1/notifications*` (api-design §10.2). These assert wire behaviour
// (method + path) and rendered state, never implementation details.
// ─────────────────────────────────────────────────────────────────────────────

function notification(
  overrides: Partial<NotificationCard> = {},
): NotificationCard {
  return {
    id: 'ntf_134',
    workspaceId: 'ws_1',
    type: 'ASSIGNMENT',
    actor: { userId: 'usr_ana', name: 'Ana Ruiz', image: null },
    issue: {
      id: 'iss_134',
      identifier: 'SHIP-134',
      title: 'Add Stripe payment intent flow',
      workspaceId: 'ws_1',
      workspaceSlug: 'harbor',
      archivedAt: null,
    },
    commentId: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const UNREAD = notification();
const MENTION = notification({
  id: 'ntf_124',
  type: 'MENTION',
  commentId: 'cmt_981',
  actor: { userId: 'usr_chen', name: 'Chen Kim', image: null },
  issue: {
    id: 'iss_124',
    identifier: 'SHIP-124',
    title: 'Fix login redirect after OAuth callback',
    workspaceId: 'ws_1',
    workspaceSlug: 'harbor',
    archivedAt: null,
  },
});

function renderBell() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <NotificationsBell />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

/** Serve a fixed page and count so every test starts from a known inbox. */
function serveInbox(
  notifications: NotificationCard[],
  unreadCount: number,
): void {
  server.use(
    http.get('*/api/v1/notifications/unread-count', () =>
      HttpResponse.json({ data: { unreadCount } }),
    ),
    http.get('*/api/v1/notifications', () =>
      HttpResponse.json({
        data: { notifications, nextCursor: null },
      }),
    ),
  );
}

async function openPanel() {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: /Notifications/ }),
  );
  return user;
}

describe('NotificationsBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the badge when nothing is unread', async () => {
    serveInbox([], 0);
    renderBell();

    const trigger = await screen.findByRole('button', {
      name: 'Notifications',
    });
    expect(trigger).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('renders the unread count in the label, the tooltip and the badge', async () => {
    serveInbox([UNREAD], 1);
    renderBell();

    const trigger = await screen.findByRole('button', {
      name: 'Notifications, 1 unread',
    });
    expect(trigger).toBeInTheDocument();
    expect(await screen.findByText('1')).toBeInTheDocument();
  });

  it('caps a large badge at 9+', async () => {
    serveInbox([UNREAD], 12);
    renderBell();

    expect(
      await screen.findByRole('button', { name: 'Notifications, 12 unread' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('9+')).toBeInTheDocument();
  });

  it('keeps the last count silently when the poll fails', async () => {
    server.use(
      http.get('*/api/v1/notifications/unread-count', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'boom' } },
          { status: 500 },
        ),
      ),
    );
    renderBell();

    expect(
      await screen.findByRole('button', { name: 'Notifications' }),
    ).toBeInTheDocument();
    // A failed poll must never surface as an error surface.
    expect(screen.queryByText(/boom/)).toBeNull();
  });

  it('does not fetch the panel until the bell is opened', async () => {
    const panelCalls: string[] = [];
    server.use(
      http.get('*/api/v1/notifications/unread-count', () =>
        HttpResponse.json({ data: { unreadCount: 1 } }),
      ),
      http.get('*/api/v1/notifications', ({ request }) => {
        panelCalls.push(new URL(request.url).pathname);
        return HttpResponse.json({
          data: { notifications: [UNREAD], nextCursor: null },
        });
      }),
    );
    renderBell();

    await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    expect(panelCalls).toHaveLength(0);

    await openPanel();
    await waitFor(() => expect(panelCalls).toHaveLength(1));
  });

  it('renders the newest-first page when opened', async () => {
    serveInbox([UNREAD, MENTION], 1);
    renderBell();
    await openPanel();

    expect(
      await screen.findByRole('button', {
        name: /^Ana Ruiz assigned you to SHIP-134/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /^Chen Kim mentioned you in SHIP-124/,
      }),
    ).toBeInTheDocument();
  });

  it('marks an unread row read and navigates to the issue', async () => {
    const readCalls: { id: string; method: string }[] = [];
    serveInbox([UNREAD], 1);
    server.use(
      http.post(
        '*/api/v1/notifications/:notificationId/read',
        ({ params, request }) => {
          readCalls.push({
            id: String(params.notificationId),
            method: request.method,
          });
          return HttpResponse.json({
            data: { ...UNREAD, readAt: new Date().toISOString() },
          });
        },
      ),
    );
    renderBell();
    const user = await openPanel();

    await user.click(
      await screen.findByRole('button', {
        name: /^Ana Ruiz assigned you to SHIP-134/,
      }),
    );

    await waitFor(() => expect(readCalls).toHaveLength(1));
    expect(readCalls[0]).toEqual({ id: 'ntf_134', method: 'POST' });
    expect(mockPush).toHaveBeenCalledWith('/w/harbor/issues/iss_134');
  });

  it('deep-links mentions to the comment anchor', async () => {
    serveInbox([MENTION], 0);
    renderBell();
    const user = await openPanel();

    await user.click(
      await screen.findByRole('button', {
        name: /^Chen Kim mentioned you in SHIP-124/,
      }),
    );

    expect(mockPush).toHaveBeenCalledWith(
      '/w/harbor/issues/iss_124#comment-cmt_981',
    );
  });

  it('does not re-mark a read row on open', async () => {
    const readCalls: string[] = [];
    serveInbox([notification({ readAt: new Date().toISOString() })], 0);
    server.use(
      http.post('*/api/v1/notifications/:notificationId/read', ({ params }) => {
        readCalls.push(String(params.notificationId));
        return HttpResponse.json({ data: UNREAD });
      }),
    );
    renderBell();
    const user = await openPanel();

    await user.click(
      await screen.findByRole('button', {
        name: /^Ana Ruiz assigned you to SHIP-134/,
      }),
    );

    expect(mockPush).toHaveBeenCalledOnce();
    expect(readCalls).toHaveLength(0);
  });

  it('marks all read through the bulk endpoint', async () => {
    let readAllCalls = 0;
    serveInbox([UNREAD, MENTION], 2);
    server.use(
      http.post('*/api/v1/notifications/read-all', () => {
        readAllCalls += 1;
        return HttpResponse.json({ data: { markedCount: 2 } });
      }),
    );
    renderBell();
    const user = await openPanel();

    await user.click(
      await screen.findByRole('button', { name: /Mark all read/ }),
    );

    await waitFor(() => expect(readAllCalls).toBe(1));
    expect(
      await screen.findByText('Marked 2 notifications read'),
    ).toBeInTheDocument();
  });

  it('dismisses a single row through the confirmed delete', async () => {
    const deleted: string[] = [];
    serveInbox([UNREAD, MENTION], 1);
    server.use(
      http.delete('*/api/v1/notifications/:notificationId', ({ params }) => {
        deleted.push(String(params.notificationId));
        return HttpResponse.json({
          data: { deletedNotificationId: params.notificationId },
        });
      }),
    );
    renderBell();
    const user = await openPanel();

    await user.click(
      await screen.findByRole('button', {
        name: 'Dismiss notification: Ana Ruiz assigned you to SHIP-134 — Add Stripe payment intent flow',
      }),
    );

    await waitFor(() => expect(deleted).toEqual(['ntf_134']));
  });

  it('clears all immediately — no confirmation step', async () => {
    const clearBodies: string[] = [];
    serveInbox([UNREAD, MENTION], 2);
    server.use(
      http.delete('*/api/v1/notifications', async ({ request }) => {
        clearBodies.push(await request.text());
        return HttpResponse.json({ data: { deletedCount: 2 } });
      }),
    );
    renderBell();
    const user = await openPanel();

    await user.click(
      await screen.findByRole('button', { name: /Clear all notifications/ }),
    );

    await waitFor(() => expect(clearBodies).toHaveLength(1));
    expect(JSON.parse(clearBodies[0] as string)).toEqual({ confirm: true });
    expect(screen.queryByText('Clear all notifications?')).toBeNull();
  });

  it('shows the footer loading state while clearing', async () => {
    // Hold the response open so the pending beat can be observed without
    // racing a timer — a fixed delay is flaky under full-suite load.
    let releaseClear: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseClear = resolve;
    });

    serveInbox([UNREAD], 1);
    server.use(
      http.delete('*/api/v1/notifications', async () => {
        await gate;
        return HttpResponse.json({ data: { deletedCount: 1 } });
      }),
    );
    renderBell();
    const user = await openPanel();

    await user.click(
      await screen.findByRole('button', { name: /Clear all notifications/ }),
    );

    const pending = await screen.findByText('Clearing…');
    expect(pending).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clearing…' })).toBeDisabled();

    // Let the write finish so the mutation settles before teardown.
    releaseClear?.();
    await waitFor(() => expect(screen.queryByText('Clearing…')).toBeNull());
  });

  it('reconciles the unread count as soon as a row is opened', async () => {
    let countCalls = 0;
    server.use(
      http.get('*/api/v1/notifications/unread-count', () => {
        countCalls += 1;
        // First read says 1; the post-open refetch says 0.
        return HttpResponse.json({
          data: { unreadCount: countCalls > 1 ? 0 : 1 },
        });
      }),
      http.get('*/api/v1/notifications', () =>
        HttpResponse.json({
          data: { notifications: [UNREAD], nextCursor: null },
        }),
      ),
    );
    renderBell();
    const user = await openPanel();
    await waitFor(() => expect(countCalls).toBe(1));

    await user.click(
      await screen.findByRole('button', {
        name: /^Ana Ruiz assigned you to SHIP-134/,
      }),
    );

    // The badge must not wait up to a full poll interval to drop.
    await waitFor(() => expect(countCalls).toBeGreaterThanOrEqual(2));
    expect(
      await screen.findByRole('button', { name: 'Notifications' }),
    ).toBeInTheDocument();
  });

  it('refetches the unread subset when the Unread filter is selected', async () => {
    const queries: string[] = [];
    server.use(
      http.get('*/api/v1/notifications/unread-count', () =>
        HttpResponse.json({ data: { unreadCount: 1 } }),
      ),
      http.get('*/api/v1/notifications', ({ request }) => {
        queries.push(new URL(request.url).search);
        return HttpResponse.json({
          data: { notifications: [UNREAD], nextCursor: null },
        });
      }),
    );
    renderBell();
    const user = await openPanel();

    await waitFor(() => expect(queries).toHaveLength(1));
    await user.click(screen.getByRole('tab', { name: /Unread/ }));

    await waitFor(() => expect(queries).toHaveLength(2));
    expect(queries[1]).toContain('unreadOnly=true');
  });
});
