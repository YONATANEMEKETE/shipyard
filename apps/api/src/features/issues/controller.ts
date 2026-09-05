import type { NextFunction, Request, Response } from 'express';
import type {
  AttachLabelRequest,
  CreateIssueRequest,
  CreateLabelRequest,
  DeleteIssueRequest,
  UpdateIssueRequest,
  UpdateLabelRequest,
} from '@shipyard/shared';
import { sendSuccess } from '../../common/http/responses.js';
import { issuesService } from './service.js';
import { WorkspaceNotFoundError } from '../workspace/errors.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import type { ListHistoryQuery, ListIssuesQuery } from './schemas.js';

/**
 * Issues controller — HTTP concerns only (parse request, call service, map
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

// ── Issues ───────────────────────────────────────────────────────────────

export function listIssuesController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const query = request.query as unknown as ListIssuesQuery;
      const page = await issuesService.list(context, userIdOf(request), query);
      sendSuccess(response, page);
    } catch (error) {
      next(error);
    }
  })();
}

export function getIssueController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await issuesService.getDetail(
        context,
        String(request.params.issueId),
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function createIssueController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as CreateIssueRequest;
      const detail = await issuesService.create(
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

export function updateIssueController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as UpdateIssueRequest;
      const detail = await issuesService.update(
        context,
        userIdOf(request),
        String(request.params.issueId),
        body,
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function archiveIssueController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await issuesService.archive(
        context,
        userIdOf(request),
        String(request.params.issueId),
        (request.body as { confirm?: unknown } | undefined)?.confirm,
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function restoreIssueController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await issuesService.restore(
        context,
        userIdOf(request),
        String(request.params.issueId),
        (request.body as { confirm?: unknown } | undefined)?.confirm,
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function deleteIssueController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as DeleteIssueRequest;
      const result = await issuesService.remove(
        context,
        userIdOf(request),
        String(request.params.issueId),
        body.confirmIdentifier,
      );
      sendSuccess(response, result);
    } catch (error) {
      next(error);
    }
  })();
}

export function listIssueHistoryController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const query = request.query as unknown as ListHistoryQuery;
      const page = await issuesService.listHistory(
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

// ── Labels ───────────────────────────────────────────────────────────────

export function listLabelsController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const page = await issuesService.listLabels(context);
      sendSuccess(response, page);
    } catch (error) {
      next(error);
    }
  })();
}

export function createLabelController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as CreateLabelRequest;
      const card = await issuesService.createLabel(context, body);
      sendSuccess(response, card, 201);
    } catch (error) {
      next(error);
    }
  })();
}

export function updateLabelController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as UpdateLabelRequest;
      const card = await issuesService.updateLabel(
        context,
        String(request.params.labelId),
        body,
      );
      sendSuccess(response, card);
    } catch (error) {
      next(error);
    }
  })();
}

export function deleteLabelController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const result = await issuesService.removeLabel(
        context,
        String(request.params.labelId),
        (request.body as { confirm?: unknown } | undefined)?.confirm,
      );
      sendSuccess(response, result);
    } catch (error) {
      next(error);
    }
  })();
}

export function attachLabelController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const body = request.body as unknown as AttachLabelRequest;
      const detail = await issuesService.attachLabel(
        context,
        userIdOf(request),
        String(request.params.issueId),
        body,
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}

export function detachLabelController(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const context = contextOf(request);
      const detail = await issuesService.detachLabel(
        context,
        userIdOf(request),
        String(request.params.issueId),
        String(request.params.labelId),
      );
      sendSuccess(response, detail);
    } catch (error) {
      next(error);
    }
  })();
}
