import type { NextFunction, Request, Response } from 'express';
import type {
  CreateWorkspaceRequest,
  DeleteWorkspaceRequest,
  UpdateWorkspaceRequest,
} from '@shipyard/shared';
import { sendSuccess } from '../../common/http/responses.js';
import { workspaceService } from './service.js';
import { WorkspaceNotFoundError } from './errors.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';

/**
 * Workspace controller — HTTP concerns only (parse request, call service, map
 * to responses). Business rules live in the service. Guards (requireSession,
 * resolveWorkspaceContext, requireWorkspaceRole) run in routes before these.
 */

function contextOf(request: Request): WorkspaceRequestContext {
  const context = request.workspaceContext;
  if (!context) {
    // Guards always set context on item routes; defense-in-depth if not.
    throw new WorkspaceNotFoundError();
  }
  return context;
}

function userIdOf(request: Request): string {
  if (!request.user?.id) throw new WorkspaceNotFoundError();
  return request.user.id;
}

export function createWorkspaceController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const body = request.body as unknown as CreateWorkspaceRequest;
      const detail = await workspaceService.create(userIdOf(request), body);
      sendSuccess(response, detail, 201);
    } catch (error) {
      next(error);
    }
  })();
}

export function listWorkspacesController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const cards = await workspaceService.listForUser(userIdOf(request));
      sendSuccess(response, { workspaces: cards });
    } catch (error) {
      next(error);
    }
  })();
}

export function getWorkspaceController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await workspaceService.getDetail(
        context.workspaceId,
        context.role,
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function updateWorkspaceController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as UpdateWorkspaceRequest;
      const detail = await workspaceService.update(
        context.workspaceId,
        context.role,
        body,
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function archiveWorkspaceController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await workspaceService.archive(
        context.workspaceId,
        context.role,
        (request.body as { confirm?: unknown } | undefined)?.confirm,
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function restoreWorkspaceController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await workspaceService.restore(
        context.workspaceId,
        context.role,
        (request.body as { confirm?: unknown } | undefined)?.confirm,
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function deleteWorkspaceController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as DeleteWorkspaceRequest;
      await workspaceService.remove(context.workspaceId, body.confirmName);
      // 204 No Content — no body.
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  })();
}
