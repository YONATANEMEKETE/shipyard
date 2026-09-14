'use client';

import { Archive, X } from 'lucide-react';
import { type MouseEvent } from 'react';
import type { NotificationCard } from '@shipyard/shared';

import {
  avatarTone,
  formatNotificationTime,
  initialsOf,
  isUnread,
  notificationActorName,
  notificationCopy,
} from '@/lib/notifications/presenters';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Notification row — one card from the panel walk.
//
// Geometry mirrors `shipyard.pen` → Notification Row (tGEFQ / o47zz):
//   [avatar 28] [copy column fill] [unread dot 7] [relative time]
// Copy column is two lines: "Ana Ruiz assigned you to SHIP-134" over the issue
// title. The row is one button so the whole surface is the target; the optional
// dismiss control is a sibling inside the <li>, never nested in the button.
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationRowProps {
  notification: NotificationCard;
  /** Open the related issue (marks read server-side; mention scrolls to the comment). */
  onOpen: (notification: NotificationCard) => void;
  /** Present only when per-row dismissal is wired; hidden entirely otherwise. */
  onDismiss?: (notification: NotificationCard) => void;
  /** Injected for deterministic tests; defaults to now. */
  now?: Date;
  /** Dims the row while a write is in flight. */
  busy?: boolean;
  className?: string;
}

export function NotificationRow({
  notification,
  onOpen,
  onDismiss,
  now,
  busy = false,
  className,
}: NotificationRowProps) {
  const unread = isUnread(notification);
  const copy = notificationCopy(notification);
  const actorName = notificationActorName(notification.actor);
  const time = formatNotificationTime(notification.createdAt, now);
  const archived = notification.issue.archivedAt !== null;

  const accessibleName = [
    copy.sentence,
    time ? `, ${time} ago` : '',
    unread ? ', unread' : '',
    archived ? ', archived issue' : '',
  ].join('');

  function handleOpen(): void {
    onOpen(notification);
  }

  function handleDismiss(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onDismiss?.(notification);
  }

  return (
    <li
      data-unread={unread || undefined}
      className={cn('group relative', busy && 'opacity-60', className)}
    >
      <button
        type="button"
        onClick={handleOpen}
        aria-label={accessibleName}
        className={cn(
          'flex w-full items-center gap-[10px] py-[11px] pl-4 text-left transition-colors',
          onDismiss ? 'pr-[38px]' : 'pr-[14px]',
          'hover:bg-ds-bg/70 focus-visible:bg-ds-bg/70 focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-focus',
        )}
      >
        {/* Actor avatar — image when the actor has one, initials otherwise. */}
        <span
          aria-hidden
          className={cn(
            'grid size-7 shrink-0 place-items-center overflow-hidden rounded-full font-mono text-[9px] font-bold text-white',
            avatarTone(notification.actor?.userId ?? 'former-member'),
          )}
        >
          {notification.actor?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={notification.actor.image}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            initialsOf(actorName)
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-[12.5px] font-semibold text-ds-text">
              {actorName}
            </span>
            <span className="shrink-0 text-[12.5px] text-ds-text-muted">
              {copy.verb}
            </span>
            <span className="shrink-0 font-mono text-[11px] font-semibold text-ds-text">
              {copy.identifier}
            </span>
            {archived ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ds-border px-1.5 py-px text-[9px] font-semibold tracking-[0.4px] text-ds-text-muted uppercase">
                <Archive aria-hidden className="size-2.5" />
                Archived
              </span>
            ) : null}
          </span>
          <span className="truncate text-[11.5px] text-ds-text-muted">
            {copy.title}
          </span>
        </span>

        {unread ? (
          <span
            aria-hidden
            className="size-[7px] shrink-0 rounded-full bg-ds-brand"
          />
        ) : null}

        <span className="shrink-0 text-[10.5px] text-ds-text-muted tabular-nums">
          {time}
        </span>
      </button>

      {onDismiss ? (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={`Dismiss notification: ${copy.sentence}`}
          className={cn(
            'absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md',
            'border border-ds-border bg-ds-surface text-ds-text-muted',
            'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
            'hover:text-ds-danger focus-visible:ring-2 focus-visible:ring-ds-focus focus-visible:outline-none',
            'max-sm:opacity-100',
          )}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </li>
  );
}
