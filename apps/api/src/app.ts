import express from 'express';
import { healthResponseSchema } from '@shipyard/shared';
import { errorHandler } from './common/middlewares/errorHandler.js';
import { notFoundHandler } from './common/middlewares/notFound.js';
import { sendSuccess } from './common/http/responses.js';

const app = express();

app.use(express.json());

app.get('/healthz', (_request, response) => {
  const health = healthResponseSchema.parse({
    service: 'api',
    status: 'ok',
  });

  sendSuccess(response, health);
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
