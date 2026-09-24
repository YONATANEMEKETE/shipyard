import { trace } from '@opentelemetry/api';
import pino from 'pino';
import { env } from '../config/env.js';

// Same gate as the SDK: no endpoint, no telemetry anywhere. Tests stay
// hermetic even though the developer's .env carries a real endpoint — no
// worker thread, no network, nothing leaving the machine.
const shipLogs =
  env.OTEL_EXPORTER_OTLP_ENDPOINT !== undefined && env.NODE_ENV !== 'test';

const release = env.SENTRY_RELEASE ?? process.env.RENDER_GIT_COMMIT;

/**
 * Where log lines go. Development keeps the pretty console output; production
 * keeps plain JSON on stdout, which Render captures. Whenever an OTLP
 * endpoint is configured the same lines are also shipped to it: the
 * OpenTelemetry transport turns the `trace_id`/`span_id` fields from the
 * mixin below into the log record's trace context, which is the link Grafana
 * uses to jump from a span to its logs and back.
 */
function buildTransport() {
  const otlpLogs = {
    target: 'pino-opentelemetry-transport',
    options: {
      loggerName: 'shipyard-api',
      ...(release === undefined ? {} : { serviceVersion: release }),
      resourceAttributes: {
        'service.name': 'shipyard-api',
        'service.namespace': 'shipyard',
        'deployment.environment': env.NODE_ENV,
        ...(release === undefined ? {} : { 'service.version': release }),
      },
    },
  };

  if (env.NODE_ENV === 'development') {
    return {
      targets: [
        {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            translateTime: 'SYS:standard',
          },
        },
        ...(shipLogs ? [otlpLogs] : []),
      ],
    };
  }

  if (shipLogs) {
    return {
      targets: [{ target: 'pino/file', options: { destination: 1 } }, otlpLogs],
    };
  }

  return undefined;
}

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'shipyard-api',
    environment: env.NODE_ENV,
  },
  // Numeric (pino's default) timestamps on purpose: the OTLP transport maps
  // `time` straight onto the log record's timestamp, which must be a number —
  // an ISO string makes the export fail silently. pino-pretty still renders
  // the familiar `[2026-09-24 16:45:34.886 +0300]` from the epoch.
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
  transport: buildTransport(),
});
