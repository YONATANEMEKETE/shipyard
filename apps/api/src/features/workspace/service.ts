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
import {
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
        created = await workspaceRepository.createWithOwner(
          { name, slug, icon },
          userId,
        );
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
  ): Promise<WorkspaceDetail> {
    const row = requireDetail(
      await workspaceRepository.update(workspaceId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
      }),
    );
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
    confirm?: unknown,
  ): Promise<WorkspaceDetail> {
    if (confirm !== true) throw new ConfirmationRequiredError();

    const current = requireWork(
      await workspaceRepository.findById(workspaceId),
    );
    if (current.status === 'ARCHIVED') {
      throw new InvalidStatusTransitionError('Workspace is already archived');
    }

    const row = requireDetail(
      await workspaceRepository.setArchived(workspaceId),
    );
    logger.info(
      { workspaceId, slug: row.slug, name: row.name, actorRole: role },
      'workspace.archived',
    );
    return toDetail(row, role);
  },

  async restore(
    workspaceId: string,
    role: WorkspaceRole,
    confirm?: unknown,
  ): Promise<WorkspaceDetail> {
    if (confirm !== true) throw new ConfirmationRequiredError();

    const current = requireWork(
      await workspaceRepository.findById(workspaceId),
    );
    if (current.status === 'ACTIVE') {
      throw new InvalidStatusTransitionError('Workspace is already active');
    }

    const row = requireDetail(await workspaceRepository.restore(workspaceId));
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
