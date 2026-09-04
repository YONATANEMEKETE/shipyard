import type {
  AttachLabelRequest,
  CreateIssueRequest,
  CreateLabelRequest,
  DeleteIssueResponse,
  DeleteLabelResponse,
  IssueCard,
  IssueDetail,
  IssueHistoryCard,
  IssuePriority,
  LabelCard,
  ListIssuesResponse,
  UpdateIssueRequest,
  UpdateLabelRequest,
} from '@shipyard/shared';
import { DEFAULT_LABEL_COLOR } from '@shipyard/shared';
import type { Prisma } from '../../generated/client.js';
import { logger } from '../../common/logger/index.js';
import { prisma } from '../../common/db/client.js';
import { AppError } from '../../common/errors/AppError.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import {
  ForbiddenRoleError,
  WorkspaceArchivedError,
  ConfirmationRequiredError,
} from '../workspace/errors.js';
import {
  AssigneeNotMemberError,
  CannotBlockDoneError,
  ConfirmIdentifierMismatchError,
  IssueAlreadyArchivedError,
  IssueArchivedError,
  IssueNotArchivedError,
  IssueNotFoundError,
  IssueProjectArchivedError,
  LabelAlreadyAttachedError,
  LabelNameConflictError,
  LabelNotAttachedError,
  LabelNotFoundError,
  LabelNotInWorkspaceError,
  ProjectNotInWorkspaceError,
} from './errors.js';
import {
  issuesRepository,
  type DbClient,
  type HistoryRow,
  type IssueRow,
} from './repository.js';
import type { ListHistoryQuery, ListIssuesQuery } from './schemas.js';

/**
 * Issues service — owns business rules, state transitions, blocked matrix,
 * archive/restore/delete, label ops, history writes, and the member-exit
 * unassign contract. Writes run inside `$transaction` and reassert
 * archive state (defense in depth — guards already ran).
 */

const LIST_LIMIT_DEFAULT = 25;
const HISTORY_LIMIT_DEFAULT = 50;

const PRIORITY_RANK: Record<IssuePriority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  NO_PRIORITY: 4,
};

/** Day-precision dates are stored as Postgres DATE and returned as YYYY-MM-DD. */
function toDateString(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function identifierOf(seqNumber: number): string {
  return `SHIP-${seqNumber}`;
}

function normalizeReason(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toAssigneeCard(
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null,
): IssueCard['assignee'] {
  if (!user) return null;
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };
}

function toLabelCard(row: {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
}): LabelCard {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    color: row.color,
  };
}

function toCard(row: IssueRow): IssueCard {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    seqNumber: row.seqNumber,
    identifier: identifierOf(row.seqNumber),
    title: row.title,
    status: row.status,
    priority: row.priority,
    assignee: toAssigneeCard(row.assignee),
    projectId: row.projectId,
    dueDate: toDateString(row.dueDate),
    blocked: row.blocked,
    blockedReason: row.blockedReason,
    labels: row.labels.map((join) => toLabelCard(join.label)),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: IssueRow): IssueDetail {
  return {
    ...toCard(row),
    description: row.description,
    creator: toAssigneeCard(row.creator) ?? {
      userId: row.creatorId,
      name: '',
      email: '',
      image: null,
    },
  };
}

function toHistoryCard(row: HistoryRow): IssueHistoryCard {
  return {
    id: row.id,
    event: row.event,
    actor: toAssigneeCard(row.actor),
    oldValue: row.oldValue,
    newValue: row.newValue,
    createdAt: row.createdAt.toISOString(),
  };
}

function requireIssue(row: IssueRow | null): IssueRow {
  if (!row) throw new IssueNotFoundError();
  return row;
}

/** Write-gate reassertion: active workspace (role already checked by guards). */
function assertWorkspaceWritable(context: WorkspaceRequestContext): void {
  if (context.status === 'ARCHIVED') throw new WorkspaceArchivedError();
}

/** Delete-gate reassertion: active workspace + OWNER|ADMIN role. */
function assertCanDelete(context: WorkspaceRequestContext): void {
  if (context.status === 'ARCHIVED') throw new WorkspaceArchivedError();
  if (context.role !== 'OWNER' && context.role !== 'ADMIN')
    throw new ForbiddenRoleError();
}

function encodeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor<T>(cursor: string): T {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
  }
}

interface ListCursorPayload {
  s: string;
  o: string;
  id: string;
}

function decodeListCursor(cursor: string): ListCursorPayload {
  const payload = decodeCursor<Partial<ListCursorPayload>>(cursor);
  if (
    typeof payload.s !== 'string' ||
    typeof payload.o !== 'string' ||
    typeof payload.id !== 'string' ||
    payload.id.length === 0
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
  }
  return { s: payload.s, o: payload.o, id: payload.id };
}

async function assertCursorIssueExists(
  client: DbClient,
  id: string,
): Promise<void> {
  const row = await client.issue.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!row) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
}

async function resolveIssue(
  issueId: string,
  context: WorkspaceRequestContext,
): Promise<IssueRow> {
  return requireIssue(
    await issuesRepository.findByIdScoped(prisma, issueId, context.workspaceId),
  );
}

async function assertAssigneeMember(
  client: DbClient,
  workspaceId: string,
  assigneeId: string,
): Promise<void> {
  const membership = await issuesRepository.findMemberByUser(
    client,
    workspaceId,
    assigneeId,
  );
  if (!membership) throw new AssigneeNotMemberError();
}

async function assertProjectAssignable(
  client: DbClient,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const project = await issuesRepository.findProjectScoped(
    client,
    projectId,
    workspaceId,
  );
  if (!project) throw new ProjectNotInWorkspaceError();
  if (project.archivedAt) throw new IssueProjectArchivedError();
}

async function assertLabelsInWorkspace(
  client: DbClient,
  workspaceId: string,
  labelIds: string[],
): Promise<void> {
  if (labelIds.length === 0) return;
  const unique = [...new Set(labelIds)];
  const rows = await issuesRepository.findLabelsByIdsInWorkspace(
    client,
    workspaceId,
    unique,
  );
  if (rows.length !== unique.length) throw new LabelNotInWorkspaceError();
}

