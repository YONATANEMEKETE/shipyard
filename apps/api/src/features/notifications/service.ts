import type {
  AssignmentEvent,
  ClearAllResponse,
  DeleteNotificationResponse,
  MarkAllReadResponse,
  MentionEvent,
  NotificationCard,
  UnreadCount,
} from '@shipyard/shared';
import { logger } from '../../common/logger/index.js';
import { prisma } from '../../common/db/client.js';
import { AppError } from '../../common/errors/AppError.js';
import { ConfirmationRequiredError } from '../workspace/errors.js';
import { NotificationNotFoundError } from './errors.js';
import {
  notificationsRepository,
  type DbClient,
  type NotificationRow,
} from './repository.js';
import type {
  ClearAllQuery,
  ListNotificationsQuery,
  ReadAllQuery,
} from './schemas.js';

/**
 * Notifications service — owns recipient isolation and the internal emission
 * contract. Two halves that never meet over HTTP:
 *
 * - Recipient flows (routes): panel, badge, detail, mark read/all, delete,
 *   clear — every query carries `recipientId = caller`, reasserted on writes.
 *   No workspace context, no roles, no freeze axis (§6.1).
 * - Internal writers (source txs only, D9): `createAssignment`,
 *   `createMention`, `deleteForComment` (+ `deleteForIssue` for the §8.6
 *   direct leg). Trust-but-verify: recipient liveness + self-suppress are
 *   re-checked in-tx; a dead recipient skips emission without failing the
 *   source write (§3.2).
 */

const PANEL_LIMIT_DEFAULT = 25;

function identifierOf(seqNumber: number): string {
  return `SHIP-${seqNumber}`;
}

