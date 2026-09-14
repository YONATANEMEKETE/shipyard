import type { NotificationCard } from '@shipyard/shared';

import { isUnread } from '@/lib/notifications/presenters';

// ─────────────────────────────────────────────────────────────────────────────
// Mock notifications — mirror the exact `NotificationCard` shape the API
// returns from `GET /api/v1/notifications` (packages/shared/src/notifications).
//
// Same posture as `issues-mock.ts`: hand-written fixtures that satisfy the
// contract, used to build and review the panel before the API is wired in.
// Cards are newest-first, exactly as the server orders them.
// Rows mirror `shipyard.pen` → Element / Notifications Panel (ybtrP).
// ─────────────────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'ws_mock';
const WORKSPACE_SLUG = 'harbor';

const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

/** A timestamp on a previous local calendar day, at a fixed clock time. */
const daysAgo = (days: number, hours: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hours, 30, 0, 0);
  return date.toISOString();
};

function issue(
  id: string,
  identifier: string,
  title: string,
  archivedAt: string | null = null,
) {
  return {
    id,
    identifier,
    title,
    workspaceId: WORKSPACE_ID,
    workspaceSlug: WORKSPACE_SLUG,
    archivedAt,
  };
}

function actor(userId: string, name: string, image: string | null = null) {
  return { userId, name, image };
}

export const MOCK_NOTIFICATIONS: NotificationCard[] = [
  {
    id: 'ntf_134',
    workspaceId: WORKSPACE_ID,
    type: 'ASSIGNMENT',
    actor: actor('usr_ana', 'Ana Ruiz'),
    issue: issue('iss_134', 'SHIP-134', 'Add Stripe payment intent flow'),
    commentId: null,
    readAt: null,
    createdAt: minutesAgo(5),
  },
  {
    id: 'ntf_124',
    workspaceId: WORKSPACE_ID,
    type: 'MENTION',
    actor: actor('usr_chen', 'Chen Kim'),
    issue: issue(
      'iss_124',
      'SHIP-124',
      'Fix login redirect after OAuth callback',
    ),
    commentId: 'cmt_981',
    readAt: null,
    createdAt: minutesAgo(60),
  },
  {
    id: 'ntf_127',
    workspaceId: WORKSPACE_ID,
    type: 'MENTION',
    actor: actor('usr_sam', 'Sam Park'),
    issue: issue('iss_127', 'SHIP-127', 'Invoice PDF export service'),
    commentId: 'cmt_944',
    readAt: minutesAgo(90),
    createdAt: minutesAgo(120),
  },
  {
    id: 'ntf_123',
    workspaceId: WORKSPACE_ID,
    type: 'ASSIGNMENT',
    actor: actor('usr_yonatane', 'Yonatane M.'),
    issue: issue('iss_123', 'SHIP-123', 'OAuth callback errors'),
    commentId: null,
    readAt: minutesAgo(120),
    createdAt: minutesAgo(180),
  },
  {
    id: 'ntf_119',
    workspaceId: WORKSPACE_ID,
    type: 'MENTION',
    actor: actor('usr_ana', 'Ana Ruiz'),
    issue: issue('iss_119', 'SHIP-119', 'Archive restore trip'),
    commentId: 'cmt_902',
    readAt: minutesAgo(180),
    createdAt: minutesAgo(300),
  },
  {
    id: 'ntf_122',
    workspaceId: WORKSPACE_ID,
    type: 'ASSIGNMENT',
    actor: actor('usr_chen', 'Chen Kim'),
    // Archived on purpose — exercises the read-only hint on the row.
    issue: issue(
      'iss_122',
      'SHIP-122',
      'Authored empty-state copy',
      daysAgo(3, 11),
    ),
    commentId: null,
    readAt: minutesAgo(1_500),
    createdAt: daysAgo(1, 16),
  },
  {
    id: 'ntf_126',
    workspaceId: WORKSPACE_ID,
    type: 'MENTION',
    actor: actor('usr_sam', 'Sam Park'),
    issue: issue('iss_126', 'SHIP-126', 'Cycle progress derivation'),
    commentId: 'cmt_877',
    readAt: minutesAgo(2_800),
    createdAt: daysAgo(2, 9),
  },
];

/** Derived, never hard-coded — the badge and the panel must agree. */
export const MOCK_UNREAD_COUNT = MOCK_NOTIFICATIONS.filter(isUnread).length;
