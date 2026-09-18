import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/client.js';
import type { Prisma } from '../../generated/client.js';
import {
  WorkspaceArchivedError,
  WorkspaceNotFoundError,
} from '../../features/workspace/errors.js';
import type { WorkspaceRole, WorkspaceStatus } from '@shipyard/shared';

/** A transaction client or the shared client — the repository convention. */
type DbClient = Prisma.TransactionClient | typeof prisma;

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

/** The two rows every context is built from, whatever path found them. */
interface WorkspaceContextParts {
  workspace: { id: string; slug: string; status: WorkspaceStatus };
  membership: { id: string; role: WorkspaceRole };
}

/**
 * The **single** place a {@link WorkspaceRequestContext} is constructed.
 *
 * Two resolvers feed it — the cookie path (`:slug` + session user) and the MCP
 * token path (`mcp_token.workspaceId` + token owner) — and they must be
 * indistinguishable downstream: a service cannot tell which door a request came
 * through, because there is only one shape and one mapping to drift from.
 */
function toWorkspaceContext(
  parts: WorkspaceContextParts,
): WorkspaceRequestContext {
  return {
    workspaceId: parts.workspace.id,
    memberId: parts.membership.id,
    slug: parts.workspace.slug,
    status: parts.workspace.status,
    role: parts.membership.role,
  };
}

/**
 * Resolves a context for a caller we have **already identified** — the MCP
 * token path, where the workspace comes from the credential rather than from the
 * URL (F13, api-design §3.1: "load membership → build the *same*
 * WorkspaceRequestContext your existing guards produce").
 *
 * Returns `null` when the membership is gone, which the caller answers exactly
 * like an unknown token: a removed member's credentials must stop working, and
 * whether they were removed must not be inferable from the response.
 *
 * Archived workspaces are *not* rejected here: reads are allowed in an archived
 * workspace (api-design §9), so the status travels in the context and the
 * surface decides.
 */
export async function resolveMemberWorkspaceContext(
  lookup: { userId: string; workspaceId: string },
  client: DbClient = prisma,
): Promise<WorkspaceRequestContext | null> {
  const membership = await client.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: lookup.workspaceId,
        userId: lookup.userId,
      },
    },
    select: {
      id: true,
      role: true,
      workspace: { select: { id: true, slug: true, status: true } },
    },
  });

  if (!membership) {
    return null;
  }

  return toWorkspaceContext({
    workspace: membership.workspace,
    membership,
  });
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

      request.workspaceContext = toWorkspaceContext({
        workspace: result,
        membership,
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}