function toCard(row: NotificationRow): NotificationCard {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type,
    actor: row.actor
      ? { userId: row.actor.id, name: row.actor.name, image: row.actor.image }
      : null,
    issue: {
      id: row.issue.id,
      identifier: identifierOf(row.issue.seqNumber),
      title: row.issue.title,
      workspaceId: row.issue.workspaceId,
      workspaceSlug: row.issue.workspace.slug,
      archivedAt: row.issue.archivedAt
        ? row.issue.archivedAt.toISOString()
        : null,
    },
    commentId: row.commentId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function requireRow(row: NotificationRow | null): NotificationRow {
  if (!row) throw new NotificationNotFoundError();
  return row;
}

function encodeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursorId(cursor: string): string {
  try {
    const payload = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { id?: unknown };
    if (typeof payload.id !== 'string' || payload.id.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
    }
    return payload.id;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
  }
}

/**
 * Emission preconditions evaluated in-tx (defense in depth — callers
 * pre-filter): recipient user row exists, recipient !== actor (D8
 * self-suppress), workspace not archived (frozen containers mint nothing —
 * skipped, never errored, §6.7).
 */
async function canEmit(
  tx: DbClient,
  args: { workspaceId: string; recipientId: string; actorId: string | null },
): Promise<boolean> {
  if (args.recipientId === args.actorId) return false;
  const [recipient, workspace] = await Promise.all([
    notificationsRepository.findUser(tx, args.recipientId),
    notificationsRepository.findWorkspaceStatus(tx, args.workspaceId),
  ]);
  if (!recipient) return false;
  if (!workspace || workspace.status === 'ARCHIVED') return false;
  return true;
}

export const notificationsService = {
  // ── Panel (#1, newest-first) ───────────────────────────────────────────

  async list(
    recipientId: string,
    query: ListNotificationsQuery,
  ): Promise<{ notifications: NotificationCard[]; nextCursor: string | null }> {
    const limit = query.limit ?? PANEL_LIMIT_DEFAULT;
    const unreadOnly = query.unreadOnly ?? false;

    let skip: number | undefined;
    let cursor: { id: string } | undefined;
    if (query.cursor !== undefined) {
      const id = decodeCursorId(query.cursor);
      const cursorRow = await notificationsRepository.findCursorRow(prisma, {
        id,
        recipientId,
        unreadOnly,
        workspaceId: query.workspaceId,
      });
      if (!cursorRow) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
      }
      cursor = { id };
      skip = 1;
    }

    const rows = await notificationsRepository.list(prisma, {
      recipientId,
      unreadOnly,
      workspaceId: query.workspaceId,
      take: limit + 1,
      ...(skip !== undefined ? { skip } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      notifications: page.map(toCard),
      nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null,
    };
  },

  // ── Badge (#2) ─────────────────────────────────────────────────────────

  async unreadCount(recipientId: string): Promise<UnreadCount> {
    const unreadCount = await notificationsRepository.countUnread(
      prisma,
      recipientId,
    );
    return { unreadCount };
  },

  // ── Detail (#3) ────────────────────────────────────────────────────────

  async getDetail(
    recipientId: string,
    notificationId: string,
  ): Promise<NotificationCard> {
    return toCard(
      requireRow(
        await notificationsRepository.findByIdScoped(
          prisma,
          notificationId,
          recipientId,
        ),
      ),
    );
  },

  // ── Mark read (#4: idempotent, first readAt wins) ───────────────────────

  async markRead(
    recipientId: string,
    notificationId: string,
  ): Promise<NotificationCard> {
    await notificationsRepository.markRead(prisma, notificationId, recipientId);
    return toCard(
      requireRow(
        await notificationsRepository.findByIdScoped(
          prisma,
          notificationId,
          recipientId,
        ),
      ),
    );
  },

  // ── Mark all read (#5) ─────────────────────────────────────────────────

  async markAllRead(
    recipientId: string,
    query: ReadAllQuery,
  ): Promise<MarkAllReadResponse> {
    const result = await notificationsRepository.markAllRead(
      prisma,
      recipientId,
      query.workspaceId,
    );
    return { markedCount: result.count };
  },

  // ── Delete one (#6) / clear all (#7) ───────────────────────────────────

  async remove(
    recipientId: string,
    notificationId: string,
    confirm: unknown,
  ): Promise<DeleteNotificationResponse> {
    if (confirm !== true) throw new ConfirmationRequiredError();
    const result = await notificationsRepository.deleteOne(
      prisma,
      notificationId,
      recipientId,
    );
    // Gone reads as never-there (tombstone-less, like comment delete).
    if (result.count === 0) throw new NotificationNotFoundError();
    logger.info({ recipientId, notificationId }, 'notification.deleted');
    return { deletedNotificationId: notificationId };
  },

  async clearAll(
    recipientId: string,
    query: ClearAllQuery,
    confirm: unknown,
  ): Promise<ClearAllResponse> {
    if (confirm !== true) throw new ConfirmationRequiredError();
    const result = await notificationsRepository.clearAll(prisma, recipientId, {
      workspaceId: query.workspaceId,
      readOnly: query.readOnly ?? false,
    });
    logger.info(
      {
        recipientId,
        deletedCount: result.count,
        workspaceId: query.workspaceId ?? null,
        readOnly: query.readOnly ?? false,
      },
      'notification.cleared',
    );
    return { deletedCount: result.count };
  },

  // ── Internal writers (source txs only, D9) ──────────────────────────────

  /**
   * Assignment fan-out — called by the issues service inside the
   * create/reassign tx, only on actual change to a non-null, non-self
   * assignee. Inserts one ASSIGNMENT row (commentId NULL).
   */
  async createAssignment(event: AssignmentEvent, tx: DbClient): Promise<void> {
    const ok = await canEmit(tx, {
      workspaceId: event.workspaceId,
      recipientId: event.newAssigneeId,
      actorId: event.actorId,
    });
    if (!ok) return;
    await notificationsRepository.createAssignment(tx, {
      workspaceId: event.workspaceId,
      issueId: event.issueId,
      recipientId: event.newAssigneeId,
      actorId: event.actorId,
    });
  },

  /**
   * Mention fan-out — called by the comments service inside the comment-create
   * tx, once per distinct resolved recipient (author already excluded by the
   * caller). Inserts one MENTION row per call.
   */
  async createMention(event: MentionEvent, tx: DbClient): Promise<void> {
    const ok = await canEmit(tx, {
      workspaceId: event.workspaceId,
      recipientId: event.recipientId,
      actorId: event.actorId,
    });
    if (!ok) return;
    await notificationsRepository.createMention(tx, {
      workspaceId: event.workspaceId,
      issueId: event.issueId,
      commentId: event.commentId,
      recipientId: event.recipientId,
      actorId: event.actorId,
    });
  },

  /**
   * Retraction — called by the comments service inside the comment-delete tx
   * (and per comment on issue delete). FK Cascade covers it where modeled;
   * the call is the intent-readable path (D4).
   */
  async deleteForComment(commentId: string, tx: DbClient): Promise<number> {
    const result = await notificationsRepository.deleteForComment(
      tx,
      commentId,
    );
    return result.count;
  },

  /**
   * Direct issue leg (§8.6) — called by the issues service inside the
   * issue-delete tx. Catches assignment rows (+ any stragglers); the comment
   * path converges on the same mention rows via cascade.
   */
  async deleteForIssue(issueId: string, tx: DbClient): Promise<number> {
    const result = await notificationsRepository.deleteForIssue(tx, issueId);
    return result.count;
  },
};

export type NotificationsService = typeof notificationsService;
