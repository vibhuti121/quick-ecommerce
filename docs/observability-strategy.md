# Observability Strategy — quick-ecommerce

**Status:** Phase 0 (design). Phase 1 (tracing foundation) in progress.
**Owners:** platform / on-call. **Last reviewed:** 2026-06-11.

A quick-commerce platform makes money only while the checkout path is fast and correct. When a
customer says *"₹450 was deducted but my order never arrived"* two weeks later, we must be able to
reconstruct exactly what happened — every service hop, every timestamp, the precise point of failure —
from a **single identifier**. This document is the design for that capability across three pillars:
**distributed tracing**, **structured logging**, and **metrics + alerting**.

---

## 1. Why now — the current state

The stack is 8 Java services (Spring Boot 3.5 / Java 21, `com.varsha.*`) + 1 Node signaling service
behind a TLS gateway (`:8443`). Observability today is **partial and broken end-to-end**:

| Pillar | What exists | The gap |
|---|---|---|
| **Tracing** | Gateway mints `X-Correlation-ID` | No service reads it; no `RestClient` forwards it → the chain **breaks at every hop**. Auth has two conflicting correlation filters. Gateway MDC key (`X-Correlation-ID`) ≠ logback pattern (`%X{correlationId}`). `includeContext=false` strips MDC from JSON. **No OpenTelemetry anywhere.** A journey cannot be reconstructed from an ID. |
| **Logging** | Identical `net.logstash.logback` JSON encoder on all 8 services (`service` field); Node uses Winston JSON | `includeContext=false` → MDC (and any trace id) never reaches the log. **No aggregation** — logs die in Docker's `json-file` driver. **No PII scrubbing**, no retention tiers. |
| **Metrics** | Prometheus + Grafana run; all 8 services expose `/actuator/prometheus` | **One** dashboard (catalog cache). `videocall-service:8095` **not scraped**. Zero business metrics. No latency histograms → **no real p99**. **No alerting** (no rules, no Alertmanager). |

**Outcome we are buying:** one `trace.id` surfaces a whole journey (browse → cart → checkout → order →
delivery) with timestamps, service boundaries and error points; centralized PII-safe logs with
hot/warm/cold retention for disputes; on-call Grafana dashboards (infra + API SLO + business KPI) with
alerting, every panel drillable to the underlying trace.

---

## 2. Target architecture

```
                       ┌─────────────── Grafana (existing :3000) ────────┐
  app → gateway:8443 →│  Prometheus :9090 ── Alertmanager (paging)       │  ← metrics + SLO dashboards
        │  services    │  Elasticsearch datasource (pivot by trace.id)   │
        │  (OTel SDK)  └─────────────────────────────────────────────────┘
        │
        ├── traces (OTLP) → APM Server :8200 ──────────→ Elasticsearch ──┐
        └── logs (stdout JSON) → Filebeat ─────────────→ Elasticsearch ──┤→ Kibana (logs + APM waterfall)
                                                                          (shared trace.id links log ↔ span)
```

**Tooling split (locked decision):**
- **Elasticsearch + Kibana own logs *and* traces.** Traces arrive as Elastic APM via OTLP; logs arrive
  via Filebeat. Kibana's APM UI renders the span waterfall; Discover renders the correlated log timeline.
- **Prometheus + Grafana own metrics + alerting** (already running — we extend, not replace).
- **Grafana gets an Elasticsearch datasource** so on-call can pivot metric → trace → log by `trace.id`
  without leaving the dashboard.

**Why this split:** metrics are cheap, high-cardinality-hostile, and already wired into Prometheus;
logs+traces are bulky, schema-rich, and best served by a single search backend joined on one key. One
backend per data-shape keeps each tool in its lane and avoids paying for two metrics systems or two
log stores.

---

## 3. The correlation model — one key joins everything

The single join key is the **W3C trace context** (`trace.id` / `span.id`), propagated by **Micrometer
Tracing + OpenTelemetry**:

- A request entering the gateway gets a `traceparent`; Micrometer auto-propagates it across the reactive
  gateway and **every `RestClient` hop** to downstream services, and injects `traceId`/`spanId` into the
  **MDC** of each service automatically.
- With `includeContext=true`, those MDC fields land in every JSON log line.
- The same `trace.id` is the document id linking the **APM span waterfall** and **every log line** in
  Elasticsearch — and (via exemplars) the metric sample in Prometheus.

This **replaces** the three hand-rolled correlation mechanisms (`gateway CorrelationIdFilter`, auth
`CorrelationIdFilter` + `MdcFilter`), which are deleted — Micrometer owns propagation now.

