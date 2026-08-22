import express, { type NextFunction } from 'express';
import helmet from 'helmet';
import {
  healthResponseSchema,
  readinessResponseSchema,
} from '@shipyard/shared';
import { ServiceUnavailableError } from './common/errors/httpErrors.js';
import { env } from './common/config/env.js';
import { errorHandler } from './common/middlewares/errorHandler.js';
import { notFoundHandler } from './common/middlewares/notFound.js';
import { requestLogger } from './common/middlewares/requestLogger.js';
import {
  apiRateLimiter,
  authBaseLimiter,
  authSignInLimiter,
  authSignUpLimiter,
  changeEmailLimiter,
  changePasswordLimiter,
  oauthCallbackLimiter,
  requestPasswordResetLimiter,
  sendVerificationLimiter,
} from './common/middlewares/rateLimit.js';
import { resolveSession } from './common/middlewares/authz.js';
import { handleAuth } from './features/auth/handler.js';
import { isReady, setReady } from './common/health/readiness.js';
import { sendSuccess } from './common/http/responses.js';

export interface CreateAppOptions {
  /**
   * When true, readiness starts ready (useful for tests that don't boot the
   * HTTP server via server.ts, which is where setReady(true) normally runs).
   */
  ready?: boolean;
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const app = express();

  app.set(
    'trust proxy',
    env.TRUST_PROXY_HOPS === 0 ? false : env.TRUST_PROXY_HOPS,
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
      hsts: env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.use(requestLogger);
  app.use('/api/v1', apiRateLimiter);
  app.use('/api/v1/auth', authBaseLimiter);

  // express.json must run before the auth handler AND the per-endpoint
  // limiters: Better Auth's node adapter re-serializes a pre-parsed req.body
  // (better-call getRequest), which the per-email/per-user rate-limit keys
  // also read.
  app.use(express.json());

  // Per-endpoint auth rate limits (04-api-design.md §5) — policies before
  // the handler, in route order.
  app.post('/api/v1/auth/sign-up/email', authSignUpLimiter);
  app.post('/api/v1/auth/sign-in/email', authSignInLimiter);
  app.all('/api/v1/auth/callback/*splat', oauthCallbackLimiter);
  app.post('/api/v1/auth/send-verification-email', sendVerificationLimiter);
  app.post('/api/v1/auth/request-password-reset', requestPasswordResetLimiter);
  app.post(
    '/api/v1/auth/change-password',
    resolveSession,
    changePasswordLimiter,
  );
  app.post('/api/v1/auth/change-email', resolveSession, changeEmailLimiter);

  // Better Auth handler with the Shipyard response contract (envelope +
  // AUTH_* codes, sign-out 204, generic password-reset responses).
  app.all('/api/v1/auth/*splat', handleAuth);

  app.get('/healthz', (_request, response) => {
    const health = healthResponseSchema.parse({
      service: 'api',
      status: 'ok',
    });

    sendSuccess(response, health);
  });

  app.get('/readyz', (_request, response, next: NextFunction) => {
    if (!isReady()) {
      next(new ServiceUnavailableError());
      return;
    }

    const readiness = readinessResponseSchema.parse({
      service: 'api',
      status: 'ready',
    });

    sendSuccess(response, readiness);
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  if (options.ready) {
    setReady(true);
  }

  return app;
}

const app = createApp();

export default app;
