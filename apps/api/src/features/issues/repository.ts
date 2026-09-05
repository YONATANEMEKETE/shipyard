import { prisma } from '../../common/db/client.js';
import type { Prisma } from '../../generated/client.js';

/**
 * Issues repository — Prisma access only. No business decisions live here.
 * All workspace-scoped callers pass workspaceId explicitly; no implicit
 * context. Transaction-aware overloads accept an explicit `tx` client.
 */

export type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Full issue graph for card/detail mapping in one query (no N+1):
 * assignee + creator user cards and labels inline so the board needs no
 * second fetch.
 */
export function issueInclude() {
  return {
    assignee: { select: { id: true, name: true, email: true, image: true } },
    creator: { select: { id: true, name: true, email: true, image: true } },
    labels: { include: { label: true }, orderBy: { label: { name: 'asc' } } },
  } satisfies Prisma.IssueInclude;
}

/** Row shape returned by every issue query (via {@link issueInclude}). */
export type IssueRow = Prisma.IssueGetPayload<{
  include: ReturnType<typeof issueInclude>;
}>;

export function historyInclude() {
  return {
    actor: { select: { id: true, name: true, email: true, image: true } },
  } satisfies Prisma.IssueHistoryInclude;
}

export type HistoryRow = Prisma.IssueHistoryGetPayload<{
  include: ReturnType<typeof historyInclude>;
}>;

export interface ListIssuesArgs {
  workspaceId: string;
  where: Prisma.IssueWhereInput;
  orderBy: Prisma.IssueOrderByWithRelationInput[];
  take: number;
  skip?: number;
  cursor?: { id: string };
}

export interface ListHistoryArgs {
  workspaceId: string;
  issueId: string;
  take: number;
  skip?: number;
  cursor?: { id: string };
}