**Live debugging vs durable forensics — the key insight:** traces are **sampled** and **short-retention**
(days) — they are for live debugging. The **durable 1-year dispute trail lives in the logs** (audit
events keyed by `trace.id`), plus the order/payment databases. The *"₹450 deducted, no order"* query 2
weeks later hits the **warm/cold log tier** by `trace.id` or hashed `user_id`; the APM waterfall is a
bonus only if the trace is still inside its retention window. **We never rely on a sampled trace to
resolve a money dispute.**

---

## 4. Pillar 1 — Distributed tracing  *(first increment)*

**Instrumentation (all 8 Java services):** add `micrometer-tracing-bridge-otel` +
`opentelemetry-exporter-otlp` (managed by the Micrometer Tracing BOM). `spring-boot-starter-actuator` is
already present and drives the bridge. Rely on Boot 3 **auto-instrumentation** — inbound WebFlux/WebMVC,
outbound `RestClient`, JDBC — no hand-rolled spans except a couple of named business spans later.

**Config (each `application.yml`):**
- `management.tracing.sampling.probability` — head sampling, `0.1` default (overridable to `1.0` in dev).
- `management.otlp.tracing.endpoint: http://apm-server:8200` (Elastic APM OTLP intake).
- W3C propagation (Boot default), and a rule that **always samples** errors + `/api/payments/**` +
  `/api/orders/**` so money paths are never dropped.

**Verification gotcha:** the outbound `RestClient` beans (catalog `RecommendationConfig`, cart/order
`AppConfig`) must be built from the **auto-configured `RestClient.Builder`** for the observation
instrumentation to wrap them; otherwise the span breaks at that hop. The gateway is reactive — confirm
Reactor context propagation carries the span across the filter chain.

**Node signaling-service:** `@opentelemetry/sdk-node` + auto-instrumentations + Winston instrumentation,
propagating trace context over the socket.io handshake so its spans/logs join the same `trace.id`.

**Backend:** add single-node `elasticsearch` (capped heap), `kibana`, and `apm-server` to
`docker-compose.yml`. Kibana APM UI renders the waterfall.

---

## 5. Pillar 2 — Structured logging, audit & forensics

**Common ECS-aligned schema**, enforced by **one shared logback include** reused by all 8 Java services
(replacing the ad-hoc per-service config). Fields:

| Field | Source |
|---|---|
| `@timestamp` | logback |
| `service` | `spring.application.name` |
| `log.level`, `logger` | logback |
| `trace.id`, `span.id` | MDC (Micrometer) — **requires `includeContext=true`** |
| `user_id` | **hashed** at the trust edge — never raw |
| `event`, `payload` | logstash `StructuredArguments` / markers — typed business events |
| `message` | the log line |

**The one-line unlock:** flip `includeContext=false` → `true`. Without it, `trace.id`/`span.id`/`user_id`
never reach the JSON and the entire correlation story is invisible in logs (current silent gap).

**PII policy (compliance-critical — see §8):**
1. **Hash `user_id` at the edge.** The gateway resolves identity and sets `X-User-Id`; services put the
   **hash** into MDC. Raw id / email / phone never enter a log line by default.
2. **Defense-in-depth masking.** An Elasticsearch **ingest pipeline** (and/or a logback masking
   decorator) regex-masks card / phone / email patterns so an accidental raw-PII line is masked **before**
   it persists. Payment-service and order-service log statements get a specific audit.
3. **Never log card data**, ever. (No card number, CVV, expiry in any field.)

**Shipping & retention:** `filebeat` reads container stdout (Docker autodiscover) → Elasticsearch; the
Node service emits the same field names. **ILM:** hot 7d (fast primary) → warm 30d → cold 1y
(compliance/dispute) → delete. Order/payment **audit events** route to the cold tier.

**Forensic UX:** a Kibana saved view *"journey by trace.id / hashed user_id"* returns the full ordered
timeline with service boundaries and error lines — the one-query dispute-resolution goal.

---

## 6. Pillar 3 — Metrics, dashboards & alerting

**Fix the gaps:**
- Add `videocall-service:8095` to `prometheus.yml`.
- Enable latency histograms per service
  (`management.metrics.distribution.percentiles-histogram.http.server.requests: true`) → real p50/p95/p99.
- Enable **Prometheus exemplars** (attach `trace_id` to samples) for one-click panel → trace drill.

**Business meters in code** (Micrometer `Counter`/`Timer`):

| Meter | Where |
|---|---|
| `orders_placed_total{status}`, `gmv_rupees_total`, `checkout_latency_seconds` | order `CheckoutService` / `SagaOrchestrator` |
| `payment_attempts_total{provider,status}` | `PaymentService` |
| `signups_total` | catalog `NotifyService` (launch-interest) |
| `cart_abandonment` | cart-service |
| `on_time_delivery_ratio` | order delivery |
| active-users (rolling 10m) | gauge / Redis approximation |

