import { randomBytes } from 'node:crypto';
import type {
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  WorkspaceCard,
  WorkspaceDetail,
  WorkspaceRole,
} from '@shipyard/shared';
import { InternalServerError } from '../../common/errors/httpErrors.js';
import { logger } from '../../common/logger/index.js';
import { prisma } from '../../common/db/client.js';
import { activityService } from '../activity/service.js';
import {
  createWithOwnerTx,
  restoreTx,
  setArchivedTx,
  updateTx,
  workspaceRepository,
  type WorkspaceRow,
  type WorkspaceWithMemberCount,
} from './repository.js';
import {
  ConfirmationRequiredError,
  InvalidStatusTransitionError,
  NameMismatchError,
  WorkspaceNotFoundError,
} from './errors.js';

/**
 * Workspace service — owns business rules, state transitions, and the slug
 * generation with collision retry (api-design.md §2). All writes are gated by
 * the guard chain AND revalidated here (defense in depth, plan §1.4).
 */

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_LENGTH = 10;
const SLUG_MAX_TRIES = 5;

function generateSlug(): string {
  const bytes = randomBytes(SLUG_LENGTH);
  let slug = '';
  for (const byte of bytes) {
    slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
  }
  return slug;
}

function toCard(
  row: Pick<WorkspaceRow, 'id' | 'slug' | 'name' | 'status' | 'icon'>,
  role: WorkspaceRole,
  memberCount: number,
): WorkspaceCard {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    icon: row.icon,
    status: row.status,
    role,
    memberCount,
  };
}

