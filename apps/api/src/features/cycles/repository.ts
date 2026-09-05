import { prisma } from '../../common/db/client.js';
import type { Prisma } from '../../generated/client.js';

/**
 * Cycles repository — Prisma access only. No business decisions live here.
 * All workspace-scoped callers pass workspaceId explicitly; no implicit
 * context. Transaction-aware overloads accept an explicit `tx` client.
 *
 * Overlap/active-limit enforcement lives in the DB (D5 exclusion, D6 partial
 * index); the lookups below are friendly pre-checks plus progress counts.
 */

export type DbClient = Prisma.TransactionClient | typeof prisma;

/** Row shape returned by every cycle query. */
export type CycleRow = Prisma.CycleGetPayload<Record<string, never>>;

export interface ListCyclesArgs {
  workspaceId: string;
  where: Prisma.CycleWhereInput;
  orderBy: Prisma.CycleOrderByWithRelationInput[];
  take: number;
}

export const cyclesRepository = {
  list(client: DbClient, args: ListCyclesArgs) {
    return client.cycle.findMany({
      where: { workspaceId: args.workspaceId, ...args.where },
      orderBy: args.orderBy,
      take: args.take,
    });
  },

  findByIdScoped(client: DbClient, id: string, workspaceId: string) {
    return client.cycle.findFirst({ where: { id, workspaceId } });
  },

  /** Friendly pre-check on the D3 functional index; the DB index is the backstop. */
  findByNameInWorkspace(client: DbClient, workspaceId: string, name: string) {
    return client.cycle.findFirst({
      where: { workspaceId, name: { equals: name, mode: 'insensitive' } },
    });
  },

  /** Non-archived siblings (self excluded) for the D5 overlap pre-check. */
  findSchedulingSiblings(
    client: DbClient,
    workspaceId: string,
    excludeId?: string,
  ) {
    return client.cycle.findMany({
      where: {
        workspaceId,
        archivedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, startDate: true, endDate: true },
    });
  },

  /** D6 pre-check: the ACTIVE non-archived holder, if any. */
  findActive(client: DbClient, workspaceId: string, excludeId?: string) {
    return client.cycle.findFirst({
      where: {
        workspaceId,
        status: 'ACTIVE',
        archivedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },

  /** Actor display name frozen at emit time (activity D4/D5). */
  findUserName(client: DbClient, userId: string) {
    return client.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
  },

  create(
    client: DbClient,
    data: {
      workspaceId: string;
      name: string;
      goal: string | null;
      startDate: Date;
      endDate: Date;
    },
  ) {
    return client.cycle.create({ data });
  },

  update(
    client: DbClient,
    id: string,
    data: {
      name?: string;
      goal?: string | null;
      startDate?: Date;
      endDate?: Date;
      status?: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
      archivedAt?: Date | null;
    },
  ) {
    return client.cycle.update({ where: { id }, data });
  },

  remove(client: DbClient, id: string) {
    return client.cycle.delete({ where: { id } });
  },

  // ── Progress derivation (D8: live counts, never stored) ─────────────────

  /** Total non-archived issues per cycle id. */
  countIssuesByCycle(
    client: DbClient,
    workspaceId: string,
    cycleIds: string[],
  ) {
    if (cycleIds.length === 0)
      return Promise.resolve(
        [] as { cycleId: string | null; _count: { _all: number } }[],
      );
    return client.issue.groupBy({
      by: ['cycleId'],
      where: { workspaceId, cycleId: { in: cycleIds }, archivedAt: null },
      _count: { _all: true },
    });
  },

  /** Completed (DONE) non-archived issues per cycle id. */
  countDoneByCycle(client: DbClient, workspaceId: string, cycleIds: string[]) {
    if (cycleIds.length === 0)
      return Promise.resolve(
        [] as { cycleId: string | null; _count: { _all: number } }[],
      );
    return client.issue.groupBy({
      by: ['cycleId'],
      where: {
        workspaceId,
        cycleId: { in: cycleIds },
        archivedAt: null,
        status: 'DONE',
      },
      _count: { _all: true },
    });
  },
};

export type CyclesRepository = typeof cyclesRepository;
