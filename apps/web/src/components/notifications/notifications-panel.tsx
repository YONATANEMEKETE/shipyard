'use client';

import { CheckCheck, RotateCw, Trash2 } from 'lucide-react';
import { useId } from 'react';
import type { NotificationCard } from '@shipyard/shared';

import { NotificationRow } from '@/components/notifications/notification-row';
import { StatefulButton } from '@/components/motion/button/stateful';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { groupNotificationsByDay } from '@/lib/notifications/presenters';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications panel — the single triage surface (F6)
//
// Presentational by design: it renders whatever cards it is handed and reports
// intent upward. That keeps the mock-data review (and the tests) independent of
// TanStack Query, and lets the container wire `useInfiniteNotifications` +
// mutations later without touching a single className.
//
// Geometry mirrors `shipyard.pen` → Element / Notifications Panel (ybtrP):
//   header (title + unread count + mark-all-read, either/or filter tabs)
//   divider
//   list (date-grouped rows; scrolls)
//   divider
//   footer (clear all)
//
// States shipped: loading (skeleton) · error (retry) · empty (none / all-caught-up)
// · success (grouped rows) · paginating (load more).
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationFilter = 'all' | 'unread';

export interface NotificationsPanelProps {
  notifications: NotificationCard[];
  unreadCount: number;
  filter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
  /** Row click — navigate to the issue and mark read (wired by the container). */
  onOpen: (notification: NotificationCard) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  /** Per-row dismiss. Omit to render rows without the dismiss affordance. */
  onDismiss?: (notification: NotificationCard) => void;
  /** Cursor walk controls — omitted when the first page is the last page. */
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  isLoading?: boolean;
  /** `null`/omitted means no error. */
  error?: Error | null;
  onRetry?: () => void;
  isMutating?: boolean;
  /** Clear-all is in flight — the footer button owns the loading beat. */
  isClearing?: boolean;
  /** Injected for deterministic tests; defaults to now. */
  now?: Date;
  className?: string;
}

function NotificationRowSkeleton() {
  return (
    <div
      aria-hidden
      data-testid="notification-row-skeleton"
      className="flex items-center gap-[10px] py-[11px] pr-[14px] pl-4"
    >
      <span className="size-7 shrink-0 animate-pulse rounded-full bg-ds-border/70" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-2.5 w-4/5 max-w-full animate-pulse rounded bg-ds-border/70" />
        <span className="h-2 w-3/5 max-w-full animate-pulse rounded bg-ds-border/40" />
      </span>
      <span className="h-2.5 w-6 shrink-0 animate-pulse rounded bg-ds-border/40" />
    </div>
  );
}

interface FilterTabProps {
  label: string;
  count?: number;
}

/**
 * Tab label + optional live count. Styling lives on the shared Ark trigger so
 * the underline indicator below the pair animates exactly like the issue
 * toolbar's All / My / Archived tabs.
 */
function FilterTabLabel({ label, count }: FilterTabProps) {
  return (
    <>
      {label}
      {count !== undefined && count > 0 ? (
        <span className="font-mono text-[10px] font-bold text-ds-text-muted tabular-nums">
          {count}
        </span>
      ) : null}
    </>
  );
}

