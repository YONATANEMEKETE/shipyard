import type {
  CreateProjectRequest,
  ProjectCard,
  ProjectDetail,
  UpdateProjectRequest,
  ViewPreference,
  ViewScope,
  ViewType,
} from '@shipyard/shared';
import type { Prisma } from '../../generated/client.js';
import { logger } from '../../common/logger/index.js';
import { prisma } from '../../common/db/client.js';
import { resolveImageUrl } from '../../common/storage/imageUrl.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import {
  ForbiddenRoleError,
  WorkspaceArchivedError,
  ConfirmationRequiredError,
} from '../workspace/errors.js';
import {
  ProjectNotFoundError,
  ProjectNameConflictError,
  ProjectArchivedError,
  AlreadyArchivedError,
  NotArchivedError,
  TransferTargetInvalidError,
  ConfirmNameMismatchError,
} from './errors.js';
import {
  projectsRepository,
  projectInclude,
  type DbClient,
  type ProjectRow,
} from './repository.js';
import { issuesService } from '../issues/service.js';
import { activityService } from '../activity/service.js';
import type { ListProjectsQuery } from './schemas.js';

/**
 * Projects service — owns business rules, state transitions, name uniqueness,
 * owner transfer, archive/restore/delete, and the project-level read-only
 * matrix (api-design.md §6.2). Writes run inside `$transaction` and reassert
 * archive/role state (defense in depth — guards already ran).
 */

const LIST_LIMIT = 500;

