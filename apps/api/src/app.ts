import express, { type NextFunction } from 'express';
import {
  healthResponseSchema,
  readinessResponseSchema,
} from '@shipyard/shared';
import { ServiceUnavailableError } from './common/errors/httpErrors.js';
import { errorHandler } from './common/middlewares/errorHandler.js';
import { notFoundHandler } from './common/middlewares/notFound.js';
import { requestLogger } from './common/middlewares/requestLogger.js';
import { isReady } from './common/health/readiness.js';
import { sendSuccess } from './common/http/responses.js';

const app = express();

app.use(requestLogger);
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

export default app;
