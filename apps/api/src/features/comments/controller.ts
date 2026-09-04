import type { NextFunction, Request, Response } from 'express';
import type {
  CreateCommentRequest,
  UpdateCommentRequest,
} from '@shipyard/shared';
import { sendSuccess } from '../../common/http/responses.js';
import { commentsService } from './service.js';
import { WorkspaceNotFoundError } from '../workspace/errors.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import type { ListCommentsQuery } from './schemas.js';

/**
 * Comments controller — HTTP concerns only (parse request, call service, map
 * to responses). Business rules live in the service. Guards (requireSession,
 * resolveWorkspaceContext) run in routes before these — this module has no
 * role gate; mutation privilege is authorship, checked in the service.
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

export function listCommentsController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const query = request.query as unknown as ListCommentsQuery;
      const page = await commentsService.list(
        context,
        String(request.params.issueId),
        query,
      );
      sendSuccess(response, page);
    } catch (error) {
      next(error);
    }
  })();
}

export function getCommentController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const card = await commentsService.getDetail(
        context,
        String(request.params.issueId),
        String(request.params.commentId),
      );
      sendSuccess(response, card);
    } catch (error) {
      next(error);
    }
  })();
}

export function createCommentController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as CreateCommentRequest;
      const card = await commentsService.create(
        context,
        userIdOf(request),
        String(request.params.issueId),
        body,
      );
      sendSuccess(response, card, 201);
    } catch (error) {
      next(error);
    }
  })();
}

export function updateCommentController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as UpdateCommentRequest;
      const card = await commentsService.update(
        context,
        userIdOf(request),
        String(request.params.issueId),
        String(request.params.commentId),
        body,
      );
      sendSuccess(response, card);
    } catch (error) {
      next(error);
    }
  })();
}

export function deleteCommentController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const result = await commentsService.remove(
        context,
        userIdOf(request),
        String(request.params.issueId),
        String(request.params.commentId),
        (request.body as { confirm?: unknown } | undefined)?.confirm,
      );
      sendSuccess(response, result);
    } catch (error) {
      next(error);
    }
  })();
}
