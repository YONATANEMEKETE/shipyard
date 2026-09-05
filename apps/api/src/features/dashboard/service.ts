import type {
  Dashboard,
  DashboardActivityItem,
  DashboardActivityKind,
  IssueAssigneeCard,
  ProjectCard,
} from '@shipyard/shared';
import type { ActivityEventCard, ActivityKind } from '@shipyard/shared';
import { prisma } from '../../common/db/client.js';
import { resolveImageUrl } from '../../common/storage/imageUrl.js';
import { issuesService } from '../issues/service.js';
import { cyclesService } from '../cycles/service.js';
import { projectsService } from '../projects/service.js';
import { commentsService } from '../comments/service.js';
import { activityService } from '../activity/service.js';
import { dashboardRepository, type TrailRow } from './repository.js';

/**
 * Dashboard service — orchestration only (api-design §3.2/§8.1): one
 * bounded parallel fan-out over the owning modules' public query services,
 * then assembly. NO domain rules live here (D7 — personal/workspace scoping
 * falls out of the callees' own filters) and NO cross-module Prisma except
 * the module-owned `issue_view` + its batched helper reads.
 *
 * Panels are read in parallel without a shared snapshot transaction — two
 * panels may straddle a concurrent write by milliseconds. Accepted in MVP
 * (navigation-time page, no polling); documented, not hidden (§5.1).
 */

// ── Bounds (spec Q3 resolved — locked product decisions, not user prefs) ──
//
// My Work 10/10 and Active Projects cap 20 are enforced by their owning
// services (issuesService.listMyWork / projectsService.listActive); the
// trail and feed bounds live here with the queries they bound.

const RECENT_LIMIT = 10; // of the capped-50 trail
const ACTIVITY_LIMIT = 20; // display cap, newest-first

/**
 * Hub feed sources (D4 as migrated onto the Activity Log, §8.4 of its
 * api-design): activity rows for the issue/comment kinds the panel contract
 * declares. Lifecycle deletions (ISSUE_DELETED/COMMENT_DELETED) are
 * intentionally outside the closed kind set; project/cycle kinds arrive
 * with a future panel-contract extension.
 */
const ACTIVITY_SOURCE_KINDS: ActivityKind[] = [
  'ISSUE_CREATED',
  'ISSUE_STATUS_CHANGED',
  'ISSUE_ASSIGNED',
  'ISSUE_BLOCKED_SET',
  'ISSUE_BLOCKED_CLEARED',
  'ISSUE_ARCHIVED',
  'ISSUE_RESTORED',
  'COMMENT_CREATED',
];

/**
 * Activity kind → panel kind mapping. The ISSUE_PLANNING_CHANGED bucket is
 * a contract slot for future priority/project/cycle/due/title emissions —
 * the current activity taxonomy has no such kinds, so nothing maps to it
 * yet. Rows with an unmapped kind are skipped (future-proof, never crash).
 */
const KIND_MAP: Partial<Record<ActivityKind, DashboardActivityKind>> = {
  ISSUE_CREATED: 'ISSUE_CREATED',
  ISSUE_STATUS_CHANGED: 'ISSUE_STATUS_CHANGED',
  ISSUE_ASSIGNED: 'ISSUE_ASSIGNED',
  ISSUE_BLOCKED_SET: 'ISSUE_BLOCKED_SET',
  ISSUE_BLOCKED_CLEARED: 'ISSUE_BLOCKED_CLEARED',
  ISSUE_ARCHIVED: 'ISSUE_ARCHIVED',
  ISSUE_RESTORED: 'ISSUE_RESTORED',
  COMMENT_CREATED: 'COMMENT_CREATED',
};

// ── Panel mappers ──────────────────────────────────────────────────────────

function trailItemOf(
  row: TrailRow,
): Dashboard['myWork']['recentlyViewed'][number] {
  // Card mapping reuses the issues module's code path (one mapping, no
  // drift); `viewedAt` is the trail's recency position.
  return {
    ...issuesService.cardOf(row.issue),
    viewedAt: row.viewedAt.toISOString(),
  };
}

function progressOf(
  cards: ProjectCard[],
  totals: Map<string, number>,
  dones: Map<string, number>,
): Map<string, Dashboard['activeProjects'][number]['progress']> {
  const result = new Map<
    string,
    Dashboard['activeProjects'][number]['progress']
  >();
  for (const card of cards) {
    const total = totals.get(card.id) ?? 0;
    const completed = dones.get(card.id) ?? 0;
    result.set(card.id, {
      total,
      completed,
      percent: total === 0 ? null : Math.round((completed / total) * 100),
    });
  }
  return result;
}

interface IssueRef {
  id: string;
  identifier: string;
  title: string;
}

