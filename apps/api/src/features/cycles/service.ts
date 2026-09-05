import type {
  CreateCycleRequest,
  CycleCard,
  CycleDetail,
  CycleProgress,
  DeleteCycleResponse,
  UpdateCycleRequest,
} from '@shipyard/shared';
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
  AnotherActiveExistsError,
  CompleteFirstError,
  CycleAlreadyArchivedError,
  CycleArchivedError,
  CycleNameConflictError,
  CycleNotArchivedError,
  CycleNotDeletableError,
  CycleNotFoundError,
  CycleNotInWorkspaceError,
  CycleOverlapError,
  CycleReadOnlyError,
  InvalidCycleTransitionError,
} from './errors.js';
import {
  cyclesRepository,
  type CycleRow,
  type DbClient,
} from './repository.js';
import { issuesService } from '../issues/service.js';
import { activityService } from '../activity/service.js';
import type { ListCyclesQuery } from './schemas.js';

/**
 * Cycles service — owns the scheduling contract (D3/D5/D6), the controlled
 * lifecycle matrix, archive/restore/delete, progress derivation, and the
 * `assertCycleAssignable` contract the issues module calls in-tx.
 *
 * Writes run inside `$transaction` with guards re-evaluated inside; the DB
 * constraints are the race backstop (a constraint hit is mapped back to the
 * friendly code via post-tx re-checks). Concurrent conflicting commits are
 * safe: one wins, the loser gets the same 409 the pre-check would have given.
 *
 * NOTE on module coupling: this module calls `issuesService` (delete leg)
 * while the issues module calls back `cyclesService.assertCycleAssignable`.
 * The references are function-body-deferred, so the ESM cycle is safe —
 * same justification as the F3→F4 Checkpoint B pattern, now bidirectional.
 */

const LIST_LIMIT = 500;

/** Day-precision dates are stored as Postgres DATE and returned as YYYY-MM-DD. */
function requireDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Server "today" at day precision (UTC, matching @db.Date coercion). */
function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyProgress(): CycleProgress {
  return { total: 0, completed: 0, percent: null };
}

// Exported for the search module (F10): grouped hits re-render owning card
// shapes exactly — progress derivation and mapping stay single-sourced here.
export async function progressFor(
  client: DbClient,
  workspaceId: string,
  cycleIds: string[],
): Promise<Map<string, CycleProgress>> {
  const result = new Map<string, CycleProgress>();
  for (const id of cycleIds) result.set(id, emptyProgress());
  if (cycleIds.length === 0) return result;

  const [totals, dones] = await Promise.all([
    cyclesRepository.countIssuesByCycle(client, workspaceId, cycleIds),
    cyclesRepository.countDoneByCycle(client, workspaceId, cycleIds),
  ]);
  for (const row of totals) {
    if (row.cycleId)
      result.set(row.cycleId, {
        total: row._count._all,
        completed: 0,
        percent: null,
      });
  }
  for (const row of dones) {
    if (!row.cycleId) continue;
    const entry = result.get(row.cycleId) ?? emptyProgress();
    const completed = row._count._all;
    result.set(row.cycleId, {
      total: entry.total,
      completed,
      percent:
        entry.total === 0 ? null : Math.round((completed / entry.total) * 100),
    });
  }
  return result;
}

// Exported for the search module (F10) — see progressFor above.
export function toCard(row: CycleRow, progress: CycleProgress): CycleCard {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    status: row.status,
    startDate: requireDateString(row.startDate),
    endDate: requireDateString(row.endDate),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    progress,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: CycleRow, progress: CycleProgress): CycleDetail {
  return { ...toCard(row, progress), goal: row.goal };
}

async function cardFor(client: DbClient, row: CycleRow): Promise<CycleCard> {
  const progress = await progressFor(client, row.workspaceId, [row.id]);
  return toCard(row, progress.get(row.id) ?? emptyProgress());
}

function requireCycle(row: CycleRow | null): CycleRow {
  if (!row) throw new CycleNotFoundError();
  return row;
}

/** Manage-gate reassertion: active workspace + OWNER|ADMIN role. */
function assertCanManage(context: WorkspaceRequestContext): void {
  if (context.status === 'ARCHIVED') throw new WorkspaceArchivedError();
  if (context.role !== 'OWNER' && context.role !== 'ADMIN')
    throw new ForbiddenRoleError();
}

