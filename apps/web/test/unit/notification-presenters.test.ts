import { describe, expect, it } from 'vitest';
import type { NotificationCard } from '@shipyard/shared';

import {
  avatarTone,
  formatNotificationTime,
  groupNotificationsByDay,
  initialsOf,
  isUnread,
  notificationActorName,
  notificationCopy,
  notificationGroupLabel,
  notificationHref,
} from '@/lib/notifications/presenters';

const NOW = new Date(2026, 8, 10, 12, 0, 0); // 10 Sep 2026, 12:00 local

function card(overrides: Partial<NotificationCard> = {}): NotificationCard {
  return {
    id: 'ntf_1',
    workspaceId: 'ws_1',
    type: 'ASSIGNMENT',
    actor: { userId: 'usr_1', name: 'Ana Ruiz', image: null },
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
    createdAt: new Date(2026, 8, 10, 11, 55).toISOString(),
    ...overrides,
  };
}

describe('notification presenters', () => {
  describe('notificationCopy', () => {
    it('renders the assignment verb from type + actor + issue', () => {
      const copy = notificationCopy(card());
      expect(copy.actorName).toBe('Ana Ruiz');
      expect(copy.verb).toBe('assigned you to');
      expect(copy.identifier).toBe('SHIP-134');
      expect(copy.title).toBe('Add Stripe payment intent flow');
      expect(copy.sentence).toBe(
        'Ana Ruiz assigned you to SHIP-134 — Add Stripe payment intent flow',
      );
    });

    it('renders the mention verb', () => {
      const copy = notificationCopy(
        card({ type: 'MENTION', commentId: 'cmt_1' }),
      );
      expect(copy.verb).toBe('mentioned you in');
    });

    it('falls back to "Former member" when the actor was deleted', () => {
      const copy = notificationCopy(card({ actor: null }));
      expect(copy.actorName).toBe('Former member');
      expect(copy.sentence.startsWith('Former member assigned you to')).toBe(
        true,
      );
    });

    it('treats a blank actor name as former member', () => {
      expect(
        notificationActorName({ userId: 'usr_1', name: '  ', image: null }),
      ).toBe('Former member');
    });
  });

  describe('notificationHref', () => {
    it('points at the issue for assignments', () => {
      expect(notificationHref(card())).toBe('/w/harbor/issues/iss_134');
    });

    it('deep-links to the comment for mentions', () => {
      expect(
        notificationHref(card({ type: 'MENTION', commentId: 'cmt_981' })),
      ).toBe('/w/harbor/issues/iss_134#comment-cmt_981');
    });

    it('falls back to the issue when a mention has no comment id', () => {
      expect(notificationHref(card({ type: 'MENTION', commentId: null }))).toBe(
        '/w/harbor/issues/iss_134',
      );
    });
  });

  describe('isUnread', () => {
    it('is true only while readAt is null', () => {
      expect(isUnread(card())).toBe(true);
      expect(isUnread(card({ readAt: NOW.toISOString() }))).toBe(false);
    });
  });

  describe('initialsOf', () => {
    it('uses the first and last word', () => {
      expect(initialsOf('Ana Ruiz')).toBe('AR');
      expect(initialsOf('Yonatane M.')).toBe('YM');
      expect(initialsOf('Sam')).toBe('S');
      expect(initialsOf('   ')).toBe('?');
    });
  });

  describe('avatarTone', () => {
    it('is deterministic per seed', () => {
      expect(avatarTone('usr_ana')).toBe(avatarTone('usr_ana'));
    });

    it('never reaches for semantic status tones', () => {
      const tones = ['usr_ana', 'usr_chen', 'usr_sam', 'usr_yonatane'].map(
        avatarTone,
      );
      for (const tone of tones) {
        expect(['bg-ds-brand', 'bg-ds-info', 'bg-ds-success']).toContain(tone);
      }
    });
  });

  describe('formatNotificationTime', () => {
    it.each([
      ['Now', new Date(2026, 8, 10, 11, 59, 30)],
      ['5m', new Date(2026, 8, 10, 11, 55)],
      ['1h', new Date(2026, 8, 10, 10, 30)],
      ['Yesterday', new Date(2026, 8, 9, 6, 0)],
      ['2d', new Date(2026, 8, 8, 12, 0)],
    ])('renders %s', (expected, createdAt) => {
      expect(formatNotificationTime(createdAt.toISOString(), NOW)).toBe(
        expected,
      );
    });

    it('returns an empty string for an unparseable timestamp', () => {
      expect(formatNotificationTime('not-a-date', NOW)).toBe('');
    });
  });

  describe('grouping', () => {
    it('labels today, yesterday and older buckets', () => {
      expect(
        notificationGroupLabel(new Date(2026, 8, 10, 1).toISOString(), NOW),
      ).toBe('Today');
      expect(
        notificationGroupLabel(new Date(2026, 8, 9, 23).toISOString(), NOW),
      ).toBe('Yesterday');
      expect(
        notificationGroupLabel(new Date(2026, 8, 4, 12).toISOString(), NOW),
      ).toBe('Earlier');
    });

    it('buckets newest-first input without reordering it', () => {
      const groups = groupNotificationsByDay(
        [
          card({
            id: 'a',
            createdAt: new Date(2026, 8, 10, 11, 0).toISOString(),
          }),
          card({
            id: 'b',
            createdAt: new Date(2026, 8, 10, 9, 0).toISOString(),
          }),
          card({
            id: 'c',
            createdAt: new Date(2026, 8, 9, 9, 0).toISOString(),
          }),
          card({
            id: 'd',
            createdAt: new Date(2026, 8, 2, 9, 0).toISOString(),
          }),
        ],
        NOW,
      );

      expect(groups.map((group) => group.label)).toEqual([
        'Today',
        'Yesterday',
        'Earlier',
      ]);
      expect(groups[0]?.notifications.map((n) => n.id)).toEqual(['a', 'b']);
      expect(groups[1]?.notifications.map((n) => n.id)).toEqual(['c']);
      expect(groups[2]?.notifications.map((n) => n.id)).toEqual(['d']);
    });

    it('returns nothing for an empty list', () => {
      expect(groupNotificationsByDay([], NOW)).toEqual([]);
    });
  });
});