/**
 * Activity rows → hub feed items (§6.4): batch-resolve issue refs (live
 * issues only — deleted issues drop out, no dead links), comment refs, and
 * actor cards in one query each. Rows whose issue can no longer be resolved
 * are dropped; actor-deleted rows keep rendering with a null actor (the
 * "former member" fallback).
 */
async function activityItemsOf(
  workspaceId: string,
  events: ActivityEventCard[],
): Promise<DashboardActivityItem[]> {
  const issueIds = [
    ...new Set(
      events
        .filter((event) => event.kind !== 'COMMENT_CREATED')
        .map((event) => event.entityId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const commentIds = [
    ...new Set(
      events
        .filter((event) => event.kind === 'COMMENT_CREATED')
        .map((event) => event.entityId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const actorIds = [
    ...new Set(
      events.map((event) => event.actorId).filter((id): id is string => !!id),
    ),
  ];

  const [issueRefs, rawCommentRefs, users] = await Promise.all([
    issuesService.getIssueRefs(workspaceId, issueIds),
    commentsService.resolveIssueRefs(workspaceId, commentIds),
    dashboardRepository.findUsersByIds(prisma, actorIds),
  ]);

  // Normalize comment refs to the same IssueRef shape as issue refs.
  const commentRefs = new Map<string, IssueRef>(
    [...rawCommentRefs].map(([commentId, ref]) => [
      commentId,
      { id: ref.issueId, identifier: ref.identifier, title: ref.title },
    ]),
  );

  const actorCards = new Map<string, IssueAssigneeCard>(
    users.map((user) => [
      user.id,
      {
        userId: user.id,
        name: user.name,
        email: user.email,
        image: resolveImageUrl(user.image),
      },
    ]),
  );

  const items: DashboardActivityItem[] = [];
  for (const event of events) {
    const kind = KIND_MAP[event.kind];
    if (!kind) continue;
    const ref =
      kind === 'COMMENT_CREATED'
        ? commentRefs.get(event.entityId ?? '')
        : issueRefs.get(event.entityId ?? '');
    if (!ref) continue; // dead link — source issue gone via cascade
    items.push({
      kind,
      actor: event.actorId ? (actorCards.get(event.actorId) ?? null) : null,
      issue: ref,
      workspaceId,
      commentId: kind === 'COMMENT_CREATED' ? event.entityId : null,
      text: event.summary,
      createdAt: event.createdAt,
    });
  }
  return items;
}

export const dashboardService = {
  /**
   * The composed payload (api-design §8.1): one request, four panels, fixed
   * fan-out of six bounded queries max — no N+1, no shared snapshot tx. Any
   * leg throwing fails the whole request (500 via the global handler) — a
   * half-composed hub misleads more than an honest error page (§7).
   */
  async compose(workspaceId: string, userId: string): Promise<Dashboard> {
    const [myWork, trail, currentCycle, activeProjects, events] =
      await Promise.all([
        issuesService.listMyWork(workspaceId, userId),
        dashboardRepository.recentTrail(prisma, {
          userId,
          workspaceId,
          limit: RECENT_LIMIT,
        }),
        cyclesService.getActive(workspaceId),
        projectsService.listActive(workspaceId),
        activityService.listRecent(
          workspaceId,
          ACTIVITY_SOURCE_KINDS,
          ACTIVITY_LIMIT,
        ),
      ]);

    // Second bounded leg: batched lookups for the feed + per-project
    // progress counts (two groupBys over the ≤20-card cap — still flat).
    const [recentActivity, totals, dones] = await Promise.all([
      activityItemsOf(workspaceId, events),
      dashboardRepository
        .countIssuesByProject(
          prisma,
          workspaceId,
          activeProjects.map((card) => card.id),
        )
        .then(
          (rows) =>
            new Map(
              rows
                .filter(
                  (
                    row,
                  ): row is { projectId: string; _count: { _all: number } } =>
                    row.projectId !== null,
                )
                .map((row) => [row.projectId, row._count._all] as const),
            ),
        ),
      dashboardRepository
        .countDoneByProject(
          prisma,
          workspaceId,
          activeProjects.map((card) => card.id),
        )
        .then(
          (rows) =>
            new Map(
              rows
                .filter(
                  (
                    row,
                  ): row is { projectId: string; _count: { _all: number } } =>
                    row.projectId !== null,
                )
                .map((row) => [row.projectId, row._count._all] as const),
            ),
        ),
    ]);

    const progress = progressOf(activeProjects, totals, dones);

    return {
      workspaceId,
      myWork: {
        assigned: myWork.assigned,
        created: myWork.created,
        recentlyViewed: trail.map(trailItemOf),
      },
      currentCycle,
      activeProjects: activeProjects.map((card) => ({
        ...card,
        progress: progress.get(card.id) ?? {
          total: 0,
          completed: 0,
          percent: null,
        },
      })),
      recentActivity,
    };
  },
};

export type DashboardService = typeof dashboardService;
