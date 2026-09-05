import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../common/http/responses.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import { WorkspaceNotFoundError } from '../workspace/errors.js';
import { activityService } from './service.js';
import type { ListActivityQuery } from './schemas.js';

/**
 * Activity controller — HTTP concerns only (parse request, resolve the
 * workspace context, call service). Scope here is workspace membership:
 * any member reads all (spec rule 4); archived workspaces stay readable
 * (the route guard runs with `rejectArchived: false`).
 */

function contextOf(request: Request): WorkspaceRequestContext {
  const context = request.workspaceContext;
  if (!context) throw new WorkspaceNotFoundError();
  return context;
}

export function listActivityController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const query = request.query as unknown as ListActivityQuery;
      const page = await activityService.list(context.workspaceId, query);
      sendSuccess(response, page);
    } catch (error) {
      next(error);
    }
  })();
}
