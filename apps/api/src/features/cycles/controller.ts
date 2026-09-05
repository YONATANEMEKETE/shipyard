import type { NextFunction, Request, Response } from 'express';
import type { CreateCycleRequest, UpdateCycleRequest } from '@shipyard/shared';
import { sendSuccess } from '../../common/http/responses.js';
import { cyclesService } from './service.js';
import { WorkspaceNotFoundError } from '../workspace/errors.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import type { ListCyclesQuery } from './schemas.js';

/**
 * Cycles controller — HTTP concerns only (parse request, call service, map
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

function confirmOf(request: Request): unknown {
  return (request.body as { confirm?: unknown } | undefined)?.confirm;
}

// ── Collection / item ──────────────────────────────────────────────────

export function listCyclesController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const query = request.query as unknown as ListCyclesQuery;
      const page = await cyclesService.list(context, query);
      sendSuccess(response, page);
    } catch (error) {
      next(error);
    }
  })();
}

export function getCycleController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await cyclesService.getDetail(
        context,
        String(request.params.cycleId),
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function createCycleController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as CreateCycleRequest;
      const detail = await cyclesService.create(
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

export function updateCycleController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as UpdateCycleRequest;
      const detail = await cyclesService.update(
        context,
        String(request.params.cycleId),
        body,
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

// ── Lifecycle actions ──────────────────────────────────────────────────

export function startCycleController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await cyclesService.start(
        context,
        userIdOf(request),
        String(request.params.cycleId),
        confirmOf(request),
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function completeCycleController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await cyclesService.complete(
        context,
        userIdOf(request),
        String(request.params.cycleId),
        confirmOf(request),
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function reopenCycleController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await cyclesService.reopen(
        context,
        userIdOf(request),
        String(request.params.cycleId),
        confirmOf(request),
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function archiveCycleController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await cyclesService.archive(
        context,
        userIdOf(request),
        String(request.params.cycleId),
        confirmOf(request),
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function restoreCycleController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await cyclesService.restore(
        context,
        userIdOf(request),
        String(request.params.cycleId),
        confirmOf(request),
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function deleteCycleController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const result = await cyclesService.remove(
        context,
        userIdOf(request),
        String(request.params.cycleId),
        confirmOf(request),
      );
      sendSuccess(response, result);
    } catch (error) {
      next(error);
    }
  })();
}
