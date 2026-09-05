import type { NextFunction, Request, Response } from 'express';
import type {
  CreateProjectRequest,
  DeleteProjectRequest,
  SetViewPreferenceRequest,
  TransferProjectOwnerRequest,
  UpdateProjectRequest,
  ViewScope,
} from '@shipyard/shared';
import { sendSuccess } from '../../common/http/responses.js';
import { projectsService } from './service.js';
import { WorkspaceNotFoundError } from '../workspace/errors.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import type { ListProjectsQuery } from './schemas.js';

/**
 * Projects controller — HTTP concerns only (parse request, call service, map
 * to responses). Business rules live in the service. Guards (requireSession,
 * resolveWorkspaceContext, requireWorkspaceRole) run in routes before these.
 */

function contextOf(request: Request): WorkspaceRequestContext {
  const context = request.workspaceContext;
  if (!context) throw new WorkspaceNotFoundError();
  return context;
}

function userIdOf(request: Request): string {
  const userId =
    (request.user as { id?: string } | undefined)?.id ??
    (request.session as { userId?: string } | undefined)?.userId;
  if (!userId) throw new WorkspaceNotFoundError();
  return userId;
}

// ── Collection / item ──────────────────────────────────────────────────

export function listProjectsController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const query = request.query as unknown as ListProjectsQuery;
      const projects = await projectsService.list(context, query);
      sendSuccess(response, { projects });
    } catch (error) {
      next(error);
    }
  })();
}

export function getProjectController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await projectsService.getDetail(
        context,
        String(request.params.projectId),
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function createProjectController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as CreateProjectRequest;
      const detail = await projectsService.create(
        context,
        userIdOf(request),
        body,
      );
      sendSuccess(response, detail, 201);
    } catch (error) {
      next(error);
    }
  })();
}

export function updateProjectController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as UpdateProjectRequest;
      const detail = await projectsService.update(
        context,
        String(request.params.projectId),
        body,
        userIdOf(request),
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function transferProjectOwnerController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as TransferProjectOwnerRequest;
      const card = await projectsService.transferOwner(
        context,
        String(request.params.projectId),
        body.targetMemberId,
        userIdOf(request),
      );
      sendSuccess(response, card);
    } catch (error) {
      next(error);
    }
  })();
}

export function archiveProjectController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await projectsService.archive(
        context,
        String(request.params.projectId),
        (request.body as { confirm?: unknown } | undefined)?.confirm,
        userIdOf(request),
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function restoreProjectController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await projectsService.restore(
        context,
        String(request.params.projectId),
        (request.body as { confirm?: unknown } | undefined)?.confirm,
        userIdOf(request),
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function deleteProjectController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as DeleteProjectRequest;
      const result = await projectsService.remove(
        context,
        userIdOf(request),
        String(request.params.projectId),
        body.confirmName,
      );
      sendSuccess(response, result);
    } catch (error) {
      next(error);
    }
  })();
}

// ── View preference (workspace-scoped, generic) ────────────────────────

export function getViewPreferenceController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      // :scope validated against ViewScope at the route boundary.
      const scope = String(request.params.scope) as ViewScope;
      const preference = await projectsService.getViewPreference(
        context,
        userIdOf(request),
        scope,
      );
      sendSuccess(response, preference);
    } catch (error) {
      next(error);
    }
  })();
}

export function setViewPreferenceController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as SetViewPreferenceRequest;
      // The path :scope is the authority; the body shadows it (api-design §3.2).
      const scope = String(request.params.scope) as ViewScope;
      const preference = await projectsService.setViewPreference(
        context,
        userIdOf(request),
        scope,
        body.view,
      );
      sendSuccess(response, preference);
    } catch (error) {
      next(error);
    }
  })();
}