/** Day-precision dates are stored as Postgres DATE and returned as YYYY-MM-DD. */
function toDateString(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

// Exported for the search module (F10): grouped hits re-render owning card
// shapes exactly — mapping stays single-sourced here, never duplicated.
export function toCard(row: ProjectRow): ProjectCard {
  const ownerMembership = row.owner.workspaceMembers[0];
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    status: row.status,
    owner: {
      memberId: ownerMembership?.id ?? row.ownerId,
      userId: row.owner.id,
      name: row.owner.name,
      email: row.owner.email,
      image: resolveImageUrl(row.owner.image),
    },
    description: row.description ?? null,
    startDate: toDateString(row.startDate),
    targetDate: toDateString(row.targetDate),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: ProjectRow): ProjectDetail {
  return toCard(row);
}

function requireProject(row: ProjectRow | null): ProjectRow {
  if (!row) throw new ProjectNotFoundError();
  return row;
}

/** Write-gate reassertion: active workspace + OWNER|ADMIN role. */
function assertCanEdit(context: WorkspaceRequestContext): void {
  if (context.status === 'ARCHIVED') throw new WorkspaceArchivedError();
  if (context.role !== 'OWNER' && context.role !== 'ADMIN')
    throw new ForbiddenRoleError();
}

async function resolveProject(
  projectId: string,
  context: WorkspaceRequestContext,
): Promise<ProjectRow> {
  return requireProject(
    await projectsRepository.findByIdScoped(
      prisma,
      projectId,
      context.workspaceId,
    ),
  );
}

export const projectsService = {
  // ── Read ───────────────────────────────────────────────────────────────

  async list(
    context: WorkspaceRequestContext,
    query: ListProjectsQuery,
  ): Promise<ProjectCard[]> {
    // Archived projects are list/board-hidden by default; ?archived=true
    // returns only archived ones (archived view). Never both (spec §3.2).
    const where: Prisma.ProjectWhereInput = {
      archivedAt: query.archived === 'true' ? { not: null } : null,
    };
    if (query.status) where.status = query.status;
    if (query.ownerId) where.ownerId = query.ownerId;
    if (query.startDate) where.startDate = new Date(query.startDate);
    if (query.targetDate) where.targetDate = new Date(query.targetDate);

    const sort = query.sort ?? 'createdAt';
    const order = query.order ?? 'desc';
    const orderBy: Prisma.ProjectOrderByWithRelationInput = {
      [sort]: order,
    };

    const rows = await projectsRepository.list(prisma, {
      workspaceId: context.workspaceId,
      where,
      orderBy,
      take: LIST_LIMIT,
    });
    return rows.map(toCard);
  },

  async getDetail(
    context: WorkspaceRequestContext,
    projectId: string,
  ): Promise<ProjectDetail> {
    return toDetail(await resolveProject(projectId, context));
  },

  /**
   * F9 dashboard contract (api-design §3.2): active non-archived projects,
   * hard cap 20. The hub panel derives progress per project downstream —
   * this module owns the filter, scope, and card mapping.
   */
  async listActive(workspaceId: string): Promise<ProjectCard[]> {
    const rows = await projectsRepository.list(prisma, {
      workspaceId,
      where: { status: 'ACTIVE', archivedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map(toCard);
  },

  // ── Create (spec §3.1) ────────────────────────────────────────────────

  async create(
    context: WorkspaceRequestContext,
    userId: string,
    input: CreateProjectRequest,
  ): Promise<ProjectDetail> {
    assertCanEdit(context);

    const existing = await projectsRepository.findByNameInWorkspace(
      prisma,
      context.workspaceId,
      input.name,
    );
    if (existing) throw new ProjectNameConflictError();

    try {
      const row = await prisma.$transaction((tx) =>
        (async () => {
          const created = await projectsRepository.create(tx, {
            workspaceId: context.workspaceId,
            name: input.name,
            status: input.status ?? 'ACTIVE',
            ownerId: userId,
            description: input.description ?? null,
            startDate: input.startDate ? new Date(input.startDate) : null,
            targetDate: input.targetDate ? new Date(input.targetDate) : null,
          });
          // Creator == owner: the created row already carries the frozen
          // actor name (no extra lookup).
          await activityService.record(
            {
              workspaceId: context.workspaceId,
              actorId: userId,
              actorName: created.owner.name,
              kind: 'PROJECT_CREATED',
              entityType: 'PROJECT',
              entityId: created.id,
              entityTitle: created.name,
              summary: `${created.owner.name} created project "${created.name}"`,
            },
            tx,
          );
          return created;
        })(),
      );
      logger.info(
        {
          workspaceId: context.workspaceId,
          slug: context.slug,
          projectId: row.id,
          name: row.name,
          createdByUserId: userId,
        },
        'project.created',
      );
      return toDetail(row);
    } catch (error) {
      // Race: the D3 functional index is the source of truth for uniqueness.
      if ((error as { code?: string }).code === 'P2002')
        throw new ProjectNameConflictError();
      throw error;
    }
  },

  // ── Update (fields + free status switch; also the board drag) ──────────

  async update(
    context: WorkspaceRequestContext,
    projectId: string,
    input: UpdateProjectRequest,
    actorUserId: string,
  ): Promise<ProjectDetail> {
    assertCanEdit(context);
    const project = await resolveProject(projectId, context);
    if (project.archivedAt) throw new ProjectArchivedError();

    if (input.name !== undefined) {
      // Rename re-checks uniqueness; archived projects reserve their name.
      const clash = await projectsRepository.findByNameInWorkspace(
        prisma,
        context.workspaceId,
        input.name,
      );
      if (clash && clash.id !== projectId) throw new ProjectNameConflictError();
    }

    const data: Parameters<typeof projectsRepository.update>[3] = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.status !== undefined) data.status = input.status;
    if (input.startDate !== undefined)
      data.startDate = input.startDate ? new Date(input.startDate) : null;
    if (input.targetDate !== undefined)
      data.targetDate = input.targetDate ? new Date(input.targetDate) : null;

    const row = await prisma.$transaction(async (tx) => {
      const updated = await projectsRepository.update(
        tx,
        projectId,
        context.workspaceId,
        data,
      );
      // Description/date-only edits are not narrative (spec §3.1 exclusion
      // list) — only rename + status change emit.
      const renamed = input.name !== undefined && input.name !== project.name;
      const statusChanged =
        input.status !== undefined && input.status !== project.status;
      if (renamed || statusChanged) {
        const actor = await projectsRepository.findOwnerName(tx, actorUserId);
        const actorName = actor?.name ?? 'Someone';
        const events: Parameters<typeof activityService.record>[0][] = [];
        if (renamed) {
          events.push({
            workspaceId: context.workspaceId,
            actorId: actorUserId,
            actorName,
            kind: 'PROJECT_RENAMED',
            entityType: 'PROJECT',
            entityId: projectId,
            entityTitle: updated.name,
            summary: `${actorName} renamed project "${project.name}" to "${updated.name}"`,
          });
        }
        if (statusChanged) {
          events.push({
            workspaceId: context.workspaceId,
            actorId: actorUserId,
            actorName,
            kind: 'PROJECT_STATUS_CHANGED',
            entityType: 'PROJECT',
            entityId: projectId,
            entityTitle: updated.name,
            summary: `${actorName} changed project "${updated.name}" status from ${project.status} to ${updated.status}`,
          });
        }
        for (const event of events) await activityService.record(event, tx);
      }
      return updated;
    });
    logger.info(
      {
        workspaceId: context.workspaceId,
        projectId,
        updatedFields: Object.keys(input),
        actorMemberId: context.memberId,
      },
      'project.updated',
    );
    return toDetail(row);
  },

  // ── Ownership transfer (spec §3.3) ────────────────────────────────────

  async transferOwner(
    context: WorkspaceRequestContext,
    projectId: string,
    targetMemberId: string,
    actorUserId: string,
  ): Promise<ProjectCard> {
    assertCanEdit(context);
    const project = await resolveProject(projectId, context);
    if (project.archivedAt) throw new ProjectArchivedError();

    const row = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction (liveness, defense in depth).
      const fresh = await tx.project.findFirst({
        where: { id: projectId, workspaceId: context.workspaceId },
        select: { id: true, name: true, ownerId: true, archivedAt: true },
      });
      if (!fresh) throw new ProjectNotFoundError();
      if (fresh.archivedAt) throw new ProjectArchivedError();

      const target = await tx.workspaceMember.findUnique({
        where: { id: targetMemberId },
        select: {
          id: true,
          workspaceId: true,
          userId: true,
          user: { select: { name: true } },
        },
      });
      if (!target || target.workspaceId !== context.workspaceId)
        throw new TransferTargetInvalidError();
      if (target.userId === fresh.ownerId)
        throw new TransferTargetInvalidError('Target is already the owner');

      const updated = await tx.project.update({
        where: { id: projectId },
        data: { ownerId: target.userId },
        include: projectInclude(context.workspaceId),
      });
      const actor = await projectsRepository.findOwnerName(tx, actorUserId);
      const actorName = actor?.name ?? 'Someone';
      await activityService.record(
        {
          workspaceId: context.workspaceId,
          actorId: actorUserId,
          actorName,
          kind: 'PROJECT_OWNER_TRANSFERRED',
          entityType: 'PROJECT',
          entityId: projectId,
          entityTitle: fresh.name,
          summary: `${actorName} transferred project "${fresh.name}" ownership to ${target.user.name}`,
        },
        tx,
      );
      return updated;
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        projectId,
        newOwnerUserId: row.ownerId,
        actorMemberId: context.memberId,
      },
      'project.owner_transferred',
    );
    return toCard(row);
  },

  // ── Archive / restore (spec §3.2) ─────────────────────────────────────

  async archive(
    context: WorkspaceRequestContext,
    projectId: string,
    confirm: unknown,
    actorUserId: string,
  ): Promise<ProjectDetail> {
    if (confirm !== true) throw new ConfirmationRequiredError();
    assertCanEdit(context);
    const project = await resolveProject(projectId, context);
    if (project.archivedAt) throw new AlreadyArchivedError();

    const row = await prisma.$transaction(async (tx) => {
      const archived = await projectsRepository.setArchivedAt(
        tx,
        projectId,
        context.workspaceId,
        new Date(),
      );
      const actor = await projectsRepository.findOwnerName(tx, actorUserId);
      const actorName = actor?.name ?? 'Someone';
      await activityService.record(
        {
          workspaceId: context.workspaceId,
          actorId: actorUserId,
          actorName,
          kind: 'PROJECT_ARCHIVED',
          entityType: 'PROJECT',
          entityId: projectId,
          entityTitle: project.name,
          summary: `${actorName} archived project "${project.name}"`,
        },
        tx,
      );
      return archived;
    });
    logger.info(
      {
        workspaceId: context.workspaceId,
        projectId,
        status: row.status,
        actorMemberId: context.memberId,
      },
      'project.archived',
    );
    // Restore returns to the stored operational status for free: `status` is
    // untouched by archive/restore (data-model D1).
    return toDetail(row);
  },

  async restore(
    context: WorkspaceRequestContext,
    projectId: string,
    confirm: unknown,
    actorUserId: string,
  ): Promise<ProjectDetail> {
    if (confirm !== true) throw new ConfirmationRequiredError();
    assertCanEdit(context);
    const project = await resolveProject(projectId, context);
    if (!project.archivedAt) throw new NotArchivedError();

    const row = await prisma.$transaction(async (tx) => {
      const restored = await projectsRepository.setArchivedAt(
        tx,
        projectId,
        context.workspaceId,
        null,
      );
      const actor = await projectsRepository.findOwnerName(tx, actorUserId);
      const actorName = actor?.name ?? 'Someone';
      await activityService.record(
        {
          workspaceId: context.workspaceId,
          actorId: actorUserId,
          actorName,
          kind: 'PROJECT_RESTORED',
          entityType: 'PROJECT',
          entityId: projectId,
          entityTitle: project.name,
          summary: `${actorName} restored project "${project.name}"`,
        },
        tx,
      );
      return restored;
    });
    logger.info(
      {
        workspaceId: context.workspaceId,
        projectId,
        status: row.status,
        actorMemberId: context.memberId,
      },
      'project.restored',
    );
    return toDetail(row);
  },

  // ── Permanent delete (spec rule 9) ────────────────────────────────────

  async remove(
    context: WorkspaceRequestContext,
    actorUserId: string,
    projectId: string,
    confirmName: string,
  ): Promise<{ deletedProjectId: string; unassignedIssues: number }> {
    assertCanEdit(context);
    const project = await resolveProject(projectId, context);
    if (confirmName.trim() !== project.name)
      throw new ConfirmNameMismatchError();

    const unassignedIssues = await prisma.$transaction(async (tx) => {
      // F5 leg (data-model §6.4/§7): detach every issue (archived included)
      // with one PROJECT_CHANGED row each — issues survive the delete.
      const unassigned = await issuesService.unassignOnProjectDelete(
        context.workspaceId,
        projectId,
        tx,
        actorUserId,
      );
      await projectsRepository.remove(tx, projectId);
      // D3 proof: the delete-event row survives the very deletion it
      // describes (plain-string target, no FK) — frozen title renders
      // without a link.
      const actor = await projectsRepository.findOwnerName(tx, actorUserId);
      const actorName = actor?.name ?? 'Someone';
      await activityService.record(
        {
          workspaceId: context.workspaceId,
          actorId: actorUserId,
          actorName,
          kind: 'PROJECT_DELETED',
          entityType: 'PROJECT',
          entityId: projectId,
          entityTitle: project.name,
          summary: `${actorName} deleted project "${project.name}"`,
        },
        tx,
      );
      return unassigned;
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        projectId,
        name: project.name,
        actorMemberId: context.memberId,
        unassignedIssues,
      },
      'project.deleted',
    );
    return { deletedProjectId: projectId, unassignedIssues };
  },

  // ── F3 Checkpoint B integration (api-design §8.7 / §6.6) ───────────────

  /** Transfer all projects owned by `fromUserId` to `toOwnerUserId` in one
   *  workspace, including archived ones (no archivedAt filter, spec rule 6).
   *  Runs inside the caller's transaction. Returns the number transferred. */
  async transferOwnedProjects(
    workspaceId: string,
    fromUserId: string,
    toOwnerUserId: string,
    tx: DbClient,
  ): Promise<number> {
    const result = await projectsRepository.transferOwned(
      tx,
      workspaceId,
      fromUserId,
      toOwnerUserId,
    );
    // Runs inside the members remove/leave transaction (Checkpoint B); the
    // member-side events (member.removed / member.left_workspace) report the
    // same count, so this is the project-owned perspective of that transfer.
    logger.info(
      {
        workspaceId,
        fromUserId,
        toOwnerUserId,
        transferredProjects: result.count,
      },
      'project.ownership_transferred_bulk',
    );
    return result.count;
  },

  // ── View preference (generic, shared with Issues in F5) ───────────────

  async getViewPreference(
    context: WorkspaceRequestContext,
    userId: string,
    scope: ViewScope,
  ): Promise<ViewPreference> {
    const row = await projectsRepository.findViewPreference(
      prisma,
      context.workspaceId,
      userId,
      scope,
    );
    // Absence of a row = the LIST default (rule 12, data-model D6).
    return { view: row?.view ?? 'LIST' };
  },

  async setViewPreference(
    context: WorkspaceRequestContext,
    userId: string,
    scope: ViewScope,
    view: ViewType,
  ): Promise<ViewPreference> {
    await projectsRepository.upsertViewPreference(
      prisma,
      context.workspaceId,
      userId,
      scope,
      view,
    );
    logger.info(
      {
        workspaceId: context.workspaceId,
        userId,
        scope,
        view,
      },
      'project.view_preference_set',
    );
    return { view };
  },
};