export function NotificationsPanel({
  notifications,
  unreadCount,
  filter,
  onFilterChange,
  onOpen,
  onMarkAllRead,
  onClearAll,
  onDismiss,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  isLoading = false,
  error = null,
  onRetry,
  isMutating = false,
  isClearing = false,
  now,
  className,
}: NotificationsPanelProps) {
  const listId = useId();

  const groups =
    isLoading || error ? [] : groupNotificationsByDay(notifications, now);
  const isEmpty = !isLoading && !error && notifications.length === 0;
  const mutedActions = isLoading || Boolean(error);

  return (
    <div
      data-slot="notifications-panel"
      role="dialog"
      aria-label="Notifications"
      className={cn(
        'flex w-[400px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-ds-border bg-ds-surface',
        'shadow-[0_2px_4px_0_#1717170F,0_12px_28px_0_#17171726]',
        className,
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold tracking-[-0.2px] text-ds-text">
              Notifications
            </h2>
            {unreadCount > 0 ? (
              <span className="font-mono text-[11px] font-bold text-ds-brand tabular-nums">
                {unreadCount}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0 || mutedActions || isMutating}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5',
              'text-[11.5px] font-semibold text-ds-text-muted transition-colors',
              'hover:bg-ds-bg hover:text-ds-text focus-visible:ring-2 focus-visible:ring-ds-focus focus-visible:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-ds-text-muted',
            )}
          >
            <CheckCheck aria-hidden className="size-[13px]" />
            Mark all read
          </button>
        </div>

        <Tabs
          value={filter}
          onValueChange={(details) =>
            onFilterChange(details.value as NotificationFilter)
          }
          className="-ml-1.5"
        >
          <TabsList
            variant="underline"
            aria-label="Filter notifications"
            className="gap-4"
          >
            {(
              [
                { value: 'all', label: 'All' },
                { value: 'unread', label: 'Unread', count: unreadCount },
              ] as const
            ).map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-auto px-1.5 py-0.5 text-[12.5px] aria-selected:text-ds-text"
              >
                <FilterTabLabel
                  label={tab.label}
                  count={'count' in tab ? tab.count : undefined}
                />
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div aria-hidden className="h-px w-full bg-ds-border" />

      {/* ── List ───────────────────────────────────────────────────────── */}
      <div
        id={listId}
        role="tabpanel"
        aria-label={
          filter === 'all' ? 'All notifications' : 'Unread notifications'
        }
        className="min-h-0 flex-1 overflow-y-auto py-1"
      >
        {isLoading ? (
          Array.from({ length: 5 }, (_, index) => (
            <NotificationRowSkeleton key={index} />
          ))
        ) : error ? (
          <ErrorState
            title="Couldn't load notifications"
            description={
              error.message ||
              'We ran into a problem fetching your notifications. Try again in a moment.'
            }
            action={
              onRetry ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onRetry}
                  className="h-8 gap-2 rounded-md border-ds-border bg-ds-surface px-3 text-xs font-semibold text-foreground"
                >
                  <RotateCw className="size-3.5" />
                  Try again
                </Button>
              ) : undefined
            }
          />
        ) : isEmpty ? (
          filter === 'unread' ? (
            <EmptyState
              icon={CheckCheck}
              title="You're all caught up"
              description="No unread notifications. New assignments and mentions will show up here."
            />
          ) : (
            <EmptyState
              icon={CheckCheck}
              title="No notifications yet"
              description="Assignments and mentions land here, so nothing waits on you unnoticed."
            />
          )
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.label}>
                <div
                  data-slot="notification-group-label"
                  className="px-4 pt-[10px] pb-1 text-[10px] font-semibold tracking-[0.8px] text-ds-text-muted"
                >
                  {group.label}
                </div>
                <ul>
                  {group.notifications.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      onOpen={onOpen}
                      onDismiss={onDismiss}
                      now={now}
                      busy={isMutating}
                    />
                  ))}
                </ul>
              </div>
            ))}

            {hasMore && onLoadMore ? (
              <div className="flex justify-center px-4 py-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className="h-8 rounded-md px-3 text-xs font-semibold text-ds-text-muted hover:bg-ds-bg hover:text-ds-text"
                >
                  {isLoadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div aria-hidden className="h-px w-full bg-ds-border" />

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="h-11 shrink-0">
        <StatefulButton
          type="button"
          variant="ghost"
          size="sm"
          pressScale={1}
          onClick={onClearAll}
          disabled={mutedActions || isClearing}
          state={isClearing ? 'loading' : 'idle'}
          loadingText="Clearing…"
          icon={<Trash2 aria-hidden className="size-[13px]" />}
          className={cn(
            'h-full w-full rounded-none px-0 text-[12px] font-semibold text-ds-text-muted',
            'hover:bg-ds-bg hover:text-ds-text',
            'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-focus focus-visible:outline-none',
            '[&>span]:gap-1.5',
          )}
        >
          Clear all notifications
        </StatefulButton>
      </div>
    </div>
  );
}
