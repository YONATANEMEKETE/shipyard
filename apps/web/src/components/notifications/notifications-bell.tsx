'use client';

import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { NotificationCard } from '@shipyard/shared';

import {
  NotificationsPanel,
  type NotificationFilter,
} from '@/components/notifications/notifications-panel';
import { useToast } from '@/components/providers/toast-provider';
import { Float } from '@/components/ui/float';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useClearAllNotifications,
  useDeleteNotification,
  useInfiniteNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useUnreadCount,
} from '@/hooks/use-notifications';
import { notificationHref } from '@/lib/notifications/presenters';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications bell — the header trigger, the badge, and the panel's data.
//
// This is the only stateful piece of the feature: the panel below it is
// presentational, so every read/write in the MVP funnels through here.
//
//   • badge  → `useUnreadCount` polls every ~60s, paused while the tab is
//              hidden. Failures are silent by design: the badge keeps its last
//              value and the next poll reconciles (api-design §8.1).
//   • panel  → `useInfiniteNotifications`, fetched on open only (never on the
//              poll), cursor-walked via "Load more".
//   • writes → mark-read on row click (navigation is not blocked by it),
//              mark-all, per-row dismiss, and clear-all behind a confirm.
// ─────────────────────────────────────────────────────────────────────────────

export function NotificationsBell({ className }: { className?: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');

  const unreadQuery = useUnreadCount();
  const panel = useInfiniteNotifications(
    { unreadOnly: filter === 'unread' ? 'true' : undefined },
    { enabled: open },
  );

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const dismiss = useDeleteNotification();
  const clearAll = useClearAllNotifications();

  const notifications =
    panel.data?.pages.flatMap((page) => page.notifications) ?? [];
  const unreadCount = unreadQuery.data?.unreadCount ?? 0;
  const isMutating =
    markRead.isPending ||
    markAllRead.isPending ||
    dismiss.isPending ||
    clearAll.isPending;

  function handleOpenNotification(notification: NotificationCard) {
    // Opening marks read; it never deletes (spec §3.2 — read rows persist).
    if (notification.readAt === null) {
      markRead.mutate(notification.id, {
        onError: (error) => {
          showToast({
            status: 'error',
            title: "Couldn't mark it read",
            description: error.message || 'It will stay unread for now.',
          });
        },
      });
    }
    setOpen(false);
    router.push(notificationHref(notification));
  }

  function handleMarkAllRead() {
    markAllRead.mutate(undefined, {
      onSuccess: (result) => {
        if (result.markedCount > 0) {
          showToast({
            status: 'success',
            title:
              result.markedCount === 1
                ? 'Marked 1 notification read'
                : `Marked ${result.markedCount} notifications read`,
          });
        }
      },
      onError: (error) => {
        showToast({
          status: 'error',
          title: "Couldn't mark them read",
          description: error.message || 'Please try again.',
        });
      },
    });
  }

  function handleDismiss(notification: NotificationCard) {
    dismiss.mutate(notification.id, {
      onError: (error) => {
        showToast({
          status: 'error',
          title: "Couldn't dismiss it",
          description: error.message || 'Please try again.',
        });
      },
    });
  }

  function handleClearAll() {
    clearAll.mutate(undefined, {
      onSuccess: () => {
        showToast({ status: 'success', title: 'Notifications cleared' });
      },
      onError: (error) => {
        showToast({
          status: 'error',
          title: "Couldn't clear notifications",
          description: error.message || 'Nothing was deleted.',
        });
      },
    });
  }

  const label =
    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="relative shrink-0">
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={label}
                  className={
                    className ??
                    'grid size-8 place-items-center rounded-lg border border-ds-border bg-ds-surface text-foreground transition-colors hover:border-ds-border-strong focus-visible:ring-2 focus-visible:ring-ds-focus focus-visible:outline-none sm:size-9'
                  }
                >
                  <Bell className="h-4 w-4 sm:h-[17px] sm:w-[17px]" />
                </button>
              </PopoverTrigger>

              {unreadCount > 0 ? (
                <Float
                  aria-hidden
                  className="grid h-4 min-w-4 place-items-center rounded-full bg-ds-brand px-1 font-mono text-[10px] font-bold text-white tabular-nums ring-2 ring-ds-bg"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Float>
              ) : null}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
              : 'Notifications'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        aria-label="Notifications"
        className="w-auto border-0 bg-transparent p-0 shadow-none"
      >
        <NotificationsPanel
          notifications={notifications}
          unreadCount={unreadCount}
          filter={filter}
          onFilterChange={setFilter}
          onOpen={handleOpenNotification}
          onMarkAllRead={handleMarkAllRead}
          onClearAll={handleClearAll}
          onDismiss={handleDismiss}
          onLoadMore={() => void panel.fetchNextPage()}
          hasMore={panel.hasNextPage}
          isLoadingMore={panel.isFetchingNextPage}
          // Skeleton only on a cold cache; a refetch keeps the rows it has.
          isLoading={panel.isPending}
          // A failed refetch keeps serving cached rows instead of an error.
          error={panel.data ? null : panel.error}
          onRetry={() => void panel.refetch()}
          isMutating={isMutating}
          isClearing={clearAll.isPending}
        />
      </PopoverContent>
    </Popover>
  );
}
