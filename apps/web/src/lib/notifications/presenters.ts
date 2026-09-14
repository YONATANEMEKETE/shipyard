import type {
  NotificationActorCard,
  NotificationCard,
  NotificationType,
} from '@shipyard/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Notification presenters — pure functions over the API card (F6)
//
// Copy is client-owned by design: the API ships facts (type + actor + issue),
// never sentences (spec Q1). Everything here derives from `NotificationCard`,
// so the panel and its tests read the same source of truth and there is no
// server-side copy to version.
// ─────────────────────────────────────────────────────────────────────────────

/** The verb fragment per event type. */
export const NOTIFICATION_VERB: Record<NotificationType, string> = {
  ASSIGNMENT: 'assigned you to',
  MENTION: 'mentioned you in',
};

/** Rendered when `actorId IS NULL` — the actor was deleted (D5). */
export const FORMER_MEMBER_NAME = 'Former member';

export function isUnread(card: Pick<NotificationCard, 'readAt'>): boolean {
  return card.readAt === null;
}

export function notificationActorName(
  actor: NotificationActorCard | null,
): string {
  const name = actor?.name?.trim();
  return name ? name : FORMER_MEMBER_NAME;
}

export interface NotificationCopy {
  actorName: string;
  verb: string;
  identifier: string;
  title: string;
  /**
   * One flat sentence for assistive tech. Visually the row is three nodes
   * (name / verb / identifier) on one line plus the issue title on the next —
   * a screen reader should hear a single sentence, not four fragments.
   */
  sentence: string;
}

export function notificationCopy(card: NotificationCard): NotificationCopy {
  const actorName = notificationActorName(card.actor);
  const verb = NOTIFICATION_VERB[card.type];
  const { identifier, title } = card.issue;

  return {
    actorName,
    verb,
    identifier,
    title,
    sentence: `${actorName} ${verb} ${identifier} — ${title}`,
  };
}

/**
 * Navigation target (api-design §8.5). Mentions scroll to their comment;
 * archived issues land on the same URL read-only.
 */
export function notificationHref(card: NotificationCard): string {
  const base = `/w/${card.issue.workspaceSlug}/issues/${card.issue.id}`;
  return card.type === 'MENTION' && card.commentId
    ? `${base}#comment-${card.commentId}`
    : base;
}

// ── Avatar ──

/** Two-letter initials: first letter of the first and last word. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * Deterministic avatar tone, so the same person keeps the same colour across
 * sessions and rows. Brand / info / success only — warning and danger stay
 * reserved for status, never decoration.
 */
const AVATAR_TONES = ['bg-ds-brand', 'bg-ds-info', 'bg-ds-success'] as const;

export function avatarTone(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100_000;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length] ?? AVATAR_TONES[0];
}

// ── Time ──

function startOfLocalDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compact relative time matching the panel's timestamp column:
 * `Now` · `5m` · `3h` · `Yesterday` · `2d`.
 */
export function formatNotificationTime(
  createdAt: string,
  now: Date = new Date(),
): string {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return '';

  const minutes = Math.floor((now.getTime() - created.getTime()) / 60_000);
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(created)) / DAY_MS,
  );
  if (days <= 1) return 'Yesterday';
  return `${days}d`;
}

// ── Day grouping ──

export type NotificationGroupLabel = 'Today' | 'Yesterday' | 'Earlier';

export interface NotificationGroup {
  label: NotificationGroupLabel;
  notifications: NotificationCard[];
}

export function notificationGroupLabel(
  createdAt: string,
  now: Date = new Date(),
): NotificationGroupLabel {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 'Earlier';

  const days = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(created)) / DAY_MS,
  );
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return 'Earlier';
}

/**
 * Group the server's newest-first page(s) into date buckets, preserving input
 * order inside each bucket. The server is the only orderer — this never sorts.
 */
export function groupNotificationsByDay(
  cards: NotificationCard[],
  now: Date = new Date(),
): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const byLabel = new Map<NotificationGroupLabel, NotificationGroup>();

  for (const card of cards) {
    const label = notificationGroupLabel(card.createdAt, now);
    let group = byLabel.get(label);
    if (!group) {
      group = { label, notifications: [] };
      byLabel.set(label, group);
      groups.push(group);
    }
    group.notifications.push(card);
  }

  return groups;
}
