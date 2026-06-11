// OpenTelemetry bootstrap for signaling-service (observability Pillar 1). This MUST be imported before
// any instrumented library (http / express / socket.io / winston) so the auto-instrumentations can
// monkey-patch them at require time — hence it is the very first import in index.ts.
//
// It exports OTLP/HTTP spans to the same Elastic APM Server the Java services use, so a video-call's
// socket handshake joins the same distributed trace (one trace.id spans gateway -> signaling). The
// winston auto-instrumentation injects trace_id/span_id into every JSON log line so logs correlate to
// the trace, matching the Java services' MDC traceId/spanId.
//
// The service name is taken from OTEL_SERVICE_NAME (set in docker-compose) so we avoid pinning to a
// specific @opentelemetry/resources API across versions.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTLP_TRACING_ENDPOINT || "http://apm-server:8200/v1/traces",
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // fs spans are noise for a signaling mesh — disable to keep traces readable and light.
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

try {
  sdk.start();
} catch (err) {
  // Graceful degradation, mirroring the Java services' OTLP exporter: a missing/slow tracing backend
  // must NEVER stop the signaling service from booting. Log and carry on untraced.
  // eslint-disable-next-line no-console
  console.error("OpenTelemetry SDK failed to start; continuing without tracing", err);
}

// Flush spans on shutdown so the last call's spans aren't lost when the container is stopped.
process.on("SIGTERM", () => {
  void sdk.shutdown().finally(() => process.exit(0));
});
