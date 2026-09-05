import {
  activityEntityTypeSchema,
  activityKindSchema,
  type ActivityArea,
  type ActivityEventCard,
  type ActivityKind,
  type RecordActivityEvent,
} from '@shipyard/shared';
import { prisma } from '../../common/db/client.js';
import { AppError } from '../../common/errors/AppError.js';
import { activityRepository, type DbClient } from './repository.js';
import type { ActivityEvent } from '../../generated/client.js';
import type { ListActivityQuery } from './schemas.js';

/**
 * Activity service — owns the workspace narrative read path and the internal
 * emission contract. Two halves that never meet over HTTP:
 *
 * - Page walk (route): workspace-scoped newest-first list with area/actor/
 *   entity filters. Any member reads all; archived workspaces stay readable
 *   (rejectArchived: false on the route guard).
 * - Internal writer (source txs only, D2): `record(event, tx)` — strict and
 *   synchronous. A failed insert rolls back the source action; there is no
 *   skip, no best-effort path. Emitting services compose the frozen `summary`
 *   from frozen values before calling (D5).
 */

const PAGE_LIMIT_DEFAULT = 25;

/** Server-side area → kinds mapping (api-design §5.1). */
const AREA_KINDS: Record<ActivityArea, ActivityKind[]> = {
  workspace: [
    'WORKSPACE_CREATED',
    'WORKSPACE_UPDATED',
    'WORKSPACE_ARCHIVED',
    'WORKSPACE_RESTORED',
  ],
  members: [
    'MEMBER_INVITED',
    'MEMBER_JOINED',
    'MEMBER_DECLINED',
    'MEMBER_INVITE_REVOKED',
    'MEMBER_REMOVED',
    'MEMBER_LEFT',
    'MEMBER_ROLE_CHANGED',
    'OWNERSHIP_TRANSFERRED',
  ],
  projects: [
    'PROJECT_CREATED',
    'PROJECT_RENAMED',
    'PROJECT_STATUS_CHANGED',
    'PROJECT_OWNER_TRANSFERRED',
    'PROJECT_ARCHIVED',
    'PROJECT_RESTORED',
    'PROJECT_DELETED',
  ],
  issues: [
    'ISSUE_CREATED',
    'ISSUE_STATUS_CHANGED',
    'ISSUE_ASSIGNED',
    'ISSUE_BLOCKED_SET',
    'ISSUE_BLOCKED_CLEARED',
    'ISSUE_ARCHIVED',
    'ISSUE_RESTORED',
    'ISSUE_DELETED',
  ],
  comments: ['COMMENT_CREATED', 'COMMENT_DELETED'],
  cycles: [
    'CYCLE_CREATED',
    'CYCLE_STARTED',
    'CYCLE_COMPLETED',
    'CYCLE_REOPENED',
    'CYCLE_ARCHIVED',
    'CYCLE_RESTORED',
    'CYCLE_DELETED',
  ],
};

function areaOf(kind: ActivityKind): ActivityArea {
  if (kind.startsWith('WORKSPACE_')) return 'workspace';
  if (kind.startsWith('MEMBER_') || kind === 'OWNERSHIP_TRANSFERRED')
    return 'members';
  if (kind.startsWith('PROJECT_')) return 'projects';
  if (kind.startsWith('ISSUE_')) return 'issues';
  if (kind.startsWith('COMMENT_')) return 'comments';
  return 'cycles';
}

function toCard(row: ActivityEvent): ActivityEventCard {
  // Prisma enums and shared zod enums are the same string unions; parse
  // (not cast) so a drifted value fails loudly instead of shipping.
  const kind = activityKindSchema.parse(row.kind);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    actorId: row.actorId,
    actorName: row.actorName,
    kind,
    area: areaOf(kind),
    entityType: activityEntityTypeSchema.parse(row.entityType),
    entityId: row.entityId,
    entityTitle: row.entityTitle,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  };
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

export const activityService = {
  // ── Page walk (#1, newest-first) ───────────────────────────────────────

  async list(
    workspaceId: string,
    query: ListActivityQuery,
  ): Promise<{ events: ActivityEventCard[]; nextCursor: string | null }> {
    const limit = query.limit ?? PAGE_LIMIT_DEFAULT;
    const kinds = query.area !== undefined ? AREA_KINDS[query.area] : undefined;

    let skip: number | undefined;
    let cursor: { id: string } | undefined;
    if (query.cursor !== undefined) {
      const id = decodeCursorId(query.cursor);
      const cursorRow = await activityRepository.findCursorRow(prisma, {
        id,
        workspaceId,
        ...(kinds !== undefined ? { kinds } : {}),
        ...(query.actorId !== undefined ? { actorId: query.actorId } : {}),
        ...(query.entityType !== undefined
          ? { entityType: query.entityType }
          : {}),
      });
      if (!cursorRow) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
      }
      cursor = { id };
      skip = 1;
    }

    const rows = await activityRepository.list(prisma, {
      workspaceId,
      ...(kinds !== undefined ? { kinds } : {}),
      ...(query.actorId !== undefined ? { actorId: query.actorId } : {}),
      ...(query.entityType !== undefined
        ? { entityType: query.entityType }
        : {}),
      take: limit + 1,
      ...(skip !== undefined ? { skip } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      events: page.map(toCard),
      nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null,
    };
  },

  // ── Dashboard consumer (F9 migration — replaces the §6.4 derivation) ───

  async listRecent(
    workspaceId: string,
    kinds: ActivityKind[],
    limit: number,
  ): Promise<ActivityEventCard[]> {
    const rows = await activityRepository.listRecent(prisma, {
      workspaceId,
      kinds,
      limit,
    });
    return rows.map(toCard);
  },

  // ── Internal writer (source txs only, D2 — strict) ─────────────────────

  /**
   * Records one frozen event inside the caller's transaction. Strict: a
   * failed insert throws and rolls back the source action (spec Q7). No
   * skip logic, no standalone/best-effort path — sourceless events are
   * unmintable and silent holes are worse than failed writes.
   */
  async record(event: RecordActivityEvent, tx: DbClient): Promise<void> {
    await activityRepository.create(tx, {
      workspaceId: event.workspaceId,
      actorId: event.actorId,
      actorName: event.actorName,
      kind: event.kind,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      entityTitle: event.entityTitle ?? null,
      summary: event.summary,
    });
  },
};

export type ActivityService = typeof activityService;