interface SiblingRange {
  id: string;
  startDate: Date;
  endDate: Date;
}

/** Inclusive-bounds overlap (matches daterange '[]' semantics). */
function findOverlap(
  start: Date,
  end: Date,
  siblings: SiblingRange[],
): SiblingRange | null {
  return (
    siblings.find(
      (sibling) => start <= sibling.endDate && sibling.startDate <= end,
    ) ?? null
  );
}

/** Prisma constraint-hit codes worth mapping (unique/partial/exclusion). */
function isDbConflict(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  if (code === 'P2002' || code === 'P2010') return true;
  const message = (error as { message?: string }).message ?? '';
  return (
    message.includes('cycle_no_overlap') ||
    message.includes('cycle_single_active') ||
    message.includes('cycle_name_unique')
  );
}

async function resolveCycle(
  cycleId: string,
  context: WorkspaceRequestContext,
): Promise<CycleRow> {
  return requireCycle(
    await cyclesRepository.findByIdScoped(prisma, cycleId, context.workspaceId),
  );
}

export const cyclesService = {
  // ── Read ───────────────────────────────────────────────────────────────

  async list(
    context: WorkspaceRequestContext,
    query: ListCyclesQuery,
  ): Promise<{ cycles: CycleCard[] }> {
    const sort = query.sort ?? 'startDate';
    const order = query.order ?? 'asc';
    const rows = await cyclesRepository.list(prisma, {
      workspaceId: context.workspaceId,
      where: {
        archivedAt: query.archived === 'true' ? { not: null } : null,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ [sort]: order }, { id: order }],
      take: LIST_LIMIT,
    });
    const progress = await progressFor(
      prisma,
      context.workspaceId,
      rows.map((row) => row.id),
    );
    return {
      cycles: rows.map((row) =>
        toCard(row, progress.get(row.id) ?? emptyProgress()),
      ),
    };
  },

  async getDetail(
    context: WorkspaceRequestContext,
    cycleId: string,
  ): Promise<CycleDetail> {
    const row = await resolveCycle(cycleId, context);
    const progress = await progressFor(prisma, context.workspaceId, [row.id]);
    return toDetail(row, progress.get(row.id) ?? emptyProgress());
  },

  /**
   * F9 dashboard contract (api-design §3.2): the workspace's single active
   * non-archived cycle with inline progress, or null (empty state is data).
   * D6 guarantees ≤1 row via the partial unique index — two rows is a
   * data-integrity bug, logged with the first row served.
   */
  async getActive(workspaceId: string): Promise<CycleCard | null> {
    const rows = await cyclesRepository.list(prisma, {
      workspaceId,
      where: { status: 'ACTIVE', archivedAt: null },
      orderBy: [{ createdAt: 'asc' }],
      take: 2,
    });
    if (rows.length > 1) {
      logger.error(
        { workspaceId, actives: rows.length },
        'cycle.multiple_active_violation',
      );
    }
    const row = rows[0];
    if (!row) return null;
    return cardFor(prisma, row);
  },

  // ── Create (spec §4.1) ─────────────────────────────────────────────────

  async create(
    context: WorkspaceRequestContext,
    actorUserId: string,
    input: CreateCycleRequest,
  ): Promise<CycleDetail> {
    assertCanManage(context);
    const name = input.name.trim();
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    const clash = await cyclesRepository.findByNameInWorkspace(
      prisma,
      context.workspaceId,
      name,
    );
    if (clash) throw new CycleNameConflictError(await cardFor(prisma, clash));

    const siblings = await cyclesRepository.findSchedulingSiblings(
      prisma,
      context.workspaceId,
    );
    const overlapped = findOverlap(startDate, endDate, siblings);
    if (overlapped) {
      const row = requireCycle(
        await cyclesRepository.findByIdScoped(
          prisma,
          overlapped.id,
          context.workspaceId,
        ),
      );
      throw new CycleOverlapError(await cardFor(prisma, row));
    }

    try {
      const row = await prisma.$transaction(async (tx) => {
        const created = await cyclesRepository.create(tx, {
          workspaceId: context.workspaceId,
          name,
          goal: input.goal ?? null,
          startDate,
          endDate,
        });
        const actor = await cyclesRepository.findUserName(tx, actorUserId);
        const actorName = actor?.name ?? 'Someone';
        await activityService.record(
          {
            workspaceId: context.workspaceId,
            actorId: actorUserId,
            actorName,
            kind: 'CYCLE_CREATED',
            entityType: 'CYCLE',
            entityId: created.id,
            entityTitle: created.name,
            summary: `${actorName} created cycle \u201c${created.name}\u201d`,
          },
          tx,
        );
        return created;
      });
      logger.info(
        {
          workspaceId: context.workspaceId,
          slug: context.slug,
          cycleId: row.id,
          name: row.name,
          actorMemberId: context.memberId,
        },
        'cycle.created',
      );
      return toDetail(row, emptyProgress());
    } catch (error) {
      if (!isDbConflict(error)) throw error;
      // Race backstop: re-read to name the guard that actually failed.
      const racedClash = await cyclesRepository.findByNameInWorkspace(
        prisma,
        context.workspaceId,
        name,
      );
      if (racedClash) {
        throw new CycleNameConflictError(await cardFor(prisma, racedClash));
      }
      const racedSiblings = await cyclesRepository.findSchedulingSiblings(
        prisma,
        context.workspaceId,
      );
      const racedOverlap = findOverlap(startDate, endDate, racedSiblings);
      if (racedOverlap) {
        const row = requireCycle(
          await cyclesRepository.findByIdScoped(
            prisma,
            racedOverlap.id,
            context.workspaceId,
          ),
        );
        throw new CycleOverlapError(await cardFor(prisma, row));
      }
      throw error;
    }
  },

  // ── Update (PLANNED/ACTIVE only; no status field) ───────────────────────

  async update(
    context: WorkspaceRequestContext,
    cycleId: string,
    input: UpdateCycleRequest,
  ): Promise<CycleDetail> {
    assertCanManage(context);
    const stored = await resolveCycle(cycleId, context);
    if (stored.archivedAt) throw new CycleArchivedError();
    if (stored.status === 'COMPLETED') throw new CycleReadOnlyError();

    if (input.name !== undefined) {
      const clash = await cyclesRepository.findByNameInWorkspace(
        prisma,
        context.workspaceId,
        input.name.trim(),
      );
      if (clash && clash.id !== cycleId) {
        throw new CycleNameConflictError(await cardFor(prisma, clash));
      }
    }

    const startDate =
      input.startDate !== undefined
        ? new Date(input.startDate)
        : stored.startDate;
    const endDate =
      input.endDate !== undefined ? new Date(input.endDate) : stored.endDate;
    if (endDate < startDate) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'End date must be on or after the start date',
      );
    }

    if (input.startDate !== undefined || input.endDate !== undefined) {
      const siblings = await cyclesRepository.findSchedulingSiblings(
        prisma,
        context.workspaceId,
        cycleId,
      );
      const overlapped = findOverlap(startDate, endDate, siblings);
      if (overlapped) {
        const row = requireCycle(
          await cyclesRepository.findByIdScoped(
            prisma,
            overlapped.id,
            context.workspaceId,
          ),
        );
        throw new CycleOverlapError(await cardFor(prisma, row));
      }
    }

    const data: Parameters<typeof cyclesRepository.update>[2] = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.goal !== undefined) data.goal = input.goal;
    if (input.startDate !== undefined) data.startDate = startDate;
    if (input.endDate !== undefined) data.endDate = endDate;

    try {
      const row = await prisma.$transaction((tx) =>
        cyclesRepository.update(tx, cycleId, data),
      );
      logger.info(
        {
          workspaceId: context.workspaceId,
          cycleId,
          updatedFields: Object.keys(data),
          actorMemberId: context.memberId,
        },
        'cycle.updated',
      );
      const progress = await progressFor(prisma, context.workspaceId, [row.id]);
      return toDetail(row, progress.get(row.id) ?? emptyProgress());
    } catch (error) {
      if (!isDbConflict(error)) throw error;
      const racedClash =
        input.name !== undefined
          ? await cyclesRepository.findByNameInWorkspace(
              prisma,
              context.workspaceId,
              input.name.trim(),
            )
          : null;
      if (racedClash && racedClash.id !== cycleId) {
        throw new CycleNameConflictError(await cardFor(prisma, racedClash));
      }
      throw new CycleOverlapError();
    }
  },

  // ── Start / reopen (shared activation path, same guards) ───────────────

  async start(
    context: WorkspaceRequestContext,
    actorUserId: string,
    cycleId: string,
    confirm: unknown,
  ): Promise<CycleDetail> {
    return activate(context, actorUserId, cycleId, confirm, 'PLANNED');
  },

  async reopen(
    context: WorkspaceRequestContext,
    actorUserId: string,
    cycleId: string,
    confirm: unknown,
  ): Promise<CycleDetail> {
    return activate(context, actorUserId, cycleId, confirm, 'COMPLETED');
  },

  // ── Complete (ACTIVE → COMPLETED; no issue writes, rule 9) ─────────────

  async complete(
    context: WorkspaceRequestContext,
    actorUserId: string,
    cycleId: string,
    confirm: unknown,
  ): Promise<CycleDetail> {
    if (confirm !== true) throw new ConfirmationRequiredError();
    assertCanManage(context);
    const stored = await resolveCycle(cycleId, context);
    if (stored.archivedAt) throw new CycleArchivedError();
    if (stored.status !== 'ACTIVE') throw new InvalidCycleTransitionError();

    const row = await prisma.$transaction(async (tx) => {
      const fresh = requireCycle(
        await cyclesRepository.findByIdScoped(tx, cycleId, context.workspaceId),
      );
      if (fresh.archivedAt) throw new CycleArchivedError();
      if (fresh.status !== 'ACTIVE') throw new InvalidCycleTransitionError();
      const updated = await cyclesRepository.update(tx, cycleId, {
        status: 'COMPLETED',
      });
      const actor = await cyclesRepository.findUserName(tx, actorUserId);
      const actorName = actor?.name ?? 'Someone';
      await activityService.record(
        {
          workspaceId: context.workspaceId,
          actorId: actorUserId,
          actorName,
          kind: 'CYCLE_COMPLETED',
          entityType: 'CYCLE',
          entityId: cycleId,
          entityTitle: fresh.name,
          summary: `${actorName} completed cycle \u201c${fresh.name}\u201d`,
        },
        tx,
      );
      return updated;
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        cycleId,
        actorMemberId: context.memberId,
      },
      'cycle.completed',
    );
    const progress = await progressFor(prisma, context.workspaceId, [row.id]);
    return toDetail(row, progress.get(row.id) ?? emptyProgress());
  },

  // ── Archive / restore (spec §3.2) ──────────────────────────────────────

  async archive(
    context: WorkspaceRequestContext,
    actorUserId: string,
    cycleId: string,
    confirm: unknown,
  ): Promise<CycleDetail> {
    if (confirm !== true) throw new ConfirmationRequiredError();
    assertCanManage(context);
    const stored = await resolveCycle(cycleId, context);
    if (stored.archivedAt) throw new CycleAlreadyArchivedError();
    if (stored.status === 'ACTIVE') throw new CompleteFirstError();

    const row = await prisma.$transaction(async (tx) => {
      const updated = await cyclesRepository.update(tx, cycleId, {
        archivedAt: new Date(),
      });
      const actor = await cyclesRepository.findUserName(tx, actorUserId);
      const actorName = actor?.name ?? 'Someone';
      await activityService.record(
        {
          workspaceId: context.workspaceId,
          actorId: actorUserId,
          actorName,
          kind: 'CYCLE_ARCHIVED',
          entityType: 'CYCLE',
          entityId: cycleId,
          entityTitle: stored.name,
          summary: `${actorName} archived cycle \u201c${stored.name}\u201d`,
        },
        tx,
      );
      return updated;
    });
    logger.info(
      {
        workspaceId: context.workspaceId,
        cycleId,
        actorMemberId: context.memberId,
      },
      'cycle.archived',
    );
    const progress = await progressFor(prisma, context.workspaceId, [row.id]);
    return toDetail(row, progress.get(row.id) ?? emptyProgress());
  },

  async restore(
    context: WorkspaceRequestContext,
    actorUserId: string,
    cycleId: string,
    confirm: unknown,
  ): Promise<CycleDetail> {
    if (confirm !== true) throw new ConfirmationRequiredError();
    assertCanManage(context);
    const stored = await resolveCycle(cycleId, context);
    if (!stored.archivedAt) throw new CycleNotArchivedError();

    try {
      const row = await prisma.$transaction(async (tx) => {
        const fresh = requireCycle(
          await cyclesRepository.findByIdScoped(
            tx,
            cycleId,
            context.workspaceId,
          ),
        );
        if (!fresh.archivedAt) throw new CycleNotArchivedError();
        // The exclusion constraint re-evaluates at commit — pre-check for
        // the friendly error; a race still maps to the same code below.
        const siblings = await cyclesRepository.findSchedulingSiblings(
          tx,
          context.workspaceId,
          cycleId,
        );
        const overlapped = findOverlap(
          fresh.startDate,
          fresh.endDate,
          siblings,
        );
        if (overlapped) {
          const conflict = requireCycle(
            await cyclesRepository.findByIdScoped(
              tx,
              overlapped.id,
              context.workspaceId,
            ),
          );
          throw new CycleOverlapError(await cardFor(tx, conflict));
        }
        const updated = await cyclesRepository.update(tx, cycleId, {
          archivedAt: null,
        });
        const actor = await cyclesRepository.findUserName(tx, actorUserId);
        const actorName = actor?.name ?? 'Someone';
        await activityService.record(
          {
            workspaceId: context.workspaceId,
            actorId: actorUserId,
            actorName,
            kind: 'CYCLE_RESTORED',
            entityType: 'CYCLE',
            entityId: cycleId,
            entityTitle: stored.name,
            summary: `${actorName} restored cycle \u201c${stored.name}\u201d`,
          },
          tx,
        );
        return updated;
      });
      logger.info(
        {
          workspaceId: context.workspaceId,
          cycleId,
          actorMemberId: context.memberId,
        },
        'cycle.restored',
      );
      const progress = await progressFor(prisma, context.workspaceId, [row.id]);
      return toDetail(row, progress.get(row.id) ?? emptyProgress());
    } catch (error) {
      if (error instanceof CycleOverlapError) throw error;
      if (!isDbConflict(error)) throw error;
      const siblings = await cyclesRepository.findSchedulingSiblings(
        prisma,
        context.workspaceId,
        cycleId,
      );
      const overlapped = findOverlap(
        stored.startDate,
        stored.endDate,
        siblings,
      );
      if (overlapped) {
        const conflict = requireCycle(
          await cyclesRepository.findByIdScoped(
            prisma,
            overlapped.id,
            context.workspaceId,
          ),
        );
        throw new CycleOverlapError(await cardFor(prisma, conflict));
      }
      throw error;
    }
  },

  // ── Permanent delete (future PLANNED only, spec rule 10) ───────────────

  async remove(
    context: WorkspaceRequestContext,
    actorUserId: string,
    cycleId: string,
    confirm: unknown,
  ): Promise<DeleteCycleResponse> {
    if (confirm !== true) throw new ConfirmationRequiredError();
    assertCanManage(context);
    const stored = await resolveCycle(cycleId, context);
    assertDeletable(stored);

    const unassignedIssues = await prisma.$transaction(async (tx) => {
      const fresh = requireCycle(
        await cyclesRepository.findByIdScoped(tx, cycleId, context.workspaceId),
      );
      assertDeletable(fresh);
      // F7 leg: unassign issues (SetNull + CYCLE_CHANGED rows, actor =
      // deleter) — issues survive the delete.
      const unassigned = await issuesService.unassignOnCycleDelete(
        context.workspaceId,
        cycleId,
        tx,
        actorUserId,
      );
      await cyclesRepository.remove(tx, cycleId);
      // D3 proof: CYCLE_DELETED recorded AFTER the row goes. Plain-string
      // target, no FK → survives the very deletion it describes.
      const actor = await cyclesRepository.findUserName(tx, actorUserId);
      const actorName = actor?.name ?? 'Someone';
      await activityService.record(
        {
          workspaceId: context.workspaceId,
          actorId: actorUserId,
          actorName,
          kind: 'CYCLE_DELETED',
          entityType: 'CYCLE',
          entityId: cycleId,
          entityTitle: stored.name,
          summary: `${actorName} deleted cycle \u201c${stored.name}\u201d`,
        },
        tx,
      );
      return unassigned;
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        cycleId,
        name: stored.name,
        actorMemberId: context.memberId,
        unassignedIssues,
      },
      'cycle.deleted',
    );
    return { deletedCycleId: cycleId, unassignedIssues };
  },

  // ── Issues-leg validation contract (api-design §3.3) ───────────────────
  //
  // Called by the issues service in-tx on PATCH { cycleId }. COMPLETED
  // passes (locked correction path, D7); archived never does.

  async assertCycleAssignable(
    workspaceId: string,
    cycleId: string,
    tx: DbClient,
  ): Promise<CycleRow> {
    const row = await cyclesRepository.findByIdScoped(tx, cycleId, workspaceId);
    if (!row) throw new CycleNotInWorkspaceError();
    if (row.archivedAt) throw new CycleArchivedError();
    return row;
  },
};

