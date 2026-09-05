import type { ViewScope, ViewType } from '@shipyard/shared';
import { prisma } from '../../common/db/client.js';
import type { Prisma } from '../../generated/client.js';

/**
 * Projects repository — Prisma access only. No business decisions live here.
 * All workspace-scoped callers pass workspaceId explicitly; no implicit
 * context. Transaction-aware overloads accept an explicit `tx` client.
 */

export type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Owner user + its membership row id in the project's workspace. `project.ownerId`
 * references `user.id` (data-model D2), so to build `projectOwnerCard.memberId`
 * we join through the owner's `workspaceMembers` filtered to this workspace —
 * one query, no N+1. The owner is always a current member (service invariant).
 */
export function projectInclude(workspaceId: string) {
  return {
    owner: {
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        workspaceMembers: {
          where: { workspaceId },
          select: { id: true },
          take: 1,
        },
      },
    },
  } satisfies Prisma.ProjectInclude;
}

/** Row shape returned by every project query (via {@link projectInclude}). */
export type ProjectRow = Prisma.ProjectGetPayload<{
  include: ReturnType<typeof projectInclude>;
}>;

export interface ListProjectsArgs {
  workspaceId: string;
  where: Prisma.ProjectWhereInput;
  orderBy: Prisma.ProjectOrderByWithRelationInput;
  take: number;
}

export const projectsRepository = {
  list(
    client: DbClient,
    { workspaceId, where, orderBy, take }: ListProjectsArgs,
  ) {
    return client.project.findMany({
      where: { workspaceId, ...where },
      include: projectInclude(workspaceId),
      orderBy,
      take,
    });
  },

  findByIdScoped(client: DbClient, id: string, workspaceId: string) {
    return client.project.findFirst({
      where: { id, workspaceId },
      include: projectInclude(workspaceId),
    });
  },

  /** Friendly pre-check on the D3 functional index; the DB index is the backstop. */
  findByNameInWorkspace(client: DbClient, workspaceId: string, name: string) {
    return client.project.findFirst({
      where: { workspaceId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
  },

  /** Actor display name frozen at emit time (activity D4/D5). */
  findOwnerName(client: DbClient, userId: string) {
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
      status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
      ownerId: string;
      description: string | null;
      startDate: Date | null;
      targetDate: Date | null;
    },
  ) {
    return client.project.create({
      data,
      include: projectInclude(data.workspaceId),
    });
  },

  update(
    client: DbClient,
    id: string,
    workspaceId: string,
    data: {
      name?: string;
      description?: string | null;
      status?: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
      startDate?: Date | null;
      targetDate?: Date | null;
    },
  ) {
    return client.project.update({
      where: { id },
      data,
      include: projectInclude(workspaceId),
    });
  },

  /** Set or clear the archive marker (restore = clear); operational status untouched. */
  setArchivedAt(
    client: DbClient,
    id: string,
    workspaceId: string,
    archivedAt: Date | null,
  ) {
    return client.project.update({
      where: { id },
      data: { archivedAt },
      include: projectInclude(workspaceId),
    });
  },

  remove(client: DbClient, id: string) {
    return client.project.delete({ where: { id } });
  },

  /** F3 Checkpoint B contract: move owned projects to the new owner. No
   *  archivedAt filter — archived projects transfer too (spec rule 6). */
  transferOwned(
    client: DbClient,
    workspaceId: string,
    fromUserId: string,
    toOwnerUserId: string,
  ) {
    return client.project.updateMany({
      where: { workspaceId, ownerId: fromUserId },
      data: { ownerId: toOwnerUserId },
    });
  },

  // ── View preference (generic, shared with Issues in F5) ────────────────

  findViewPreference(
    client: DbClient,
    workspaceId: string,
    userId: string,
    scope: ViewScope,
  ) {
    return client.viewPreference.findUnique({
      where: { workspaceId_userId_scope: { workspaceId, userId, scope } },
      select: { view: true },
    });
  },

  upsertViewPreference(
    client: DbClient,
    workspaceId: string,
    userId: string,
    scope: ViewScope,
    view: ViewType,
  ) {
    return client.viewPreference.upsert({
      where: { workspaceId_userId_scope: { workspaceId, userId, scope } },
      create: { workspaceId, userId, scope, view },
      update: { view },
    });
  },
};

export type ProjectsRepository = typeof projectsRepository;
