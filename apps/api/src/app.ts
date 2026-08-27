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
import { isReady, setReady } from './common/health/readiness.js';
import { sendSuccess } from './common/http/responses.js';
import { authNodeHandler } from './lib/authNodeHandler.js';
import { workspaceRouter } from './features/workspace/routes.js';

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

  // Better Auth — handles all subpaths under /api/v1/auth (sign-in, sign-up,
  // session, reset-password, verify-email, oauth callbacks, ...).
  // authNodeHandler wraps Better Auth's node adapter so error responses are
  // rewritten into the shared envelope contract.
  app.all('/api/v1/auth/*splat', authNodeHandler);

  // Workspace module — hand-written Shipyard routes (api-design.md §2). Mounted
  // before notFound so unmatched paths under /api/v1/workspaces 404 normally.
  app.use('/api/v1/workspaces', workspaceRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  if (options.ready) {
    setReady(true);
  }

  return app;
}

const app = createApp();

export default app;