/** Delete eligibility: future PLANNED, non-archived (single code, §6.6). */
function assertDeletable(row: CycleRow): void {
  if (row.archivedAt) {
    throw new CycleNotDeletableError(
      'Archived cycles cannot be deleted — restore it first',
    );
  }
  if (row.status !== 'PLANNED') {
    throw new CycleNotDeletableError(
      `Only planned cycles can be deleted (current status: ${row.status})`,
    );
  }
  if (requireDateString(row.startDate) <= todayString()) {
    throw new CycleNotDeletableError(
      'Only future planned cycles can be deleted — this one already started',
    );
  }
}

/** Start/reopen shared path: same guards, different expected source status. */
async function activate(
  context: WorkspaceRequestContext,
  actorUserId: string,
  cycleId: string,
  confirm: unknown,
  from: 'PLANNED' | 'COMPLETED',
): Promise<CycleDetail> {
  if (confirm !== true) throw new ConfirmationRequiredError();
  assertCanManage(context);
  const stored = await resolveCycle(cycleId, context);
  if (stored.archivedAt) throw new CycleArchivedError();
  if (stored.status !== from) throw new InvalidCycleTransitionError();

  try {
    const row = await prisma.$transaction(async (tx) => {
      const fresh = requireCycle(
        await cyclesRepository.findByIdScoped(tx, cycleId, context.workspaceId),
      );
      if (fresh.archivedAt) throw new CycleArchivedError();
      if (fresh.status !== from) throw new InvalidCycleTransitionError();

      const holder = await cyclesRepository.findActive(
        tx,
        context.workspaceId,
        cycleId,
      );
      if (holder) {
        throw new AnotherActiveExistsError(await cardFor(tx, holder));
      }
      const siblings = await cyclesRepository.findSchedulingSiblings(
        tx,
        context.workspaceId,
        cycleId,
      );
      const overlapped = findOverlap(fresh.startDate, fresh.endDate, siblings);
      if (overlapped) {
        const conflict = requireCycle(
          await cyclesRepository.findByIdScoped(
            tx,
            overlapped.id,
            context.workspaceId,
          ),
        );
        throw new CycleOverlapError(await cardFor(tx, conflict));
      }
      const updated = await cyclesRepository.update(tx, cycleId, {
        status: 'ACTIVE',
      });
      // Activity: CYCLE_STARTED (from PLANNED) / CYCLE_REOPENED (from
      // COMPLETED) — same in-tx path, different kind.
      const actor = await cyclesRepository.findUserName(tx, actorUserId);
      const actorName = actor?.name ?? 'Someone';
      await activityService.record(
        {
          workspaceId: context.workspaceId,
          actorId: actorUserId,
          actorName,
          kind: from === 'PLANNED' ? 'CYCLE_STARTED' : 'CYCLE_REOPENED',
          entityType: 'CYCLE',
          entityId: cycleId,
          entityTitle: fresh.name,
          summary: `${actorName} ${from === 'PLANNED' ? 'started' : 'reopened'} cycle \u201c${fresh.name}\u201d`,
        },
        tx,
      );
      return updated;
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        cycleId,
        from,
        actorMemberId: context.memberId,
      },
      'cycle.activated',
    );
    const progress = await progressFor(prisma, context.workspaceId, [row.id]);
    return toDetail(row, progress.get(row.id) ?? emptyProgress());
  } catch (error) {
    if (
      error instanceof AnotherActiveExistsError ||
      error instanceof CycleOverlapError ||
      error instanceof CycleArchivedError ||
      error instanceof InvalidCycleTransitionError
    ) {
      throw error;
    }
    if (!isDbConflict(error)) throw error;
    // Race backstop: re-read to name the guard that actually failed.
    const holder = await cyclesRepository.findActive(
      prisma,
      context.workspaceId,
      cycleId,
    );
    if (holder) {
      throw new AnotherActiveExistsError(await cardFor(prisma, holder));
    }
    throw new CycleOverlapError();
  }
}
