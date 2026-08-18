import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ErrorResponse } from '@shipyard/shared';
import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/codes.js';

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

function isMalformedJson(err: unknown): boolean {
  return (err as { type?: string } | null)?.type === 'entity.parse.failed';
}

export function errorHandler(
  err: unknown,
  _request: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    sendErrorEnvelope(
      res,
      createErrorResponse(err.code, err.message, err.publicDetails),
      err.statusCode,
    );
    return;
  }

  if (err instanceof ZodError) {
    sendErrorEnvelope(
      res,
      createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Request validation failed',
        err.issues.map((issue) => ({
          field: issue.path.length > 0 ? issue.path.join('.') : '$root',
          message: issue.message,
        })),
      ),
      400,
    );
    return;
  }

  if (isMalformedJson(err)) {
    sendErrorEnvelope(
      res,
      createErrorResponse(
        ErrorCodes.BAD_REQUEST,
        'Malformed JSON in request body',
      ),
      400,
    );
    return;
  }

  console.error('Unhandled error:', err);
  sendErrorEnvelope(
    res,
    createErrorResponse(
      ErrorCodes.INTERNAL_SERVER_ERROR,
      'An unexpected error occurred',
    ),
    500,
  );
}
