import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../common/http/responses.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import { WorkspaceNotFoundError } from '../workspace/errors.js';
import { dashboardService } from './service.js';

/**
 * Dashboard controller — HTTP concerns only (api-design §4): resolve the
 * workspace context, take the session identity, call the service. Guard
 * chain is the canonical read-only one: requireSession →
 * resolveWorkspaceContext(:slug, rejectArchived: false) — any member, any
 * role, archived workspaces stay browsable. The session userId drives the
 * personal panels (My Work, trail); shared panels scope by workspace only.
 */

function contextOf(request: Request): WorkspaceRequestContext {
  const context = request.workspaceContext;
  if (!context) throw new WorkspaceNotFoundError();
  return context;
}

function userIdOf(request: Request): string {
  const userId = (request.session as { userId?: string } | undefined)?.userId;
  if (!userId) throw new WorkspaceNotFoundError();
  return userId;
}

export function getDashboardController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const dashboard = await dashboardService.compose(
        context.workspaceId,
        userIdOf(request),
      );
      sendSuccess(response, dashboard);
    } catch (error) {
      next(error);
    }
  })();
}