**Grafana dashboards (provisioned JSON):**
1. **Infra** — JVM heap/GC, CPU, threads, HikariCP pool, per service.
2. **API SLO** — RPS, p50/p95/p99, error rate, top-10 slowest endpoints, exemplar links to traces.
3. **Business** — active users, signups, orders, GMV, cart abandonment, on-time delivery %.

Plus the **Elasticsearch datasource** so any panel links out to logs/traces by `trace.id`.

**Alerting:** add `alertmanager` + Prometheus rule files. **SLO burn-rate** alerts, e.g.
`checkout p99 > 800ms for 5m → page on-call`, plus availability / error-budget rules.

---

## 7. SLO catalogue (initial — refine after baselines)

| Journey | Indicator | Objective | Alert |
|---|---|---|---|
| Checkout (`POST /api/orders`) | p99 latency | < 800 ms | p99 > 800ms for 5m → page |
| Checkout | success rate | ≥ 99.5% | error budget burn ×14 (1h) → page |
| Browse/search (`/api/catalog/**`) | p95 latency | < 300 ms | p95 > 300ms for 10m → ticket |
| Payment (`/api/payments/**`) | success rate (excl. legit declines) | ≥ 99.9% | any provider error spike → page |
| Gateway | availability | ≥ 99.9% | 5xx rate > 1% for 5m → page |

Sampling policy: 10% head sampling globally; **100% on error, `/api/payments/**`, `/api/orders/**`**.

---

## 8. On-call runbook — the "₹450 deducted, no order" dispute

1. Get the **`trace.id`** (from the customer's confirmation, support ticket, or look up by **hashed
   `user_id` + time window** in the Kibana forensic saved view).
2. **Kibana APM** → search the `trace.id` → read the waterfall: gateway → cart → order → inventory →
   payment → DB, with per-span timestamps and any error span. Did payment succeed? Did the saga
   compensate (inventory release)? Where did it stop?
3. **Kibana Discover** → same `trace.id` → the ordered log timeline (error lines included), even if the
   trace itself has aged out (logs live 1 year; traces days).
4. Cross-check the **order DB** (order status, outbox) and **payment DB** (charge/refund) for ground
   truth on the money.
5. Resolve: refund / reconcile / escalate. The whole reconstruction is one ID, minutes not hours.

**PII guardrail for support:** the forensic view shows **hashed** `user_id` and **masked** card/phone —
support correlates by trace, never by raw PII.

---

## 9. Cost & resource note (asset-light)

ES + Kibana are RAM-hungry. For the single-box dev/pilot stack: **single-node Elasticsearch with a capped
JVM heap** (e.g. `ES_JAVA_OPTS=-Xms512m -Xmx512m`), `discovery.type=single-node`, security off (in-network
only). This is for **local + pilot scale** — at go-live, move logs/traces to a **managed backend**
(Elastic Cloud / Grafana Cloud) and hand the sizing/cost decision to `compliance-finance`. Keep head
sampling modest to bound trace volume; tail-based sampling via an OTel Collector is deferred until volume
warrants it.

---

## 10. Rollout (phased — each phase ends at the QA gate: `docker compose build` + `up` + smoke)

- **Phase 0 — this doc.** ✅
- **Phase 1 — Tracing foundation** *(first increment)*: deps + `application.yml` tracing on all 8
  services; delete the 3 broken filters; flip `includeContext=true` + shared logback schema (so `trace.id`
  shows in logs immediately); stand up ES + Kibana + APM-server; Node OTel SDK. **Verify the journey.**
- **Phase 2 — Logging/forensics**: Filebeat → ES; ILM hot/warm/cold; PII hash + masking pipeline;
  `event`/`payload` structured events on key flows; Kibana forensic saved view.
- **Phase 3 — Metrics + alerting**: scrape videocall; histograms + exemplars; business meters; 3 Grafana
  dashboards; Alertmanager + SLO rules.

**Acceptance (headline test):** drive a real journey through `https://localhost:8443`; capture its
`trace.id`; see the full gateway→…→payment→DB waterfall in Kibana APM; see the **same** `trace.id` on
every related log line; force a payment decline and confirm the error path is captured (100% sampled);
confirm no raw PII persisted; `scripts/fullstack-smoke.sh` stays green (57 assertions).

---

## 11. Deferred

- Tail-based sampling via an OTel Collector (vs head sampling) — when trace volume grows.
- Real paging integration (PagerDuty/Opsgenie/email) in Alertmanager — at go-live.
- Per-endpoint SLO targets + formal error-budget policy — after baseline latencies are observed.
- Go-live backend sizing (self-host vs Elastic Cloud / Grafana Cloud) — owned by `compliance-finance`.
