import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationCard } from '@shipyard/shared';

import { NotificationsPanel } from '@/components/notifications/notifications-panel';
import {
  MOCK_NOTIFICATIONS,
  MOCK_UNREAD_COUNT,
} from '@/components/notifications/notifications-mock';

const NOW = new Date(2026, 8, 10, 12, 0, 0); // 10 Sep 2026, 12:00 local

function atLocal(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes = 0,
): string {
  return new Date(year, month, day, hours, minutes).toISOString();
}

function card(overrides: Partial<NotificationCard> = {}): NotificationCard {
  return {
    id: 'ntf_1',
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
    createdAt: atLocal(2026, 8, 10, 11, 55),
    ...overrides,
  };
}

const TODAY_UNREAD = card({ id: 'ntf_134' });
const TODAY_READ = card({
  id: 'ntf_127',
  type: 'MENTION',
  commentId: 'cmt_944',
  actor: { userId: 'usr_sam', name: 'Sam Park', image: null },
  issue: {
    id: 'iss_127',
    identifier: 'SHIP-127',
    title: 'Invoice PDF export service',
    workspaceId: 'ws_1',
    workspaceSlug: 'harbor',
    archivedAt: null,
  },
  readAt: atLocal(2026, 8, 10, 11, 30),
  createdAt: atLocal(2026, 8, 10, 10, 0),
});
const YESTERDAY_READ = card({
  id: 'ntf_122',
  actor: { userId: 'usr_chen', name: 'Chen Kim', image: null },
  issue: {
    id: 'iss_122',
    identifier: 'SHIP-122',
    title: 'Authored empty-state copy',
    workspaceId: 'ws_1',
    workspaceSlug: 'harbor',
    archivedAt: null,
  },
  readAt: atLocal(2026, 8, 9, 12, 0),
  createdAt: atLocal(2026, 8, 9, 9, 0),
});
const EARLIER_READ = card({
  id: 'ntf_126',
  type: 'MENTION',
  commentId: 'cmt_877',
  actor: null,
  issue: {
    id: 'iss_126',
    identifier: 'SHIP-126',
    title: 'Cycle progress derivation',
    workspaceId: 'ws_1',
    workspaceSlug: 'harbor',
    archivedAt: atLocal(2026, 8, 15, 9, 0),
  },
  readAt: atLocal(2026, 8, 8, 12, 0),
  createdAt: atLocal(2026, 8, 8, 9, 0),
});

const FEED = [TODAY_UNREAD, TODAY_READ, YESTERDAY_READ, EARLIER_READ];

function renderPanel(
  overrides: Partial<ComponentProps<typeof NotificationsPanel>> = {},
) {
  const props = {
    notifications: FEED,
    unreadCount: 1,
    filter: 'all' as const,
    onFilterChange: vi.fn(),
    onOpen: vi.fn(),
    onMarkAllRead: vi.fn(),
    onClearAll: vi.fn(),
    now: NOW,
    ...overrides,
  };
  render(<NotificationsPanel {...props} />);
  return props;
}

function rowFor(name: RegExp) {
  return screen.getByRole('button', { name });
}

