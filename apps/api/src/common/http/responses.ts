import type { Response } from 'express';
import type { ListResponse, SuccessResponse } from '@shipyard/shared';

export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: SuccessResponse<T> = { data };
  res.status(status).json(body);
}

export function sendMany<
  T,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>(res: Response, items: T[], meta?: TMeta, status = 200): void {
  const body: ListResponse<T, TMeta> =
    meta === undefined ? { items } : { items, meta };
  res.status(status).json(body);
}
