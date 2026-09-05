import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../common/http/responses.js';
import { searchService } from './service.js';
import { WorkspaceNotFoundError } from '../workspace/errors.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import type { SearchQueryParams } from './schemas.js';

/**
 * Search controller — HTTP concerns only (parse query, call service, map to
 * response). There is exactly one surface: the grouped search. Guards
 * (requireSession, resolveWorkspaceContext) run in routes before this; the
 * query has already been wire-coerced (trim, bounds, blank-echo split) by
 * the validate middleware at the boundary.
 */

function contextOf(request: Request): WorkspaceRequestContext {
  const context = request.workspaceContext;
  if (!context) throw new WorkspaceNotFoundError();
  return context;
}

export function searchController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const query = request.query as unknown as SearchQueryParams;
      const results = await searchService.search(context, query);
      sendSuccess(response, results);
    } catch (error) {
      next(error);
    }
  })();
}
