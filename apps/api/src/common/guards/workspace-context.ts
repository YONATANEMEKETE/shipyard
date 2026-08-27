import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/client.js';
import {
  WorkspaceArchivedError,
  WorkspaceNotFoundError,
} from '../../features/workspace/errors.js';
import type { WorkspaceRole, WorkspaceStatus } from '@shipyard/shared';

/**
 * Authenticated workspace context attached to the request by
 * {@link resolveWorkspaceContext}. One authoritative resolution per request —
 * controllers/services read this instead of re-resolving the URL slug.
 */
export interface WorkspaceRequestContext {
  workspaceId: string;
  memberId: string;
  slug: string;
  status: WorkspaceStatus;
  role: WorkspaceRole;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by resolveWorkspaceContext for workspace-scoped item routes. */
    workspaceContext?: WorkspaceRequestContext;
  }
}

export interface ResolveWorkspaceContextOptions {
  /**
   * When true, a request against an archived workspace is rejected with
   * `409 WORKSPACE_ARCHIVED` (read-only enforcement). Leave false for lifecycle
   * exits that operate on archived workspaces (GET, restore, delete).
   */
  rejectArchived?: boolean;
}

/**
 * Resolves the `:slug` route param into a verified membership context
 * (api-design.md §3) and attaches it to the request.
 *
 * One query loads the workspace by slug plus the caller's membership row.
 * - No workspace with that slug **or** no membership row ⇒ identical generic
 *   `404 WORKSPACE_NOT_FOUND` — a non-member and a bogus slug are
 *   indistinguishable (no existence leak).
 * - Membership exists, workspace archived, and `rejectArchived` ⇒
 *   `409 WORKSPACE_ARCHIVED`.
 *
 * Run after `requireSession`; req.session.userId is the membership key.
 */
export function resolveWorkspaceContext(
  options: ResolveWorkspaceContextOptions = {},
) {
  return async (
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const slug = request.params?.slug;
      const userId = request.session?.userId;

      if (typeof slug !== 'string' || !userId) {
        next(new WorkspaceNotFoundError());
        return;
      }

      const result = await prisma.workspace.findFirst({
        where: { slug },
        include: {
          members: {
            where: { userId },
            select: { id: true, role: true },
          },
        },
      });

      const membership = result?.members[0];

      if (!result || !membership) {
        next(new WorkspaceNotFoundError());
        return;
      }

      if (options.rejectArchived && result.status === 'ARCHIVED') {
        next(new WorkspaceArchivedError());
        return;
      }

      request.workspaceContext = {
        workspaceId: result.id,
        memberId: membership.id,
        slug: result.slug,
        status: result.status,
        role: membership.role,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
