---
name: codemap-l2-concerns
description: "Codebase map L2 — append-only landmark / Q&A cache for quick-ecommerce. Non-obvious \"concern → file:line → note\" answers found during exploration so they're never re-derived (the \"learns & grows\" layer). Read on a [[codemap-L0-orientation]] miss; append via /codemap learn or codebase-explorer suggestions. Seeded from MEMORY.md gotchas at c7a574f."
metadata: 
  node_type: memory
  type: project
  originSessionId: 487b2550-6756-4de6-8e79-62fc5a1f1a63
---

Append-only. Format: `concern → path:line (or path) → note`. Dedup by path:line. Each entry should be a
*non-obvious* location worth caching (a build-gate blind spot, a surprising owner, a contract gotcha) —
not something the [[codemap-L0-orientation]] topology table or [[codemap-L1-symbols]] map already answers.
Line numbers drift; treat as hints and confirm with a small grep if exact. Newest at bottom.

## Seeded landmarks (from MEMORY.md, c7a574f)
- gateway public-path classification → `gateway/.../filter/AuthFilter.java:25` (PUBLIC_PATHS) / `:35` (ADMIN_PATHS) → a route in application.yml is NOT reachable unless its path is also classified here; AuthFilter is a GlobalFilter. [[gateway-authfilter-global-not-route]]
- smoke browse assertions → `scripts/fullstack-smoke.sh` (the two "visible in browse"/"survived restart" greps) → MUST query `?size=200`; default Spring Data page=20 puts newest SKU on a later page → false FAIL once catalog >20 rows. [[smoke-browse-default-page-gotcha]]
- Flyway not run by build gate → `*/src/main/resources/db/migration/` → `docker compose build` compiles only; a bad migration (e.g. VARCHAR too small for its DEFAULT enum) crash-loops at startup → gateway 503, invisible to the build gate. Must `up` + smoke. [[migration-not-run-by-build-gate]]
- QA `-DskipTests` still compiles test sources → any `*/src/test/java` → a signature change breaks the build via stale test call sites even though tests don't run; update call sites. [[qa-gate-skiptests-compiles-tests]]
- checkout HTTP contract → `order-service/.../controller/OrderController.java` (checkout) + `scripts/*smoke*.sh` + README → new required CheckoutRequest fields 400 the smoke/k6/README callers; build gate is blind to HTTP contracts — sweep runtime callers. [[checkout-contract-breaks-smoke-journey]]
- rotating DB_PASSWORD → `.env` + postgres volume → needs `docker compose down -v` or auth fails on the stale volume-initialized password. [[postgres-password-volume-init-gotcha]]
- smoke admin seeding → `scripts/fullstack-smoke.sh` → mints a role=ADMIN JWT from `.env` to seed products; pre-RBAC guest seeding now 403s. [[smoke-needs-admin-token-after-rbac]]
- catalog→order recs coupling → `catalog-service/.../client/OrderClient.java` → best-effort, try/catch→`List.of()`, short timeouts, NO compose `depends_on` (boot coupling would defeat degradation); `REC_ENABLED` master-switch. [[recommendations-hybrid-pillar]]
- co-purchase self-join → `order-service/.../repository/OrderRepository.java` (findCoPurchased) → `oi2.product_id <> oi1.product_id` (no self-pairs), `COUNT(DISTINCT o.id)`, `status='CONFIRMED'` only; needs V3 index `idx_order_items_product`; build-gate-blind (needs real orders). [[recommendations-hybrid-pillar]]
- search ghost-doc gap → `catalog-service/.../search/ProductSearchService.java` → delete-during-OpenSearch-outage leaves a stale index doc (eventual-consistency gap). [[search-opensearch-pillar]]

<!-- New landmarks append below this line -->
- rate-limit algorithm + XFF trust → `gateway/.../filter/RateLimitFilter.java:86-109` → token-bucket (bucket4j), default 100 tok / 60s; XFF NOT trusted by default (`app.rate-limit.trust-forwarded-for:false`) — keys on real TCP peer IP unless deployed behind a trusted L7 proxy. [[pillar5-ratelimit-cors-audit]] (dogfood-appended c7a574f)
- saga payment-failure compensation → `order-service/.../service/SagaOrchestrator.java:~87` (decline → `inventory.release`) / `~98,108` (BusinessRejection/ServiceUnavailable → `safeRelease`) → release is idempotent (try-catch no-op if hold never placed/already released); compensates the inventory reservation when payment fails. Client: `client/InventoryClient.java:~37`. (dogfood-appended c7a574f; lines drift — confirm w/ grep)
- gateway restart crash-loop → `gateway/docker-entrypoint.sh:21` (`rm -f "$KEYSTORE"` before keytool) → keytool -genkeypair APPENDS to an existing PKCS12; without the rm, a `docker compose restart gateway` reuses the prior `/app/keystore.p12` → "alias <gateway> already exists" → `set -eu` crash-loops the container → 503. Fresh-boot CI never catches it — test the RESTART. Fixed PR #32. [[tls-at-edge-gateway]]
- trace dead-ends across a hop → outbound RestClient beans (`catalog RecommendationConfig`, `cart/order AppConfig`) MUST be built from the **injected** auto-configured `RestClient.Builder` — a `RestClient.create()` is NOT observation-wrapped, so the W3C trace.id stops at that hop. [[observability-tracing-pillar]]
- business-meter zeros after smoke restart → order/payment/auth meters are **lazy** (don't exist until first increment) and counters reset on `down→up` (in-memory) — a fresh scrape right after smoke §9 restart shows absent/0 counters; drive one post-restart journey before asserting. NOT a bug. [[observability-tracing-pillar]]
- no raw PII in logs/metrics → `*/config|filter/UserIdMdcFilter.java` puts the **hashed** user_id in MDC; metric labels are status/provider/method/le/uri/outcome only. Audit payment/order log lines on any change — masking is the compliance invariant. [[observability-tracing-pillar]]
- exemplars need ES + flag → Prometheus retains trace_id exemplars only with `--enable-feature=exemplar-storage` (compose `command`); Grafana metric→trace pivot needs the `exemplarTraceIdDestinations` → `elasticsearch-logs` datasource uid in `observability/grafana/provisioning/datasources/datasource.yml`. [[observability-tracing-pillar]]
