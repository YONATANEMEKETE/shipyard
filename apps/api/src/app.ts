import express from 'express';
import { healthResponseSchema } from '@shipyard/shared';

const app = express();

app.use(express.json());

app.get('/healthz', (_request, response) => {
  const health = healthResponseSchema.parse({
    service: 'api',
    status: 'ok',
  });

  response.json(health);
});

export default app;
