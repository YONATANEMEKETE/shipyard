import { trace } from '@opentelemetry/api';
import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'shipyard-api',
    environment: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Trace correlation: any line logged while a request span is active carries
  // the ids Grafana links log → trace with. Hand-rolled because the pino
  // instrumentation's own mixin only reaches CJS-loaded pino, and this app
  // loads pino as ESM.
  mixin() {
    const span = trace.getActiveSpan();
    if (span === undefined) return {};
    const { traceId, spanId, traceFlags } = span.spanContext();
    return {
      trace_id: traceId,
      span_id: spanId,
      trace_flags: `0${traceFlags.toString(16)}`,
    };
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.headers["proxy-authorization"]',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
});
