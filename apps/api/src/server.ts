import 'dotenv/config';
import app from './app.js';
import { env } from './common/config/env.js';
import { logger } from './common/logger/index.js';

const server = app.listen(env.API_PORT, () => {
  logger.info(
    {
      port: env.API_PORT,
      url: env.API_URL,
      environment: env.NODE_ENV,
    },
    'Shipyard API listening',
  );
});

server.on('error', (error) => {
  logger.fatal(
    { err: error, port: env.API_PORT },
    'Shipyard API failed to start',
  );
  process.exitCode = 1;
});
