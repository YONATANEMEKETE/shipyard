import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AUTH_ERROR_CODES, type ErrorResponse } from '@shipyard/shared';
import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/codes.js';
import { RateLimitError } from '../errors/httpErrors.js';
import { logger } from '../logger/index.js';

function createErrorResponse(
  code: string,
  message: string,
  details?: unknown,
  requestId?: string,
): ErrorResponse {
  return {
    error: {
      code,
      message,
      ...(requestId !== undefined ? { requestId } : {}),
      ...(details !== undefined ? { details } : {}),
    },
  };
}

function sendErrorEnvelope(
  res: Response,
  body: ErrorResponse,
  status: number,
): void {
  res.status(status).json(body);
}

function getRequestId(request: Request): string | undefined {
  return typeof request.id === 'string' ? request.id : undefined;
}

function getRequestErrorContext(
  request: Request,
  requestId: string | undefined,
  errorCode: string,
  statusCode: number,
) {
  return {
    errorCode,
    statusCode,
    method: request.method,
    path: request.originalUrl,
    requestId,
  };
}

function isMalformedJson(err: unknown): boolean {
  return (err as { type?: string } | null)?.type === 'entity.parse.failed';
}

function isAuthPath(request: Request): boolean {
  const path = request.originalUrl.split('?')[0] ?? '';
  return path === '/api/v1/auth' || path.startsWith('/api/v1/auth/');
}

export function errorHandler(
  err: unknown,
  request: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const requestId = getRequestId(request);

  if (err instanceof AppError) {
    // Auth rate-limit errors use the AUTH_RATE_LIMITED domain code
    // (04-api-design.md §6); the generic code applies everywhere else.
    const code =
      err instanceof RateLimitError && isAuthPath(request)
        ? AUTH_ERROR_CODES.RATE_LIMITED
        : err.code;

    logger.warn(
      {
        ...getRequestErrorContext(request, requestId, code, err.statusCode),
        errorName: err.name,
        ...(err instanceof RateLimitError && err.policy !== undefined
          ? { rateLimitPolicy: err.policy }
          : {}),
      },
      'Request failed',
    );
    sendErrorEnvelope(
      res,
      createErrorResponse(code, err.message, err.publicDetails, requestId),
      err.statusCode,
    );
    return;
  }

  if (err instanceof ZodError) {
    logger.warn(
      {
        ...getRequestErrorContext(
          request,
          requestId,
          ErrorCodes.VALIDATION_ERROR,
          400,
        ),
        errorName: err.name,
        validationIssueCount: err.issues.length,
      },
      'Request validation failed',
    );
    sendErrorEnvelope(
      res,
      createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Request validation failed',
        err.issues.map((issue) => ({
          field: issue.path.length > 0 ? issue.path.join('.') : '$root',
          message: issue.message,
        })),
        requestId,
      ),
      400,
    );
    return;
  }

  if (isMalformedJson(err)) {
    logger.warn(
      getRequestErrorContext(request, requestId, ErrorCodes.BAD_REQUEST, 400),
      'Malformed JSON request body',
    );
    sendErrorEnvelope(
      res,
      createErrorResponse(
        ErrorCodes.BAD_REQUEST,
        'Malformed JSON in request body',
        undefined,
        requestId,
      ),
      400,
    );
    return;
  }

  logger.error(
    {
      ...getRequestErrorContext(
        request,
        requestId,
        ErrorCodes.INTERNAL_SERVER_ERROR,
        500,
      ),
      err,
    },
    'Unhandled request error',
  );
  sendErrorEnvelope(
    res,
    createErrorResponse(
      ErrorCodes.INTERNAL_SERVER_ERROR,
      'An unexpected error occurred',
      undefined,
      requestId,
    ),
    500,
  );
}
