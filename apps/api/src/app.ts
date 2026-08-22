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
  authRateLimiter,
} from './common/middlewares/rateLimit.js';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './features/auth/auth.js';
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
  app.use('/api/v1/auth', authRateLimiter);
  // Better Auth handler — must run before express.json(): it consumes the
  // raw body itself. Rate limiting above still applies to every auth route.
  app.all('/api/v1/auth/*splat', toNodeHandler(auth));
  app.use(express.json());

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
