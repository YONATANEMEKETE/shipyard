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

/**
 * Rate limiting (04-api-design.md §5).
 *
 * Two layers on /api/v1/auth:
 *  1. A base auth cap (env-tuned) as a runaway safety net.
 *  2. Per-endpoint policies with the spec's exact numbers:
 *     - sign-up/email            5/min  per IP
 *     - sign-in/email           10/min  per IP
 *     - OAuth callbacks         10/min  per IP
 *     - send-verification-email  3/hour per email
 *     - request-password-reset   3/hour per email
 *     - change-email/password    5/hour per user
 *
 * Per-email/per-user keying reads the parsed body (express.json runs before
 * the limiters) or the session context resolved for the change-* routes.
 * On 429 the configured handler raises RateLimitError, which the error
 * handler turns into the AUTH_RATE_LIMITED envelope with Retry-After.
 */

const rateLimitLogger: Logger = {
  error: (error, message) => {
    logger.error({ err: error }, message ?? 'Rate limiter error');
  },
  warn: (error, message) => {
    logger.warn({ err: error }, message ?? 'Rate limiter warning');
  },
};

const rateLimitHandler: RateLimitExceededEventHandler = (
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

const isOptionsRequest = (request: Request): boolean =>
  request.method === 'OPTIONS';

const isAuthPath = (request: Request): boolean => {
  const path = request.originalUrl.split('?')[0] ?? '';
  return path === '/api/v1/auth' || path.startsWith('/api/v1/auth/');
};

const skipOptionsRequests: ValueDeterminingMiddleware<boolean> = (request) =>
  isOptionsRequest(request);

const skipApiRateLimit: ValueDeterminingMiddleware<boolean> = (request) =>
  isOptionsRequest(request) || isAuthPath(request);

const createAuthLimiter = (opts: {
  identifier: string;
  windowMs: number;
  limit: number;
  keyGenerator: (request: Request) => string;
}) =>
  rateLimit({
    legacyHeaders: false,
    standardHeaders: 'draft-8',
    ipv6Subnet: 64,
    passOnStoreError: false,
    handler: rateLimitHandler,
    logger: rateLimitLogger,
    skip: skipOptionsRequests,
    identifier: opts.identifier,
    windowMs: opts.windowMs,
    limit: opts.limit,
    keyGenerator: opts.keyGenerator,
  });

const ipKey = (request: Request): string => request.ip ?? 'unknown';

/** Key by the email in the JSON body; fall back to IP when unparsable. */
const emailBodyKey = (request: Request): string => {
  const email = (request.body as { email?: unknown } | undefined)?.email;
  if (typeof email === 'string' && email.length > 0) {
    return `email:${email.trim().toLowerCase()}`;
  }
  return request.ip ?? 'unknown';
};

/** Key by the resolved session user; fall back to IP (will 401 anyway). */
const userSessionKey = (request: Request): string => {
  const userId = request.auth?.user.id;
  return userId !== undefined ? `user:${userId}` : (request.ip ?? 'unknown');
};

export const apiRateLimiter = rateLimit({
  legacyHeaders: false,
  standardHeaders: 'draft-8',
  ipv6Subnet: 64,
  passOnStoreError: false,
  handler: rateLimitHandler,
  logger: rateLimitLogger,
  skip: skipApiRateLimit,
  windowMs: env.API_RATE_LIMIT_WINDOW_MS,
  limit: env.API_RATE_LIMIT_MAX,
  identifier: 'api',
});

/** Base auth cap (safety net; the per-endpoint policies below are tighter). */
export const authBaseLimiter = createAuthLimiter({
  identifier: 'auth',
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  keyGenerator: ipKey,
});

/** POST /api/v1/auth/sign-up/email — 5/min per IP. */
export const authSignUpLimiter = createAuthLimiter({
  identifier: 'auth:sign-up',
  windowMs: 60_000,
  limit: 5,
  keyGenerator: ipKey,
});

/** POST /api/v1/auth/sign-in/email — 10/min per IP. */
export const authSignInLimiter = createAuthLimiter({
  identifier: 'auth:sign-in',
  windowMs: 60_000,
  limit: 10,
  keyGenerator: ipKey,
});

/** GET /api/v1/auth/callback/* — 10/min per IP. */
export const oauthCallbackLimiter = createAuthLimiter({
  identifier: 'auth:oauth-callback',
  windowMs: 60_000,
  limit: 10,
  keyGenerator: ipKey,
});

/** POST /api/v1/auth/send-verification-email — 3/hour per email. */
export const sendVerificationLimiter = createAuthLimiter({
  identifier: 'auth:send-verification',
  windowMs: 3_600_000,
  limit: 3,
  keyGenerator: emailBodyKey,
});

/** POST /api/v1/auth/request-password-reset — 3/hour per email. */
export const requestPasswordResetLimiter = createAuthLimiter({
  identifier: 'auth:request-password-reset',
  windowMs: 3_600_000,
  limit: 3,
  keyGenerator: emailBodyKey,
});

/** POST /api/v1/auth/change-password — 5/hour per user. */
export const changePasswordLimiter = createAuthLimiter({
  identifier: 'auth:change-password',
  windowMs: 3_600_000,
  limit: 5,
  keyGenerator: userSessionKey,
});

/** POST /api/v1/auth/change-email — 5/hour per user. */
export const changeEmailLimiter = createAuthLimiter({
  identifier: 'auth:change-email',
  windowMs: 3_600_000,
  limit: 5,
  keyGenerator: userSessionKey,
});