export const issuesService = {
  // ── List (#1) ──────────────────────────────────────────────────────────

  async list(
    context: WorkspaceRequestContext,
    actorUserId: string,
    query: ListIssuesQuery,
  ): Promise<ListIssuesResponse> {
    const sort = query.sort ?? 'createdAt';
    const order = query.order ?? 'desc';
    const limit = query.limit ?? LIST_LIMIT_DEFAULT;

    const where: Prisma.IssueWhereInput = {
      archivedAt: query.archived === 'true' ? { not: null } : null,
    };
    if (query.status) where.status = { in: [...query.status] };
    if (query.priority) where.priority = { in: [...query.priority] };
    if (query.assigneeId) {
      where.assigneeId =
        query.assigneeId === 'me' ? actorUserId : query.assigneeId;
    }
    if (query.projectId) where.projectId = query.projectId;
    if (query.labels && query.labels.length > 0) {
      where.AND = query.labels.map((labelId) => ({
        labels: { some: { labelId } },
      }));
    }
    if (query.blocked !== undefined) {
      where.blocked = query.blocked === 'true';
    }
    if (query.dueDateFrom ?? query.dueDateTo) {
      where.dueDate = {
        ...(query.dueDateFrom ? { gte: new Date(query.dueDateFrom) } : {}),
        ...(query.dueDateTo ? { lte: new Date(query.dueDateTo) } : {}),
      };
    }
    if (query.q !== undefined) {
      const q = query.q.trim();
      if (q.length >= 2) {
        const shipMatch = /^SHIP-(\d+)$/i.exec(q);
        if (shipMatch?.[1]) {
          const seq = Number.parseInt(shipMatch[1], 10);
          if (Number.isSafeInteger(seq) && seq > 0) where.seqNumber = seq;
        } else {
          where.OR = [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ];
        }
      }
    }

    // Priority rank is a service concept (D9) — Postgres enums don't carry
    // it, so rank in memory over a bounded window.
    if (sort === 'priority') {
      const rows = await issuesRepository.listIssuesForPrioritySort(prisma, {
        workspaceId: context.workspaceId,
        where,
      });
      const direction = order === 'asc' ? 1 : -1;
      const ranked = [...rows].sort((a, b) => {
        const rankDiff =
          (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * direction;
        if (rankDiff !== 0) return rankDiff;
        if (a.id === b.id) return 0;
        return (a.id < b.id ? -1 : 1) * direction;
      });

      let start = 0;
      if (query.cursor !== undefined) {
        const payload = decodeListCursor(query.cursor);
        if (payload.s !== sort || payload.o !== order) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
        }
        const index = ranked.findIndex((row) => row.id === payload.id);
        if (index === -1) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
        }
        start = index + 1;
      }
      const page = ranked.slice(start, start + limit);
      const hasMore = ranked.length > start + limit;
      const last = page[page.length - 1];
      return {
        issues: page.map(toCard),
        nextCursor:
          hasMore && last
            ? encodeCursor({ s: sort, o: order, id: last.id })
            : null,
      };
    }

    const orderBy: Prisma.IssueOrderByWithRelationInput[] = [
      { [sort]: order },
      { id: order },
    ];

    let skip: number | undefined;
    let cursor: { id: string } | undefined;
    if (query.cursor !== undefined) {
      const payload = decodeListCursor(query.cursor);
      if (payload.s !== sort || payload.o !== order) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
      }
      await assertCursorIssueExists(prisma, payload.id);
      cursor = { id: payload.id };
      skip = 1;
    }

    const rows = await issuesRepository.listIssues(prisma, {
      workspaceId: context.workspaceId,
      where,
      orderBy,
      take: limit + 1,
      ...(skip !== undefined ? { skip } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      issues: page.map(toCard),
      nextCursor:
        hasMore && last
          ? encodeCursor({ s: sort, o: order, id: last.id })
          : null,
    };
  },

  // ── Detail (#2) ────────────────────────────────────────────────────────

  async getDetail(
    context: WorkspaceRequestContext,
    issueId: string,
  ): Promise<IssueDetail> {
    return toDetail(await resolveIssue(issueId, context));
  },

  // ── Create (#3, spec §3.1) ─────────────────────────────────────────────

  async create(
    context: WorkspaceRequestContext,
    actorUserId: string,
    input: CreateIssueRequest,
  ): Promise<IssueDetail> {
    assertWorkspaceWritable(context);

    const labelIds = input.labelIds ? [...new Set(input.labelIds)] : [];

    const row = await prisma.$transaction(async (tx) => {
      if (input.assigneeId !== undefined && input.assigneeId !== null) {
        await assertAssigneeMember(tx, context.workspaceId, input.assigneeId);
      }
      if (input.projectId !== undefined && input.projectId !== null) {
        await assertProjectAssignable(tx, context.workspaceId, input.projectId);
      }
      await assertLabelsInWorkspace(tx, context.workspaceId, labelIds);

      const seqNumber = await issuesRepository.allocateSeqNumber(
        tx,
        context.workspaceId,
      );

      const created = await issuesRepository.createIssue(tx, {
        workspaceId: context.workspaceId,
        seqNumber,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? 'BACKLOG',
        priority: input.priority ?? 'NO_PRIORITY',
        assigneeId: input.assigneeId ?? null,
        creatorId: actorUserId,
        projectId: input.projectId ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      });

      for (const labelId of labelIds) {
        await issuesRepository.createJoin(tx, created.id, labelId);
      }

      await issuesRepository.createHistory(tx, {
        workspaceId: context.workspaceId,
        issueId: created.id,
        actorId: actorUserId,
        event: 'CREATED',
        oldValue: null,
        newValue: null,
      });

      // Re-read with the full include graph (joins were added after insert).
      return requireIssue(
        await issuesRepository.findByIdScoped(
          tx,
          created.id,
          context.workspaceId,
        ),
      );
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        slug: context.slug,
        issueId: row.id,
        seqNumber: row.seqNumber,
        createdByUserId: actorUserId,
      },
      'issue.created',
    );
    return toDetail(row);
  },

  // ── Update (#4: edit + status + blocked) ───────────────────────────────

  async update(
    context: WorkspaceRequestContext,
    actorUserId: string,
    issueId: string,
    input: UpdateIssueRequest,
  ): Promise<IssueDetail> {
    assertWorkspaceWritable(context);
    const stored = await resolveIssue(issueId, context);
    if (stored.archivedAt) throw new IssueArchivedError();

    const row = await prisma.$transaction(async (tx) => {
      const fresh = requireIssue(
        await issuesRepository.findByIdScoped(tx, issueId, context.workspaceId),
      );
      if (fresh.archivedAt) throw new IssueArchivedError();

      if (
        input.assigneeId !== undefined &&
        input.assigneeId !== null &&
        input.assigneeId !== fresh.assigneeId
      ) {
        await assertAssigneeMember(tx, context.workspaceId, input.assigneeId);
      }
      if (
        input.projectId !== undefined &&
        input.projectId !== null &&
        input.projectId !== fresh.projectId
      ) {
        await assertProjectAssignable(tx, context.workspaceId, input.projectId);
      }

      // ── Blocked matrix (spec §3.3, rule 6) ──
      const newStatus = input.status ?? fresh.status;
      const blockedRequested = input.blocked;
      if (newStatus === 'DONE' && blockedRequested === true) {
        throw new CannotBlockDoneError();
      }
      if (
        blockedRequested === true &&
        newStatus !== 'BACKLOG' &&
        newStatus !== 'TODO' &&
        newStatus !== 'IN_PROGRESS'
      ) {
        throw new CannotBlockDoneError();
      }

      let newBlocked = fresh.blocked;
      let newReason: string | null = fresh.blockedReason;
      if (newStatus === 'DONE' && fresh.blocked) {
        // Implicit clear rides the Done transition (no separate call).
        newBlocked = false;
        newReason = null;
      } else if (blockedRequested === true) {
        newBlocked = true;
        newReason =
          input.blockedReason !== undefined
            ? normalizeReason(input.blockedReason)
            : fresh.blocked
              ? fresh.blockedReason
              : null;
      } else if (blockedRequested === false) {
        newBlocked = false;
        newReason = null;
      } else if (input.blockedReason !== undefined) {
        // Reason-only edit: only meaningful while blocked.
        if (fresh.blocked) {
          newReason = normalizeReason(input.blockedReason);
        } else {
          const normalized = normalizeReason(input.blockedReason);
          if (normalized !== null) {
            throw new AppError(
              400,
              'VALIDATION_ERROR',
              'Blocked reason requires the issue to be blocked',
            );
          }
          newReason = null;
        }
      }

      const data: Parameters<typeof issuesRepository.updateIssue>[2] = {};
      if (input.title !== undefined && input.title !== fresh.title) {
        data.title = input.title;
      }
      if (input.description !== undefined) {
        const next = input.description;
        if (next !== fresh.description) data.description = next;
      }
      if (input.status !== undefined && input.status !== fresh.status) {
        data.status = input.status;
      }
      if (input.priority !== undefined && input.priority !== fresh.priority) {
        data.priority = input.priority;
      }
      if (
        input.assigneeId !== undefined &&
        input.assigneeId !== fresh.assigneeId
      ) {
        data.assigneeId = input.assigneeId;
      }
      if (
        input.projectId !== undefined &&
        input.projectId !== fresh.projectId
      ) {
        data.projectId = input.projectId;
      }
      if (input.dueDate !== undefined) {
        const next = input.dueDate ? new Date(input.dueDate) : null;
        const current = toDateString(fresh.dueDate);
        const wanted = input.dueDate ?? null;
        if (wanted !== current) data.dueDate = next;
      }
      if (newBlocked !== fresh.blocked) data.blocked = newBlocked;
      if (newReason !== fresh.blockedReason) data.blockedReason = newReason;

      const history: Array<{
        workspaceId: string;
        issueId: string;
        actorId: string | null;
        event:
          | 'STATUS_CHANGED'
          | 'BLOCKED_SET'
          | 'BLOCKED_CLEARED'
          | 'ASSIGNED'
          | 'UNASSIGNED'
          | 'PRIORITY_CHANGED'
          | 'PROJECT_CHANGED'
          | 'DUE_DATE_CHANGED'
          | 'TITLE_CHANGED';
        oldValue: string | null;
        newValue: string | null;
      }> = [];

      if (data.title !== undefined) {
        history.push({
          workspaceId: context.workspaceId,
          issueId,
          actorId: actorUserId,
          event: 'TITLE_CHANGED',
          oldValue: fresh.title,
          newValue: data.title,
        });
      }
      if (data.status !== undefined) {
        history.push({
          workspaceId: context.workspaceId,
          issueId,
          actorId: actorUserId,
          event: 'STATUS_CHANGED',
          oldValue: fresh.status,
          newValue: data.status,
        });
      }
      if (data.priority !== undefined) {
        history.push({
          workspaceId: context.workspaceId,
          issueId,
          actorId: actorUserId,
          event: 'PRIORITY_CHANGED',
          oldValue: fresh.priority,
          newValue: data.priority,
        });
      }
      if (data.assigneeId !== undefined) {
        if (data.assigneeId === null) {
          history.push({
            workspaceId: context.workspaceId,
            issueId,
            actorId: actorUserId,
            event: 'UNASSIGNED',
            oldValue: fresh.assigneeId,
            newValue: null,
          });
        } else {
          history.push({
            workspaceId: context.workspaceId,
            issueId,
            actorId: actorUserId,
            event: 'ASSIGNED',
            oldValue: fresh.assigneeId,
            newValue: data.assigneeId,
          });
        }
      }
      if (data.projectId !== undefined) {
        history.push({
          workspaceId: context.workspaceId,
          issueId,
          actorId: actorUserId,
          event: 'PROJECT_CHANGED',
          oldValue: fresh.projectId,
          newValue: data.projectId,
        });
      }
      if (data.dueDate !== undefined) {
        history.push({
          workspaceId: context.workspaceId,
          issueId,
          actorId: actorUserId,
          event: 'DUE_DATE_CHANGED',
          oldValue: toDateString(fresh.dueDate),
          newValue: toDateString(data.dueDate ?? null),
        });
      }
      if (newBlocked && !fresh.blocked) {
        history.push({
          workspaceId: context.workspaceId,
          issueId,
          actorId: actorUserId,
          event: 'BLOCKED_SET',
          oldValue: null,
          newValue: newReason,
        });
      } else if (!newBlocked && fresh.blocked) {
        history.push({
          workspaceId: context.workspaceId,
          issueId,
          actorId: actorUserId,
          event: 'BLOCKED_CLEARED',
          oldValue: fresh.blockedReason,
          newValue: null,
        });
      } else if (
        newBlocked &&
        fresh.blocked &&
        newReason !== fresh.blockedReason
      ) {
        history.push({
          workspaceId: context.workspaceId,
          issueId,
          actorId: actorUserId,
          event: 'BLOCKED_SET',
          oldValue: fresh.blockedReason,
          newValue: newReason,
        });
      }

      if (Object.keys(data).length === 0) return fresh;

      const updated = await issuesRepository.updateIssue(tx, issueId, data);
      await issuesRepository.createManyHistory(tx, history);
      return updated;
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        issueId,
        updatedFields: Object.keys(input),
        actorMemberId: context.memberId,
      },
      'issue.updated',
    );
    return toDetail(row);
  },

  // ── Archive / restore (#5 / #6, spec §3.6) ─────────────────────────────

  async archive(
    context: WorkspaceRequestContext,
    actorUserId: string,
    issueId: string,
    confirm: unknown,
  ): Promise<IssueDetail> {
    if (confirm !== true) throw new ConfirmationRequiredError();
    assertWorkspaceWritable(context);
    const stored = await resolveIssue(issueId, context);
    if (stored.archivedAt) throw new IssueAlreadyArchivedError();

    const row = await prisma.$transaction(async (tx) => {
      const fresh = requireIssue(
        await issuesRepository.findByIdScoped(tx, issueId, context.workspaceId),
      );
      if (fresh.archivedAt) throw new IssueAlreadyArchivedError();
      const updated = await issuesRepository.updateIssue(tx, issueId, {
        archivedAt: new Date(),
      });
      await issuesRepository.createHistory(tx, {
        workspaceId: context.workspaceId,
        issueId,
        actorId: actorUserId,
        event: 'ARCHIVED',
        oldValue: null,
        newValue: null,
      });
      return updated;
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        issueId,
        actorMemberId: context.memberId,
      },
      'issue.archived',
    );
    return toDetail(row);
  },

  async restore(
    context: WorkspaceRequestContext,
    actorUserId: string,
    issueId: string,
    confirm: unknown,
  ): Promise<IssueDetail> {
    if (confirm !== true) throw new ConfirmationRequiredError();
    assertWorkspaceWritable(context);
    const stored = await resolveIssue(issueId, context);
    if (!stored.archivedAt) throw new IssueNotArchivedError();

    const row = await prisma.$transaction(async (tx) => {
      const fresh = requireIssue(
        await issuesRepository.findByIdScoped(tx, issueId, context.workspaceId),
      );
      if (!fresh.archivedAt) throw new IssueNotArchivedError();
      const updated = await issuesRepository.updateIssue(tx, issueId, {
        archivedAt: null,
      });
      await issuesRepository.createHistory(tx, {
        workspaceId: context.workspaceId,
        issueId,
        actorId: actorUserId,
        event: 'RESTORED',
        oldValue: null,
        newValue: null,
      });
      return updated;
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        issueId,
        actorMemberId: context.memberId,
      },
      'issue.restored',
    );
    return toDetail(row);
  },

  // ── Permanent delete (#7, Owner/Admin only) ────────────────────────────

  async remove(
    context: WorkspaceRequestContext,
    issueId: string,
    confirmIdentifier: string,
  ): Promise<DeleteIssueResponse> {
    assertCanDelete(context);
    const stored = await resolveIssue(issueId, context);
    const identifier = identifierOf(stored.seqNumber);
    if (confirmIdentifier.trim() !== identifier) {
      throw new ConfirmIdentifierMismatchError();
    }

    await prisma.$transaction(async (tx) => {
      const fresh = requireIssue(
        await issuesRepository.findByIdScoped(tx, issueId, context.workspaceId),
      );
      if (confirmIdentifier.trim() !== identifierOf(fresh.seqNumber)) {
        throw new ConfirmIdentifierMismatchError();
      }
      // Cascades issue_label + issue_history (+ F6/F8 descendants per §7).
      await issuesRepository.removeIssue(tx, issueId);
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        issueId,
        identifier,
        actorMemberId: context.memberId,
      },
      'issue.deleted',
    );
    return { deletedIssueId: issueId, identifier };
  },

  // ── History (#8) ───────────────────────────────────────────────────────

  async listHistory(
    context: WorkspaceRequestContext,
    issueId: string,
    query: ListHistoryQuery,
  ): Promise<{ history: IssueHistoryCard[]; nextCursor: string | null }> {
    await resolveIssue(issueId, context);
    const limit = query.limit ?? HISTORY_LIMIT_DEFAULT;

    let skip: number | undefined;
    let cursor: { id: string } | undefined;
    if (query.cursor !== undefined) {
      const payload = decodeCursor<{ id?: unknown }>(query.cursor);
      if (typeof payload.id !== 'string' || payload.id.length === 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
      }
      const cursorRow = await prisma.issueHistory.findFirst({
        where: {
          id: payload.id,
          workspaceId: context.workspaceId,
          issueId,
        },
        select: { id: true },
      });
      if (!cursorRow) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
      }
      cursor = { id: payload.id };
      skip = 1;
    }

    const rows = await issuesRepository.listHistory(prisma, {
      workspaceId: context.workspaceId,
      issueId,
      take: limit + 1,
      ...(skip !== undefined ? { skip } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      history: page.map(toHistoryCard),
      nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null,
    };
  },

  // ── Labels (#9–#12) ────────────────────────────────────────────────────

  async listLabels(
    context: WorkspaceRequestContext,
  ): Promise<{ labels: LabelCard[] }> {
    const rows = await issuesRepository.listLabels(prisma, context.workspaceId);
    return { labels: rows.map(toLabelCard) };
  },

  async createLabel(
    context: WorkspaceRequestContext,
    input: CreateLabelRequest,
  ): Promise<LabelCard> {
    assertWorkspaceWritable(context);
    const name = input.name.trim();

    const clash = await issuesRepository.findLabelByNameInWorkspace(
      prisma,
      context.workspaceId,
      name,
    );
    if (clash) throw new LabelNameConflictError();

    try {
      const row = await issuesRepository.createLabel(prisma, {
        workspaceId: context.workspaceId,
        name,
        color: input.color ?? DEFAULT_LABEL_COLOR,
      });
      logger.info(
        {
          workspaceId: context.workspaceId,
          labelId: row.id,
          name: row.name,
          actorMemberId: context.memberId,
        },
        'label.created',
      );
      return toLabelCard(row);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new LabelNameConflictError();
      }
      throw error;
    }
  },

  async updateLabel(
    context: WorkspaceRequestContext,
    labelId: string,
    input: UpdateLabelRequest,
  ): Promise<LabelCard> {
    assertWorkspaceWritable(context);
    const stored = await issuesRepository.findLabelByIdScoped(
      prisma,
      labelId,
      context.workspaceId,
    );
    if (!stored) throw new LabelNotFoundError();

    const data: { name?: string; color?: string } = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name !== stored.name) {
        const clash = await issuesRepository.findLabelByNameInWorkspace(
          prisma,
          context.workspaceId,
          name,
        );
        if (clash && clash.id !== labelId) throw new LabelNameConflictError();
        data.name = name;
      }
    }
    if (input.color !== undefined && input.color !== stored.color) {
      data.color = input.color;
    }

    if (Object.keys(data).length === 0) return toLabelCard(stored);

    try {
      const row = await issuesRepository.updateLabel(prisma, labelId, data);
      logger.info(
        {
          workspaceId: context.workspaceId,
          labelId,
          updatedFields: Object.keys(data),
          actorMemberId: context.memberId,
        },
        'label.updated',
      );
      return toLabelCard(row);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new LabelNameConflictError();
      }
      throw error;
    }
  },

  async removeLabel(
    context: WorkspaceRequestContext,
    labelId: string,
    confirm: unknown,
  ): Promise<DeleteLabelResponse> {
    if (confirm !== true) throw new ConfirmationRequiredError();
    assertWorkspaceWritable(context);
    const stored = await issuesRepository.findLabelByIdScoped(
      prisma,
      labelId,
      context.workspaceId,
    );
    if (!stored) throw new LabelNotFoundError();

    const unlinkedIssues = await prisma.$transaction(async (tx) => {
      const count = await issuesRepository.countLabelJoins(tx, labelId);
      await issuesRepository.removeLabel(tx, labelId);
      return count;
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        labelId,
        unlinkedIssues,
        actorMemberId: context.memberId,
      },
      'label.deleted',
    );
    return { deletedLabelId: labelId, unlinkedIssues };
  },

  // ── Attach / detach (#13 / #14) ────────────────────────────────────────

  async attachLabel(
    context: WorkspaceRequestContext,
    actorUserId: string,
    issueId: string,
    body: AttachLabelRequest,
  ): Promise<IssueDetail> {
    assertWorkspaceWritable(context);
    const stored = await resolveIssue(issueId, context);
    if (stored.archivedAt) throw new IssueArchivedError();

    const label = await issuesRepository.findLabelByIdScoped(
      prisma,
      body.labelId,
      context.workspaceId,
    );
    if (!label) throw new LabelNotInWorkspaceError();

    const existing = await issuesRepository.findJoin(
      prisma,
      issueId,
      body.labelId,
    );
    if (existing) throw new LabelAlreadyAttachedError();

    const row = await prisma.$transaction(async (tx) => {
      const fresh = requireIssue(
        await issuesRepository.findByIdScoped(tx, issueId, context.workspaceId),
      );
      if (fresh.archivedAt) throw new IssueArchivedError();
      const freshLabel = await issuesRepository.findLabelByIdScoped(
        tx,
        body.labelId,
        context.workspaceId,
      );
      if (!freshLabel) throw new LabelNotInWorkspaceError();
      const freshJoin = await issuesRepository.findJoin(
        tx,
        issueId,
        body.labelId,
      );
      if (freshJoin) throw new LabelAlreadyAttachedError();

      await issuesRepository.createJoin(tx, issueId, body.labelId);
      await issuesRepository.createHistory(tx, {
        workspaceId: context.workspaceId,
        issueId,
        actorId: actorUserId,
        event: 'LABEL_ADDED',
        oldValue: null,
        newValue: body.labelId,
      });
      return requireIssue(
        await issuesRepository.findByIdScoped(tx, issueId, context.workspaceId),
      );
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        issueId,
        labelId: body.labelId,
        actorMemberId: context.memberId,
      },
      'issue.label_attached',
    );
    return toDetail(row);
  },

  async detachLabel(
    context: WorkspaceRequestContext,
    actorUserId: string,
    issueId: string,
    labelId: string,
  ): Promise<IssueDetail> {
    assertWorkspaceWritable(context);
    const stored = await resolveIssue(issueId, context);
    if (stored.archivedAt) throw new IssueArchivedError();

    const join = await issuesRepository.findJoin(prisma, issueId, labelId);
    if (!join) {
      const label = await issuesRepository.findLabelByIdScoped(
        prisma,
        labelId,
        context.workspaceId,
      );
      if (!label) throw new LabelNotFoundError();
      throw new LabelNotAttachedError();
    }

    const row = await prisma.$transaction(async (tx) => {
      const fresh = requireIssue(
        await issuesRepository.findByIdScoped(tx, issueId, context.workspaceId),
      );
      if (fresh.archivedAt) throw new IssueArchivedError();
      const freshJoin = await issuesRepository.findJoin(tx, issueId, labelId);
      if (!freshJoin) throw new LabelNotAttachedError();

      await issuesRepository.removeJoin(tx, issueId, labelId);
      await issuesRepository.createHistory(tx, {
        workspaceId: context.workspaceId,
        issueId,
        actorId: actorUserId,
        event: 'LABEL_REMOVED',
        oldValue: labelId,
        newValue: null,
      });
      return requireIssue(
        await issuesRepository.findByIdScoped(tx, issueId, context.workspaceId),
      );
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        issueId,
        labelId,
        actorMemberId: context.memberId,
      },
      'issue.label_detached',
    );
    return toDetail(row);
  },

  // ── F3 membership-exit contract (api-design §8.7) ───────────────────────
  //
  // Owned by issues, called by members inside the caller's transaction.

  /**
   * Unassign every issue (archived included — no archivedAt filter) owned by
   * the departing member and emit one UNASSIGNED row per affected issue.
   * Runs inside the caller's transaction. Returns the number unassigned.
   */
  async unassignOnMemberExit(
    workspaceId: string,
    userId: string,
    tx: DbClient,
    actorId: string | null = null,
  ): Promise<number> {
    const assigned = await issuesRepository.findAssignedIssueIds(
      tx,
      workspaceId,
      userId,
    );
    if (assigned.length === 0) return 0;
    await issuesRepository.unassignIssues(tx, workspaceId, userId);
    await issuesRepository.createManyHistory(
      tx,
      assigned.map((row) => ({
        workspaceId,
        issueId: row.id,
        actorId,
        event: 'UNASSIGNED' as const,
        oldValue: userId,
        newValue: null,
      })),
    );
    logger.info(
      { workspaceId, userId, unassignedIssues: assigned.length },
      'issue.unassigned_on_member_exit',
    );
    return assigned.length;
  },

  // ── F4 project-delete contract (projects data-model §6.4/§7) ─────────────
  //
  // Owned by issues, called by projects inside the caller's transaction.
  // Detaches every issue (archived included — no archivedAt filter) from the
  // deleted project and emits one PROJECT_CHANGED row per affected issue.

  /**
   * Clears `projectId` on every issue of the deleted project and emits one
   * PROJECT_CHANGED row per affected issue. Runs inside the caller's
   * transaction. Returns the number of detached issues.
   */
  async unassignOnProjectDelete(
    workspaceId: string,
    projectId: string,
    tx: DbClient,
    actorId: string | null = null,
  ): Promise<number> {
    const attached = await tx.issue.findMany({
      where: { workspaceId, projectId },
      select: { id: true },
    });
    if (attached.length === 0) return 0;
    await tx.issue.updateMany({
      where: { workspaceId, projectId },
      data: { projectId: null },
    });
    await issuesRepository.createManyHistory(
      tx,
      attached.map((row) => ({
        workspaceId,
        issueId: row.id,
        actorId,
        event: 'PROJECT_CHANGED' as const,
        oldValue: projectId,
        newValue: null,
      })),
    );
    logger.info(
      { workspaceId, projectId, unassignedIssues: attached.length },
      'issue.unassigned_on_project_delete',
    );
    return attached.length;
  },
};

export { PRIORITY_RANK };
