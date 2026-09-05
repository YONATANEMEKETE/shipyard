import { prisma } from '../../common/db/client.js';
import type { Prisma } from '../../generated/client.js';
import type { ActivityEntityType, ActivityKind } from '@shipyard/shared';

/**
 * Activity repository — Prisma access only. No business decisions live here.
 * Every read is workspace-scoped by the caller passing `workspaceId`
 * explicitly; no implicit context. The writer accepts an explicit `tx`
 * client and is called by source services inside their own transactions
 * (strict, data-model D2). Transaction-aware reads accept `DbClient` too so
 * the dashboard consumer can join wider txs if needed.
 *
 * NOTE: args use the shared zod-inferred enum types. They are structurally
 * identical string unions to the Prisma enums, so no casts are needed —
 * if the two ever drift, `tsc` fails here first (intended).
 */

export type DbClient = Prisma.TransactionClient | typeof prisma;

export interface ListActivityArgs {
  workspaceId: string;
  kinds?: ActivityKind[];
  actorId?: string;
  entityType?: ActivityEntityType;
  take: number;
  skip?: number;
  cursor?: { id: string };
}

export interface CreateActivityArgs {
  workspaceId: string;
  actorId: string;
  actorName: string;
  kind: ActivityKind;
  entityType: ActivityEntityType;
  entityId?: string | null;
  entityTitle?: string | null;
  summary: string;
}

export const activityRepository = {
  // ── Page walk (newest-first over (createdAt, id) DESC) ─────────────────

  list(client: DbClient, args: ListActivityArgs) {
    return client.activityEvent.findMany({
      where: {
        workspaceId: args.workspaceId,
        ...(args.kinds !== undefined ? { kind: { in: args.kinds } } : {}),
        ...(args.actorId !== undefined ? { actorId: args.actorId } : {}),
        ...(args.entityType !== undefined
          ? { entityType: args.entityType }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: args.take,
      ...(args.skip !== undefined ? { skip: args.skip } : {}),
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
    });
  },

  /** Cursor liveness bound to the active page filters (filter-bound cursors). */
  findCursorRow(
    client: DbClient,
    args: {
      id: string;
      workspaceId: string;
      kinds?: ActivityKind[];
      actorId?: string;
      entityType?: ActivityEntityType;
    },
  ) {
    return client.activityEvent.findFirst({
      where: {
        id: args.id,
        workspaceId: args.workspaceId,
        ...(args.kinds !== undefined ? { kind: { in: args.kinds } } : {}),
        ...(args.actorId !== undefined ? { actorId: args.actorId } : {}),
        ...(args.entityType !== undefined
          ? { entityType: args.entityType }
          : {}),
      },
      select: { id: true },
    });
  },

  // ── Dashboard consumer (F9 migration — issue/comment kinds, bound 20) ───

  listRecent(
    client: DbClient,
    args: { workspaceId: string; kinds: ActivityKind[]; limit: number },
  ) {
    return client.activityEvent.findMany({
      where: {
        workspaceId: args.workspaceId,
        kind: { in: args.kinds },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: args.limit,
    });
  },

  // ── Internal writer (emission — source txs only, D2) ────────────────────

  create(client: DbClient, data: CreateActivityArgs) {
    return client.activityEvent.create({
      data: {
        workspaceId: data.workspaceId,
        actorId: data.actorId,
        actorName: data.actorName,
        kind: data.kind,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        entityTitle: data.entityTitle ?? null,
        summary: data.summary,
      },
    });
  },
};

export type ActivityRepository = typeof activityRepository;
