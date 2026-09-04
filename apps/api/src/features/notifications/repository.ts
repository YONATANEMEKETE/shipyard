import { prisma } from '../../common/db/client.js';
import type { Prisma } from '../../generated/client.js';

/**
 * Notifications repository — Prisma access only. No business decisions live
 * here. Every query is recipient-scoped by the caller passing `recipientId`
 * explicitly; no implicit context. Transaction-aware overloads accept an
 * explicit `tx` client.
 */

export type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Full card graph in one query (no N+1): live issue (+ workspace slug for
 * navigation) and actor profile. No snapshots anywhere (D3).
 */
export function notificationInclude() {
  return {
    issue: {
      select: {
        id: true,
        title: true,
        workspaceId: true,
        seqNumber: true,
        archivedAt: true,
        workspace: { select: { slug: true } },
      },
    },
    actor: { select: { id: true, name: true, image: true } },
  } satisfies Prisma.NotificationInclude;
}

/** Row shape returned by every notification query (via {@link notificationInclude}). */
export type NotificationRow = Prisma.NotificationGetPayload<{
  include: ReturnType<typeof notificationInclude>;
}>;

export interface ListNotificationsArgs {
  recipientId: string;
  unreadOnly?: boolean;
  workspaceId?: string;
  take: number;
  skip?: number;
  cursor?: { id: string };
}

export const notificationsRepository = {
  // ── Panel / badge ──────────────────────────────────────────────────────

  list(client: DbClient, args: ListNotificationsArgs) {
    return client.notification.findMany({
      where: {
        recipientId: args.recipientId,
        ...(args.unreadOnly ? { readAt: null } : {}),
        ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
      },
      include: notificationInclude(),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: args.take,
      ...(args.skip !== undefined ? { skip: args.skip } : {}),
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
    });
  },

  countUnread(client: DbClient, recipientId: string) {
    return client.notification.count({
      where: { recipientId, readAt: null },
    });
  },

  findByIdScoped(client: DbClient, id: string, recipientId: string) {
    return client.notification.findFirst({
      where: { id, recipientId },
      include: notificationInclude(),
    });
  },

  /** Cursor liveness bound to the active panel filters (filter-bound cursors). */
  findCursorRow(
    client: DbClient,
    args: {
      id: string;
      recipientId: string;
      unreadOnly?: boolean;
      workspaceId?: string;
    },
  ) {
    return client.notification.findFirst({
      where: {
        id: args.id,
        recipientId: args.recipientId,
        ...(args.unreadOnly ? { readAt: null } : {}),
        ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
      },
      select: { id: true },
    });
  },

  // ── Read-state mutations (recipient-only) ──────────────────────────────

  /**
   * Mark read — conditional single statement so concurrent marks keep the
   * first `readAt` (idempotent, D6). Returns the affected row count.
   */
  markRead(client: DbClient, id: string, recipientId: string) {
    return client.notification.updateMany({
      where: { id, recipientId, readAt: null },
      data: { readAt: new Date() },
    });
  },

  markAllRead(client: DbClient, recipientId: string, workspaceId?: string) {
    return client.notification.updateMany({
      where: {
        recipientId,
        readAt: null,
        ...(workspaceId ? { workspaceId } : {}),
      },
      data: { readAt: new Date() },
    });
  },

  deleteOne(client: DbClient, id: string, recipientId: string) {
    return client.notification.deleteMany({ where: { id, recipientId } });
  },

  clearAll(
    client: DbClient,
    recipientId: string,
    filters: { workspaceId?: string; readOnly?: boolean },
  ) {
    return client.notification.deleteMany({
      where: {
        recipientId,
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters.readOnly ? { readAt: { not: null } } : {}),
      },
    });
  },

  // ── Internal writers (emission — source txs only, D9) ──────────────────

  createAssignment(
    client: DbClient,
    data: {
      workspaceId: string;
      issueId: string;
      recipientId: string;
      actorId: string | null;
    },
  ) {
    return client.notification.create({
      data: { ...data, commentId: null, type: 'ASSIGNMENT' },
    });
  },

  createMention(
    client: DbClient,
    data: {
      workspaceId: string;
      issueId: string;
      commentId: string;
      recipientId: string;
      actorId: string | null;
    },
  ) {
    return client.notification.create({
      data: { ...data, type: 'MENTION' },
    });
  },

  deleteForComment(client: DbClient, commentId: string) {
    return client.notification.deleteMany({ where: { commentId } });
  },

  deleteForIssue(client: DbClient, issueId: string) {
    return client.notification.deleteMany({ where: { issueId } });
  },

  // ── Emission guards (trust-but-verify, §3.2) ───────────────────────────

  findUser(client: DbClient, userId: string) {
    return client.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
  },

  findWorkspaceStatus(client: DbClient, workspaceId: string) {
    return client.workspace.findUnique({
      where: { id: workspaceId },
      select: { status: true },
    });
  },
};

export type NotificationsRepository = typeof notificationsRepository;
