import type { Request } from 'express';
import {
  rateLimit,
  type Logger,
  type RateLimitExceededEventHandler,
  type ValueDeterminingMiddleware,
} from 'express-rate-limit';
import { env } from '../config/env.js';
import { RateLimitError } from '../errors/httpErrors.js';
import { logger } from '../logger/index.js';

export const rateLimitLogger: Logger = {
  error: (error, message) => {
    logger.error({ err: error }, message ?? 'Rate limiter error');
  },
  warn: (error, message) => {
    logger.warn({ err: error }, message ?? 'Rate limiter warning');
  },
};

export const rateLimitHandler: RateLimitExceededEventHandler = (
  _request,
  _response,
  next,
  optionsUsed,
) => {
  const policy =
    typeof optionsUsed.identifier === 'string'
      ? optionsUsed.identifier
      : undefined;

  next(new RateLimitError(undefined, undefined, undefined, policy));
};

export const isOptionsRequest = (request: Request): boolean =>
  request.method === 'OPTIONS';

export const isAuthPath = (request: Request): boolean => {
  const path = request.originalUrl.split('?')[0] ?? '';
  return path === '/api/v1/auth' || path.startsWith('/api/v1/auth/');
};

export const skipOptionsRequests: ValueDeterminingMiddleware<boolean> = (
  request,
) => isOptionsRequest(request);

export const skipApiRateLimit: ValueDeterminingMiddleware<boolean> = (
  request,
) => isOptionsRequest(request) || isAuthPath(request);

const sharedOptions = {
  legacyHeaders: false,
  standardHeaders: 'draft-8' as const,
  ipv6Subnet: 64,
  passOnStoreError: false,
  handler: rateLimitHandler,
  logger: rateLimitLogger,
};

export const apiRateLimiter = rateLimit({
  ...sharedOptions,
  windowMs: env.API_RATE_LIMIT_WINDOW_MS,
  limit: env.API_RATE_LIMIT_MAX,
  identifier: 'api',
  skip: skipApiRateLimit,
});

export const authRateLimiter = rateLimit({
  ...sharedOptions,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  identifier: 'auth',
  skip: skipOptionsRequests,
});
