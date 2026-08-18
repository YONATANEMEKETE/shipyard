import 'dotenv/config';
import app from './app.js';
import { env } from './common/config/env.js';
import { logger } from './common/logger/index.js';
import { setReady } from './common/health/readiness.js';

const server = app.listen(env.API_PORT, () => {
  setReady(true);
  logger.info(
    {
      port: env.API_PORT,
      url: env.API_URL,
      environment: env.NODE_ENV,
      ready: true,
    },
    'Shipyard API listening',
  );
});

let shutdownPromise: Promise<void> | undefined;

function closeHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function flushLogger(): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.flush((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shutdownPromise !== undefined) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    setReady(false);
    logger.info(
      { signal, timeoutMs: env.SHUTDOWN_TIMEOUT_MS, ready: false },
      'Graceful shutdown started',
    );

    const timeout = setTimeout(() => {
      logger.fatal(
        { signal, timeoutMs: env.SHUTDOWN_TIMEOUT_MS },
        'Graceful shutdown timed out',
      );
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);

    timeout.unref();

    let finalExitCode = exitCode;

    try {
      await closeHttpServer();
      logger.info('HTTP server closed');
    } catch (error) {
      finalExitCode = 1;
      logger.error({ err: error }, 'Failed to close HTTP server');
    } finally {
      clearTimeout(timeout);
    }

    try {
      await flushLogger();
    } catch {
      finalExitCode = 1;
    }

    process.exit(finalExitCode);
  })();

  return shutdownPromise;
}

server.on('error', (error) => {
  logger.fatal(
    { err: error, port: env.API_PORT },
    'Shipyard API failed to start',
  );
  void shutdown('server-error', 1);
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaught-exception', 1);
});

process.once('unhandledRejection', (reason) => {
  logger.fatal(
    {
      err: reason instanceof Error ? reason : undefined,
      reason: typeof reason === 'string' ? reason : undefined,
    },
    'Unhandled promise rejection',
  );
  void shutdown('unhandled-rejection', 1);
});
