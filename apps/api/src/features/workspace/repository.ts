import { prisma } from '../../common/db/client.js';
import type { Prisma } from '../../generated/client.js';
import type { WorkspaceRole } from '@shipyard/shared';

/** Transaction client (same alias as sibling modules, e.g. activity). */
export type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Workspace repository — Prisma access only. No business decisions, state
 * transitions, or validation leak here; those live in the service layer.
 */

export interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
  icon: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceWithMemberCount extends WorkspaceRow {
  _count: { members: number };
}

export interface MembershipWithWorkspace {
  role: WorkspaceRole;
  workspace: WorkspaceWithMemberCount;
}

const withMemberCount = {
  include: { _count: { select: { members: true } } },
} as const;

export const workspaceRepository = {
  /** One query: workspace by slug + the caller's membership row (guard). */
  findBySlugWithMembership(slug: string, userId: string) {
    return prisma.workspace.findFirst({
      where: { slug },
      include: {
        members: {
          where: { userId },
          select: { id: true, role: true },
        },
      },
    });
  },

  async findByIdDetail(
    workspaceId: string,
  ): Promise<WorkspaceWithMemberCount | null> {
    return prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { _count: { select: { members: true } } },
    });
  },

  async listForUser(userId: string): Promise<MembershipWithWorkspace[]> {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: withMemberCount },
      orderBy: { workspace: { createdAt: 'desc' } },
    });
    return memberships;
  },

  /** Atomic create of workspace + owner membership inside one transaction. */
  async createWithOwner(
    input: { name: string; slug: string; icon: string | null },
    userId: string,
  ): Promise<WorkspaceRow> {
    return prisma.$transaction(async (tx) =>
      createWithOwnerTx(tx, input, userId),
    );
  },

  async findById(workspaceId: string): Promise<WorkspaceRow | null> {
    return prisma.workspace.findUnique({ where: { id: workspaceId } });
  },

  async update(
    workspaceId: string,
    data: { name?: string; icon?: string | null },
  ): Promise<WorkspaceWithMemberCount | null> {
    return updateTx(prisma, workspaceId, data);
  },

  async setArchived(
    workspaceId: string,
  ): Promise<WorkspaceWithMemberCount | null> {
    return setArchivedTx(prisma, workspaceId);
  },

  async restore(workspaceId: string): Promise<WorkspaceWithMemberCount | null> {
    return restoreTx(prisma, workspaceId);
  },

  /** Irreversible, all-or-nothing: memberships first, then the workspace row. */
  async deleteWithCascade(workspaceId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.workspaceMember.deleteMany({ where: { workspaceId } });
      await tx.workspace.delete({ where: { id: workspaceId } });
    });
  },

  /** Actor display name frozen at emit time (activity D4/D5). */
  async findUserName(
    client: DbClient,
    userId: string,
  ): Promise<{ name: string } | null> {
    return client.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
  },
};

// ── Tx-aware variants (service-owned transactions, activity D2) ───────────
// The public methods above delegate here with `prisma`; emitting service
// methods pass their own `tx` so the state write + activity row commit
// together or not at all.

export async function createWithOwnerTx(
  tx: DbClient,
  input: { name: string; slug: string; icon: string | null },
  userId: string,
): Promise<WorkspaceRow> {
  const workspace = await tx.workspace.create({
    data: {
      name: input.name,
      slug: input.slug,
      icon: input.icon,
    },
  });

  await tx.workspaceMember.create({
    data: { workspaceId: workspace.id, userId, role: 'OWNER' },
  });

  return workspace;
}

export async function updateTx(
  tx: DbClient,
  workspaceId: string,
  data: { name?: string; icon?: string | null },
): Promise<WorkspaceWithMemberCount | null> {
  // `icon` may be explicitly cleared (set to null) or undefined (leave as-is).
  const patch: { name?: string; icon?: string | null } = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.icon !== undefined) patch.icon = data.icon;

  return tx.workspace.update({
    where: { id: workspaceId },
    data: patch,
    include: { _count: { select: { members: true } } },
  });
}

export async function setArchivedTx(
  tx: DbClient,
  workspaceId: string,
): Promise<WorkspaceWithMemberCount | null> {
  return tx.workspace.update({
    where: { id: workspaceId },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
    include: { _count: { select: { members: true } } },
  });
}

export async function restoreTx(
  tx: DbClient,
  workspaceId: string,
): Promise<WorkspaceWithMemberCount | null> {
  // Restore keeps `archivedAt` to preserve the historical record (spec rule 9).
  return tx.workspace.update({
    where: { id: workspaceId },
    data: { status: 'ACTIVE' },
    include: { _count: { select: { members: true } } },
  });
}