describe('NotificationsPanel — success state', () => {
  it('renders the card copy from type + actor + issue, never a server sentence', () => {
    renderPanel();

    const assignment = screen.getByRole('button', {
      name: /Ana Ruiz assigned you to SHIP-134/,
    });
    expect(
      within(assignment).getByText('Add Stripe payment intent flow'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Sam Park mentioned you in SHIP-127/,
      }),
    ).toBeInTheDocument();
  });

  it('groups rows by day in server order', () => {
    renderPanel();

    const labels = Array.from(
      document.querySelectorAll('[data-slot="notification-group-label"]'),
    ).map((node) => node.textContent);
    expect(labels).toEqual(['Today', 'Yesterday', 'Earlier']);
  });

  it('shows the unread count and only dots unread rows', () => {
    renderPanel();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(FEED.length);
    expect(rows.filter((row) => row.dataset.unread === 'true')).toHaveLength(1);
  });

  it('marks the active filter tab and mounts the sliding underline', () => {
    renderPanel({ filter: 'unread' });

    expect(screen.getByRole('tab', { name: /Unread/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    // The shared Ark indicator is what animates between the two triggers;
    // without it the tabs would fall back to a static per-tab underline.
    expect(
      document.querySelector('[data-slot="tab-indicator"]'),
    ).not.toBeNull();
  });

  it('reports filter changes and row opens upward', async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole('tab', { name: /Unread/ }));
    expect(props.onFilterChange).toHaveBeenCalledWith('unread');

    await user.click(rowFor(/Ana Ruiz assigned you to SHIP-134/));
    expect(props.onOpen).toHaveBeenCalledWith(TODAY_UNREAD);
  });

  it('renders a "former member" actor and an archived hint', () => {
    renderPanel();

    expect(
      screen.getByRole('button', {
        name: /Former member mentioned you in SHIP-126.*archived issue/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('renders the dismiss affordance only when wired', () => {
    const onDismiss = vi.fn();
    const { unmount } = render(
      <NotificationsPanel
        notifications={FEED}
        unreadCount={1}
        filter="all"
        onFilterChange={vi.fn()}
        onOpen={vi.fn()}
        onMarkAllRead={vi.fn()}
        onClearAll={vi.fn()}
        now={NOW}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /Dismiss notification/ }),
    ).toBeNull();
    unmount();

    renderPanel({ onDismiss });
    expect(
      screen.getByRole('button', {
        name: 'Dismiss notification: Ana Ruiz assigned you to SHIP-134 — Add Stripe payment intent flow',
      }),
    ).toBeInTheDocument();
  });

  it('exposes load more only while a next page exists', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const { unmount } = render(
      <NotificationsPanel
        notifications={FEED}
        unreadCount={1}
        filter="all"
        onFilterChange={vi.fn()}
        onOpen={vi.fn()}
        onMarkAllRead={vi.fn()}
        onClearAll={vi.fn()}
        now={NOW}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledOnce();
    unmount();

    renderPanel();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('sends mark-all-read and clear-all', async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole('button', { name: /Mark all read/ }));
    await user.click(
      screen.getByRole('button', { name: /Clear all notifications/ }),
    );

    expect(props.onMarkAllRead).toHaveBeenCalledOnce();
    expect(props.onClearAll).toHaveBeenCalledOnce();
  });

  it('disables mark-all-read when nothing is unread', () => {
    renderPanel({ unreadCount: 0 });

    expect(
      screen.getByRole('button', { name: /Mark all read/ }),
    ).toBeDisabled();
  });

  it('puts the clear-all footer into its own loading state while clearing', () => {
    renderPanel({ isClearing: true });

    expect(screen.getByText('Clearing…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clearing…' })).toBeDisabled();
  });
});

describe('NotificationsPanel — loading state', () => {
  it('renders row skeletons instead of content', () => {
    renderPanel({ isLoading: true, notifications: [] });

    expect(
      screen.getAllByTestId('notification-row-skeleton').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Today')).toBeNull();
    expect(
      screen.getByRole('button', { name: /Mark all read/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Clear all notifications/ }),
    ).toBeDisabled();
  });
});

describe('NotificationsPanel — error state', () => {
  it('renders the friendly error with a retry action', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderPanel({ error: new Error('Network dropped'), onRetry });

    expect(screen.getByText("Couldn't load notifications")).toBeInTheDocument();
    expect(screen.getByText('Network dropped')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('falls back to generic copy when the error has no message', () => {
    renderPanel({ error: new Error('') });

    expect(
      screen.getByText(
        'We ran into a problem fetching your notifications. Try again in a moment.',
      ),
    ).toBeInTheDocument();
  });
});

describe('NotificationsPanel — empty states', () => {
  it('distinguishes an empty inbox from an empty unread filter', () => {
    const { unmount } = render(
      <NotificationsPanel
        notifications={[]}
        unreadCount={0}
        filter="all"
        onFilterChange={vi.fn()}
        onOpen={vi.fn()}
        onMarkAllRead={vi.fn()}
        onClearAll={vi.fn()}
        now={NOW}
      />,
    );
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    unmount();

    renderPanel({
      notifications: [],
      unreadCount: 0,
      filter: 'unread',
    });
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
  });
});

describe('NotificationsPanel — mock fixture', () => {
  it('renders the API-shaped mock feed end to end', () => {
    renderPanel({
      notifications: MOCK_NOTIFICATIONS,
      unreadCount: MOCK_UNREAD_COUNT,
      // The fixture is relative to the real clock — let grouping use it too.
      now: undefined,
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(
      MOCK_NOTIFICATIONS.length,
    );
    expect(
      screen.getByRole('button', {
        name: /Chen Kim mentioned you in SHIP-124/,
      }),
    ).toBeInTheDocument();
  });
});