export const issuesRepository = {
  // ── Issues ─────────────────────────────────────────────────────────────

  listIssues(client: DbClient, args: ListIssuesArgs) {
    return client.issue.findMany({
      where: { workspaceId: args.workspaceId, ...args.where },
      include: issueInclude(),
      orderBy: args.orderBy,
      take: args.take,
      ...(args.skip !== undefined ? { skip: args.skip } : {}),
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
    });
  },

  /** Unpaginated fetch for the priority-rank sort (ranked in the service). */
  listIssuesForPrioritySort(
    client: DbClient,
    args: { workspaceId: string; where: Prisma.IssueWhereInput },
  ) {
    return client.issue.findMany({
      where: { workspaceId: args.workspaceId, ...args.where },
      include: issueInclude(),
      // Cap: priority sort is ranked in memory (Postgres enums don't carry
      // the D9 rank). Workspaces past this cap still paginate — the service
      // slices the ranked window. Raised if F10 search changes the shape.
      take: 1000,
    });
  },

  findByIdScoped(client: DbClient, id: string, workspaceId: string) {
    return client.issue.findFirst({
      where: { id, workspaceId },
      include: issueInclude(),
    });
  },

  /** Batch refs for the F9 hub activity feed (no N+1). */
  findIssuesByIdsScoped(client: DbClient, workspaceId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return client.issue.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true, seqNumber: true, title: true },
    });
  },

  createIssue(
    client: DbClient,
    data: {
      workspaceId: string;
      seqNumber: number;
      title: string;
      description: string | null;
      status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'DONE';
      priority: 'NO_PRIORITY' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
      assigneeId: string | null;
      creatorId: string;
      projectId: string | null;
      dueDate: Date | null;
    },
  ) {
    return client.issue.create({ data, include: issueInclude() });
  },

  updateIssue(
    client: DbClient,
    id: string,
    data: {
      title?: string;
      description?: string | null;
      status?: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'DONE';
      priority?: 'NO_PRIORITY' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
      assigneeId?: string | null;
      projectId?: string | null;
      cycleId?: string | null;
      dueDate?: Date | null;
      blocked?: boolean;
      blockedReason?: string | null;
      archivedAt?: Date | null;
    },
  ) {
    return client.issue.update({
      where: { id },
      data,
      include: issueInclude(),
    });
  },

  removeIssue(client: DbClient, id: string) {
    return client.issue.delete({ where: { id } });
  },

  // ── Sequence (D2 atomic allocation) ────────────────────────────────────

  /**
   * Atomically allocates the next per-workspace seqNumber. The upsert +
   * increment is a single row-level atomic op: concurrent creates never
   * receive the same number, and delete never reuses (the counter only
   * moves forward).
   */
  async allocateSeqNumber(
    client: DbClient,
    workspaceId: string,
  ): Promise<number> {
    const row = await client.workspaceIssueSequence.upsert({
      where: { workspaceId },
      create: { workspaceId, nextNumber: 2 },
      update: { nextNumber: { increment: 1 } },
      select: { nextNumber: true },
    });
    return row.nextNumber - 1;
  },

  // ── Labels ─────────────────────────────────────────────────────────────

  listLabels(client: DbClient, workspaceId: string) {
    return client.label.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
    });
  },

  findLabelByIdScoped(client: DbClient, id: string, workspaceId: string) {
    return client.label.findFirst({ where: { id, workspaceId } });
  },

  /** Friendly pre-check on the D6 functional index; the DB index is the backstop. */
  findLabelByNameInWorkspace(
    client: DbClient,
    workspaceId: string,
    name: string,
  ) {
    return client.label.findFirst({
      where: { workspaceId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
  },

  findLabelsByIdsInWorkspace(
    client: DbClient,
    workspaceId: string,
    ids: string[],
  ) {
    return client.label.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true },
    });
  },

  createLabel(
    client: DbClient,
    data: { workspaceId: string; name: string; color: string },
  ) {
    return client.label.create({ data });
  },

  updateLabel(
    client: DbClient,
    id: string,
    data: { name?: string; color?: string },
  ) {
    return client.label.update({ where: { id }, data });
  },

  countLabelJoins(client: DbClient, labelId: string) {
    return client.issueLabel.count({ where: { labelId } });
  },

  removeLabel(client: DbClient, id: string) {
    return client.label.delete({ where: { id } });
  },

  // ── Joins ──────────────────────────────────────────────────────────────

  findJoin(client: DbClient, issueId: string, labelId: string) {
    return client.issueLabel.findUnique({
      where: { issueId_labelId: { issueId, labelId } },
      select: { issueId: true, labelId: true },
    });
  },

  createJoin(client: DbClient, issueId: string, labelId: string) {
    return client.issueLabel.create({ data: { issueId, labelId } });
  },

  removeJoin(client: DbClient, issueId: string, labelId: string) {
    return client.issueLabel.delete({
      where: { issueId_labelId: { issueId, labelId } },
    });
  },

  // ── History ────────────────────────────────────────────────────────────

  listHistory(client: DbClient, args: ListHistoryArgs) {
    return client.issueHistory.findMany({
      where: { workspaceId: args.workspaceId, issueId: args.issueId },
      include: historyInclude(),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: args.take,
      ...(args.skip !== undefined ? { skip: args.skip } : {}),
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
    });
  },

  createHistory(
    client: DbClient,
    data: {
      workspaceId: string;
      issueId: string;
      actorId: string | null;
      event:
        | 'CREATED'
        | 'STATUS_CHANGED'
        | 'BLOCKED_SET'
        | 'BLOCKED_CLEARED'
        | 'ASSIGNED'
        | 'UNASSIGNED'
        | 'PRIORITY_CHANGED'
        | 'PROJECT_CHANGED'
        | 'DUE_DATE_CHANGED'
        | 'TITLE_CHANGED'
        | 'ARCHIVED'
        | 'RESTORED'
        | 'LABEL_ADDED'
        | 'LABEL_REMOVED'
        | 'CYCLE_CHANGED';
      oldValue: string | null;
      newValue: string | null;
    },
  ) {
    return client.issueHistory.create({ data });
  },

  createManyHistory(
    client: DbClient,
    rows: Array<{
      workspaceId: string;
      issueId: string;
      actorId: string | null;
      event:
        | 'CREATED'
        | 'STATUS_CHANGED'
        | 'BLOCKED_SET'
        | 'BLOCKED_CLEARED'
        | 'ASSIGNED'
        | 'UNASSIGNED'
        | 'PRIORITY_CHANGED'
        | 'PROJECT_CHANGED'
        | 'DUE_DATE_CHANGED'
        | 'TITLE_CHANGED'
        | 'ARCHIVED'
        | 'RESTORED'
        | 'LABEL_ADDED'
        | 'LABEL_REMOVED'
        | 'CYCLE_CHANGED';
      oldValue: string | null;
      newValue: string | null;
    }>,
  ) {
    if (rows.length === 0) return Promise.resolve({ count: 0 });
    return client.issueHistory.createMany({ data: rows });
  },

  // ── Cross-module lookups (service invariants) ───────────────────────────

  /** Assignee liveness: the user must hold a membership row in the workspace. */
  /** Cross-module lookups (service invariants) */

  /** Actor display name frozen at emit time (activity D4/D5). */
  findUserName(client: DbClient, userId: string) {
    return client.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
  },

  findMemberByUser(client: DbClient, workspaceId: string, userId: string) {
    return client.workspaceMember.findFirst({
      where: { workspaceId, userId },
      select: { id: true },
    });
  },

  findProjectScoped(client: DbClient, id: string, workspaceId: string) {
    return client.project.findFirst({
      where: { id, workspaceId },
      select: { id: true, archivedAt: true },
    });
  },

  findAssignedIssueIds(client: DbClient, workspaceId: string, userId: string) {
    return client.issue.findMany({
      where: { workspaceId, assigneeId: userId },
      select: { id: true },
    });
  },

  unassignIssues(client: DbClient, workspaceId: string, userId: string) {
    return client.issue.updateMany({
      where: { workspaceId, assigneeId: userId },
      data: { assigneeId: null },
    });
  },
};

export type IssuesRepository = typeof issuesRepository;
