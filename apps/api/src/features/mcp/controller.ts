import type { NextFunction, Request, Response } from 'express';
import type {
  CreateMcpTokenRequest,
  ListMcpTokensQuery,
} from '@shipyard/shared';
import { sendSuccess } from '../../common/http/responses.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import { WorkspaceNotFoundError } from '../workspace/errors.js';
import { mcpTokensService } from './service.js';

/**
 * MCP controller — HTTP concerns only (parse the request, call the service,
 * map the outcome to a response). Business rules live in the service; the
 * guards (requireSession, resolveWorkspaceContext, requireWorkspaceRole) run in
 * the router before these handlers.
 */

function contextOf(request: Request): WorkspaceRequestContext {
  const context = request.workspaceContext;
  if (!context) throw new WorkspaceNotFoundError();
  return context;
}

/** The caller's own user id — the session's identity, never a request field. */
function userIdOf(request: Request): string {
  const userId =
    (request.user as { id?: string } | undefined)?.id ??
    (request.session as { userId?: string } | undefined)?.userId;
  if (!userId) throw new WorkspaceNotFoundError();
  return userId;
}

export function createMcpTokenController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as CreateMcpTokenRequest;
      const created = await mcpTokensService.create(
        context,
        userIdOf(request),
        body,
      );
      sendSuccess(response, created, 201);
    } catch (error) {
      next(error);
    }
  })();
}

export function listMcpTokensController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const query = request.query as unknown as ListMcpTokensQuery;
      const page = await mcpTokensService.list(
        context,
        userIdOf(request),
        query,
      );
      sendSuccess(response, page);
    } catch (error) {
      next(error);
    }
  })();
}

export function revokeMcpTokenController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const revoked = await mcpTokensService.revoke(
        context,
        userIdOf(request),
        String(request.params.tokenId),
      );
      sendSuccess(response, revoked);
    } catch (error) {
      next(error);
    }
  })();
}
