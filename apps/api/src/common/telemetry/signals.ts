import { metrics, trace } from '@opentelemetry/api';

/**
 * The API handles for the app's own (manual) spans and metrics — the ones no
 * auto-instrumentation can place: `email.send`, `mcp.tool_call`, the email
 * counter. Safe to create before the SDK starts: the OpenTelemetry API hands
 * back no-op handles until a provider is registered, so tests and self-hosters
 * without a backend pay nothing.
 */
export const telemetryTracer = trace.getTracer('shipyard-api');
export const telemetryMeter = metrics.getMeter('shipyard-api');
