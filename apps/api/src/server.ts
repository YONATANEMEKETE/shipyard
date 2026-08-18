import express from 'express';
import { healthResponseSchema } from '@shipyard/shared';

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.get('/healthz', (_request, response) => {
  const health = healthResponseSchema.parse({
    service: 'api',
    status: 'ok',
  });

  response.json(health);
});

app.listen(port, () => {
  console.log(`Shipyard API listening on http://localhost:${port}`);
});
