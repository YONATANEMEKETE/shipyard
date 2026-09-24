import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import {
  defaultResource,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { env } from '../config/env.js';

let sdk: NodeSDK | undefined;

/**
 * Server telemetry (OpenTelemetry → Grafana Cloud): a span tree per request
 * (HTTP → Express route → pg query → outbound call), the RED and runtime
 * metrics those instrumentations emit, and the trace/span ids that pino log
 * lines are stamped with.
 *
 * Started from apps/api/src/instrument.ts, which `--import` preloads ahead of
 * every application module: the SDK must be running before http, express, pg
 * or pino are loaded, or their hooks never attach. No OTLP endpoint (tests,
 * fresh clones, self-hosters without a backend) → the SDK never starts and
 * nothing is sent, the same off-by-default shape as Sentry without a DSN.
 */
export function startTelemetry(): void {
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT === undefined) return;
  if (sdk !== undefined) return;

  // Stable HTTP semantic conventions: span attributes and metric names follow
  // the v1.23+ names (`http.request.method`, `http.route`, …) that the Grafana
  // dashboards and alert rules are written against. Set before the SDK builds
  // its instrumentations; an explicit env value still wins.
  process.env.OTEL_SEMCONV_STABILITY_OPT_IN ??= 'http';

  const release = env.SENTRY_RELEASE ?? process.env.RENDER_GIT_COMMIT;

  sdk = new NodeSDK({
    // The trace and metric pipelines (OTLP exporters, endpoint, headers,
    // export intervals) are built from the standard OTEL_* environment
    // variables — the same ones the Grafana Cloud OpenTelemetry tile hands
    // out. An explicit reader here would ignore OTEL_METRIC_EXPORT_INTERVAL.
    resource: defaultResource().merge(
      resourceFromAttributes({
        'service.name': 'shipyard-api',
        'service.namespace': 'shipyard',
        'deployment.environment': env.NODE_ENV,
        ...(release === undefined ? {} : { 'service.version': release }),
      }),
    ),
    instrumentations: [
      getNodeAutoInstrumentations({
        // One span per file read: high volume, no signal.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
}

/**
 * Flush the spans and metrics still batched in memory and stop the SDK.
 * Called from the graceful-shutdown path in server.ts beside the logger,
 * analytics and Sentry flushes — a crash must not lose the telemetry that
 * describes it. A no-op when the SDK was never started.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk === undefined) return;
  await sdk.shutdown();
  sdk = undefined;
}
