import { prisma } from '../../common/db/client.js';
import type { Prisma } from '../../generated/client.js';
import { issueInclude } from '../issues/repository.js';

/**
 * Dashboard repository — Prisma access only. The `issue_view` trail is the
 * only table this module owns (dashboard data-model D1); the batched helper
 * reads (trail issue join, actor cards, project progress counts) exist so
 * the service composes panels with flat queries and zero N+1 (§6).
 */

export type DbClient = Prisma.TransactionClient | typeof prisma;

/** Personal trail cap per (user, workspace) — oldest-first pruning (D2). */
export const TRAIL_CAP = 50;

/** Trail row with its live issue graph (card mapping happens in the service). */
export type TrailRow = Prisma.IssueViewGetPayload<{
  include: { issue: { include: ReturnType<typeof issueInclude> } };
}>;

export const dashboardRepository = {
  // ── Trail read (own table ⨝ live issues, §6.2) ─────────────────────────

  /**
   * Top-N trail rows for the signed-in user, newest view first. The issue
   * join is via a required FK — cascaded deletions simply drop out.
   */
  recentTrail(
    client: DbClient,
    args: { userId: string; workspaceId: string; limit: number },
  ): Promise<TrailRow[]> {
    return client.issueView.findMany({
      where: { userId: args.userId, workspaceId: args.workspaceId },
      orderBy: [{ viewedAt: 'desc' }, { issueId: 'desc' }],
      take: args.limit,
      include: { issue: { include: issueInclude() } },
    });
  },

  // ── Trail recording (the only write, §6.1 — called from issues detail) ──

  /**
   * Upsert-bump + prune in one transaction (D2): the visit bumps `viewedAt`
   * to now; rows past the 50 newest for (user, workspace) are deleted
   * oldest-first. One indexed statement pair keyed off the
   * (userId, workspaceId, viewedAt) index.
   */
  async recordView(
    client: DbClient,
    args: { userId: string; issueId: string; workspaceId: string },
  ): Promise<void> {
    const viewedAt = new Date();
    await client.$transaction(async (tx) => {
      await tx.issueView.upsert({
        where: {
          userId_issueId: { userId: args.userId, issueId: args.issueId },
        },
        create: {
          userId: args.userId,
          issueId: args.issueId,
          workspaceId: args.workspaceId,
          viewedAt,
        },
        update: { viewedAt, workspaceId: args.workspaceId },
      });
      const keep = await tx.issueView.findMany({
        where: { userId: args.userId, workspaceId: args.workspaceId },
        orderBy: [{ viewedAt: 'desc' }, { issueId: 'desc' }],
        take: TRAIL_CAP,
        select: { issueId: true },
      });
      if (keep.length < TRAIL_CAP) return;
      await tx.issueView.deleteMany({
        where: {
          userId: args.userId,
          workspaceId: args.workspaceId,
          issueId: { notIn: keep.map((row) => row.issueId) },
        },
      });
    });
  },

  // ── Batched lookups for the hub feed and project progress (§6.4) ───────

  /** Actor cards in one query — never per item. */
  findUsersByIds(client: DbClient, userIds: string[]) {
    if (userIds.length === 0) return Promise.resolve([]);
    return client.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, image: true },
    });
  },

  /** Total non-archived issues per project, one groupBy (mirrors F7 D8). */
  countIssuesByProject(
    client: DbClient,
    workspaceId: string,
    projectIds: string[],
  ) {
    if (projectIds.length === 0)
      return Promise.resolve(
        [] as { projectId: string | null; _count: { _all: number } }[],
      );
    return client.issue.groupBy({
      by: ['projectId'],
      where: { workspaceId, projectId: { in: projectIds }, archivedAt: null },
      _count: { _all: true },
    });
  },

  /** Done non-archived issues per project, one groupBy. */
  countDoneByProject(
    client: DbClient,
    workspaceId: string,
    projectIds: string[],
  ) {
    if (projectIds.length === 0)
      return Promise.resolve(
        [] as { projectId: string | null; _count: { _all: number } }[],
      );
    return client.issue.groupBy({
      by: ['projectId'],
      where: {
        workspaceId,
        projectId: { in: projectIds },
        archivedAt: null,
        status: 'DONE',
      },
      _count: { _all: true },
    });
  },
};

export type DashboardRepository = typeof dashboardRepository;
