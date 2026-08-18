import type { NextFunction, Request, Response } from 'express';
import { NotFoundError } from '../errors/httpErrors.js';

export function notFoundHandler(
  _request: Request,
  _response: Response,
  next: NextFunction,
): void {
  next(new NotFoundError('Route not found'));
}