function toDetail(
  row: WorkspaceWithMemberCount,
  role: WorkspaceRole,
): WorkspaceDetail {
  return {
    ...toCard(row, role, row._count.members),
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

function requireDetail(
  row: WorkspaceWithMemberCount | null,
): WorkspaceWithMemberCount {
  if (!row) throw new WorkspaceNotFoundError();
  return row;
}

function requireWork(row: WorkspaceRow | null): WorkspaceRow {
  if (!row) throw new WorkspaceNotFoundError();
  return row;
}

export const workspaceService = {
  async create(
    userId: string,
    input: CreateWorkspaceRequest,
  ): Promise<WorkspaceDetail> {
    const name = input.name;
    const icon = input.icon ?? null;

    let created: WorkspaceRow | undefined;
    for (let attempt = 0; attempt < SLUG_MAX_TRIES; attempt += 1) {
      const slug = generateSlug();
      try {
        // Service-owned tx: workspace + membership + activity row commit
        // together (strict, activity D2) — a failed log write fails create.
        created = await prisma.$transaction(async (tx) => {
          const workspace = await createWithOwnerTx(
            tx,
            { name, slug, icon },
            userId,
          );
          const actor = await workspaceRepository.findUserName(tx, userId);
          await activityService.record(
            {
              workspaceId: workspace.id,
              actorId: userId,
              actorName: actor?.name ?? 'Someone',
              kind: 'WORKSPACE_CREATED',
              entityType: 'WORKSPACE',
              entityId: null,
              entityTitle: workspace.name,
              summary: `${actor?.name ?? 'Someone'} created the workspace "${workspace.name}"`,
            },
            tx,
          );
          return workspace;
        });
        break;
      } catch (error) {
        // Unique violation on slug (a concurrent create raced us): retry with
        // a fresh slug. The DB unique constraint is the source of truth —
        // there is no racy pre-check. Any other error propagates.
        if ((error as { code?: string }).code !== 'P2002') throw error;
      }
    }

    if (!created) {
      throw new InternalServerError('Failed to create the workspace');
    }

    logger.info(
      {
        userId,
        workspaceId: created.id,
        slug: created.slug,
        name: created.name,
      },
      'workspace.created',
    );

    // Creator just became the Owner of a brand-new workspace: exactly 1 member.
    return toDetail({ ...created, _count: { members: 1 } }, 'OWNER');
  },

  async listForUser(userId: string): Promise<WorkspaceCard[]> {
    const memberships = await workspaceRepository.listForUser(userId);
    return memberships.map((m) =>
      toCard(m.workspace, m.role, m.workspace._count.members),
    );
  },

  async getDetail(
    workspaceId: string,
    role: WorkspaceRole,
  ): Promise<WorkspaceDetail> {
    const row = requireDetail(
      await workspaceRepository.findByIdDetail(workspaceId),
    );
    return toDetail(row, role);
  },

  async update(
    workspaceId: string,
    role: WorkspaceRole,
    input: UpdateWorkspaceRequest,
    actorUserId: string,
  ): Promise<WorkspaceDetail> {
    const row = await prisma.$transaction(async (tx) => {
      const updated = requireDetail(
        await updateTx(tx, workspaceId, {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.icon !== undefined ? { icon: input.icon } : {}),
        }),
      );
      const actor = await workspaceRepository.findUserName(tx, actorUserId);
      const actorName = actor?.name ?? 'Someone';
      const summary =
        input.name !== undefined
          ? `${actorName} renamed the workspace to "${updated.name}"`
          : `${actorName} updated the workspace icon`;
      await activityService.record(
        {
          workspaceId,
          actorId: actorUserId,
          actorName,
          kind: 'WORKSPACE_UPDATED',
          entityType: 'WORKSPACE',
          entityId: null,
          entityTitle: updated.name,
          summary,
        },
        tx,
      );
      return updated;
    });
    logger.info(
      {
        workspaceId,
        name: row.name,
        slug: row.slug,
        updatedFields: Object.keys(input),
      },
      'workspace.updated',
    );
    return toDetail(row, role);
  },

  async archive(
    workspaceId: string,
    role: WorkspaceRole,
    confirm: unknown,
    actorUserId: string,
  ): Promise<WorkspaceDetail> {
    if (confirm !== true) throw new ConfirmationRequiredError();

    const current = requireWork(
      await workspaceRepository.findById(workspaceId),
    );
    if (current.status === 'ARCHIVED') {
      throw new InvalidStatusTransitionError('Workspace is already archived');
    }

    const row = await prisma.$transaction(async (tx) => {
      const archived = requireDetail(await setArchivedTx(tx, workspaceId));
      const actor = await workspaceRepository.findUserName(tx, actorUserId);
      const actorName = actor?.name ?? 'Someone';
      await activityService.record(
        {
          workspaceId,
          actorId: actorUserId,
          actorName,
          kind: 'WORKSPACE_ARCHIVED',
          entityType: 'WORKSPACE',
          entityId: null,
          entityTitle: archived.name,
          summary: `${actorName} archived the workspace`,
        },
        tx,
      );
      return archived;
    });
    logger.info(
      { workspaceId, slug: row.slug, name: row.name, actorRole: role },
      'workspace.archived',
    );
    return toDetail(row, role);
  },

  async restore(
    workspaceId: string,
    role: WorkspaceRole,
    confirm: unknown,
    actorUserId: string,
  ): Promise<WorkspaceDetail> {
    if (confirm !== true) throw new ConfirmationRequiredError();

    const current = requireWork(
      await workspaceRepository.findById(workspaceId),
    );
    if (current.status === 'ACTIVE') {
      throw new InvalidStatusTransitionError('Workspace is already active');
    }

    const row = await prisma.$transaction(async (tx) => {
      const restored = requireDetail(await restoreTx(tx, workspaceId));
      const actor = await workspaceRepository.findUserName(tx, actorUserId);
      const actorName = actor?.name ?? 'Someone';
      await activityService.record(
        {
          workspaceId,
          actorId: actorUserId,
          actorName,
          kind: 'WORKSPACE_RESTORED',
          entityType: 'WORKSPACE',
          entityId: null,
          entityTitle: restored.name,
          summary: `${actorName} restored the workspace`,
        },
        tx,
      );
      return restored;
    });
    logger.info(
      { workspaceId, slug: row.slug, name: row.name, actorRole: role },
      'workspace.restored',
    );
    return toDetail(row, role);
  },

  /** Permanent delete: requires ARCHIVED + exact-name confirmation. */
  async remove(workspaceId: string, confirmName: string): Promise<void> {
    const current = requireWork(
      await workspaceRepository.findById(workspaceId),
    );

    if (current.status !== 'ARCHIVED') {
      throw new InvalidStatusTransitionError(
        'Workspace must be archived before it can be deleted',
      );
    }
    if (confirmName.trim() !== current.name) {
      throw new NameMismatchError();
    }

    await workspaceRepository.deleteWithCascade(workspaceId);
    logger.info(
      { workspaceId, name: current.name, slug: current.slug },
      'workspace.deleted',
    );
  },
};
