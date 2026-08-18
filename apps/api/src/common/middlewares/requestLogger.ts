import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';
import { logger } from '../logger/index.js';

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export const requestLogger = pinoHttp<IncomingMessage, ServerResponse>({
  logger,
  genReqId: (request, response) => {
    const incomingRequestId = request.headers['x-request-id'];
    const requestId =
      typeof incomingRequestId === 'string' &&
      requestIdPattern.test(incomingRequestId)
        ? incomingRequestId
        : randomUUID();

    response.setHeader('x-request-id', requestId);
    return requestId;
  },
  customLogLevel: (
    _request: IncomingMessage,
    response: ServerResponse,
    error?: Error,
  ) => {
    if (error || response.statusCode >= 500) return 'error';
    if (response.statusCode >= 400) return 'warn';
    return 'info';
  },
});
