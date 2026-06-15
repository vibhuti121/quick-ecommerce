---
name: codemap-l0-orientation
description: "Codebase map L0 — auto-loaded orientation card for quick-ecommerce (service topology, ports, DBs, QA gate, gateway public/admin paths, \"where is X\" index). Read this before re-deriving architecture from source. Drill into [[codemap-L1-symbols]] / [[codemap-L2-concerns]] only on miss. Built by /codemap."
metadata: 
  node_type: memory
  type: project
  originSessionId: 487b2550-6756-4de6-8e79-62fc5a1f1a63
---

**This is the L0 orientation card.** Answer navigation/topology questions from here first — it exists so
the architecture need NOT be re-derived by re-reading `docker-compose.yml` + `application.yml` + service
files each session. On a miss: [[codemap-L1-symbols]] (class→role→path) → then a *slice* of source.
Known gotcha locations: [[codemap-L2-concerns]] (append-only). Refresh with `/codemap` when SHA lags HEAD.

## Freshness manifest
- built-at-SHA: `f740ff5ad1afbad59c883d787a4a620fffd5b355`
- built-at-short: `f740ff5`
- Flyway max-V: auth=V3 · catalog=V4 · inventory=V2 · order=V3 · payment=V1 · videocall=V1 · cart=none(Redis)
- If `git rev-parse HEAD` ≠ above → map may be stale; run `/codemap refresh`.

## Topology (Spring Boot 3.5.14 / Java 21 / `com.varsha.*` · docker-compose, 25 containers)
| Service | Internal port | Host-exposed | Owns / datastore | depends_on |
|---|---|---|---|---|
| gateway | 8443 (TLS) | **8443** (https edge) | — (Spring Cloud Gateway) | all app svcs + frontend |
| auth-service | 8081 | via gateway | authdb (PG) + JWT HS256; Redis (OTP store) | postgres, redis |
| catalog-service | 8090 | via gateway | catalogdb (PG); Redis cache; MinIO images; OpenSearch index | postgres, redis, minio, opensearch |
| cart-service | 8091 | via gateway | Redis (live cart, no DB) | redis, catalog-service |
| inventory-service | 8092 | via gateway | inventorydb (PG) | postgres |
| payment-service | 8093 | via gateway | paymentdb (PG) | postgres |
| order-service | 8094 | via gateway | orderdb (PG) + outbox | postgres, inventory-service, payment-service |
| videocall-service | 8095 | via gateway | videocalldb (PG); Redis (`videocall:cd:` 5h cooldown) | postgres, redis |
| signaling-service | 3001 | via gateway `/socket.io/` | Node + Socket.IO mesh; no DB; verifies call grant | — (shares VIDEOCALL_GRANT_SECRET) |
| coturn | 3478 | **3478 udp/tcp** | TURN/STUN relay (STUN-only locally; the ONE svc needing host ports) | — |
| frontend | 80 | via gateway `/**` | React/Vite SPA (served same-origin) | — |
| admin-app | 80 | **127.0.0.1:5174** (loopback + basic-auth) | React/Vite admin → order-service | order-service |
| postgres | 5432 | internal | 5 logical DBs (init-multiple-dbs.sh) | — |
| redis | 6379 | internal | catalog cache + cart | — |
| minio | 9000 | **9000/9001** | product images (S3) | — |
| opensearch | 9200 | internal | product search index | — |
| prometheus | 9090 | **9090** | scrapes /actuator/prometheus (15d); SLO/recording rules + exemplar storage | gateway |
| alertmanager | 9093 | **9093** | routes/dedupes Prometheus SLO alerts (receivers stubbed pre-go-live) | prometheus |
| grafana | 3000 | **3000** | dashboards over Prometheus **+** Elasticsearch (4: Infra·API-SLO·Business·catalog-cache) | prometheus |
| elasticsearch | 9200 | internal | logs (`logs-quickcart`) + traces (APM); single-node, capped heap | — |
| kibana | 5601 | **5601** | logs Discover + APM waterfall; forensic "journey by trace.id" view | elasticsearch |
| apm-server | 8200 | internal | receives OTLP spans from all svcs → ES | elasticsearch |
| filebeat | — | internal | tails container stdout JSON → ES (ECS, PII-masked) | elasticsearch |
| es-init / kibana-init | — | internal | one-shot `curlimages/curl` jobs: ES ILM/template + Kibana saved objects | elasticsearch / kibana |

> App services are **gateway-internal only** (no host port) — reach catalog etc. via a throwaway container on
> network `quick-ecommerce_default`, or through the gateway at `https://localhost:8443`.
> Observability infra published to host: Prometheus 9090 · Alertmanager 9093 · Grafana 3000 · Kibana 5601 (ES/apm-server/filebeat internal).
> Legacy `backend/` (`com.example.ecommerce`) monolith exists in the tree but is **NOT** in the compose runtime — ignore for runtime questions.

## Gateway access (gateway/.../filter/AuthFilter.java + application.yml)
- **PUBLIC** (no token): `/oauth2/`, `/login/`, `/health`, `/actuator/`, `/auth/guest`, `/auth/register`, `/auth/login`, `/auth/otp/`, `/api/catalog/products`(+subpaths: detail, `/search`, `/{id}/recommendations`), `/api/catalog/notify` ("Notify me"), `/socket.io/` (WS carries the call grant in its handshake), and the SPA catch-all (any path NOT starting `/api/` or `/auth/`).
- **ADMIN-only** (role=ADMIN): `/api/catalog/admin` (incl. `/admin/notify`), `/api/inventory/admin`, `/api/videocall/admin` (eligibility roster), plus order-service `/admin/orders` (admin-app).
- Everything else under `/api/**` + `/auth/**` (non-guest) needs a valid Bearer JWT — incl. `/api/videocall/grant`+`/eligibility` (login-protected).
- Routes: `/api/catalog/**`→8090 · `/api/cart/**`→8091 · `/api/inventory/**`→8092 · `/api/payments/**`→8093 · `/api/orders/**`→8094 · `/api/videocall/**`→8095 · `/socket.io/**`→signaling:3001 · `/auth/**`,`/oauth2/`,`/login/`→8081 · `/**`→frontend:80 (catch-all, last).
- AuthFilter is a **GlobalFilter** — adding a route ≠ making it reachable; classify the path in AuthFilter too. [[gateway-authfilter-global-not-route]]

## Build & test (QA gate)
- Per service: **`docker compose build <svc>`** (host JDK≠21, so build in Docker). `-DskipTests` still compiles test sources. [[qa-gate-skiptests-compiles-tests]]
- Frontend: `cd frontend && npm run build` (tsc strict + vite). Admin: `cd admin-app && npm run build`.
- Runtime gate (the real one): `scripts/gen-secrets.sh` → `docker compose up -d` → `scripts/fullstack-smoke.sh`.
- Smoke roster: `fullstack-smoke.sh` (gateway e2e, ~68 asserts: browse/search/recs/checkout-saga/idempotency/restart + 8d videocall grant-gate + 8e self-serve auth) · `saga-smoke.sh` (saga isolation) · `security-scan.sh` (trivy) · `gen-secrets.sh` (.env; +VIDEOCALL_GRANT_SECRET/TURN_SECRET) · `init-multiple-dbs.sh` (PG db init, incl. videocalldb). WS handshake/max-3/kill-timer covered by `signaling-service` Jest tests (`src/__tests__/`), not the curl smoke.
- Build gate does NOT run Flyway or HTTP contracts — migrations + endpoint contracts only fail at runtime/smoke. [[migration-not-run-by-build-gate]] [[checkout-contract-breaks-smoke-journey]]

## Where is X (navigation index → drill via [[codemap-L1-symbols]])
- Checkout saga → `order-service/.../service/SagaOrchestrator.java` (+ `CheckoutService.java`, `OutboxPoller.java`)
- Auth gating / public-path classify → `gateway/.../filter/AuthFilter.java`
- JWT mint/validate → `auth-service/.../service/JwtService.java` (+ `UserService.java`)
- Self-serve login (email/phone+password, phone-OTP) → `auth-service/.../controller/AuthController.java` (`/auth/register`,`/auth/login`,`/auth/otp/request`,`/auth/otp/verify`); OTP store + hashing → `service/OtpService.java` + `repository/OtpRepository.java` (Redis); SMS stub → `service/sms/LoggingSmsSender.java`; BCrypt bean → `config/CryptoConfig.java`
- "Notify me" launch-interest signup → `catalog-service/.../controller/NotifyController.java` (`/api/catalog/notify`, admin list `/admin/notify`) + `service/NotifyService.java`
- Gated video calling (grant gate) → `videocall-service/.../controller/VideocallController.java` (`/api/videocall/eligibility`,`/grant`,`/admin/eligibility`); grant signer → `service/GrantService.java`; 5h cooldown → `repository/CooldownRepository.java` (Redis SETNX). [[videocall-gated-calling-pillar]]
- WebRTC signaling (socket admit-on-grant) → `signaling-service/src/auth.ts` (fail-closed grant verify) + `handlers/signaling.ts` + `roomManager.ts` (MAX 3 + kill-timer)
- Catalog CRUD / browse → `catalog-service/.../service/CatalogService.java` + `controller/CatalogController.java` (base `/api/catalog`)
- Redis read-through cache → `catalog-service/.../service/ProductCacheService.java`; live cart → `cart-service/.../repository/CartRepository.java`
- Product search (OpenSearch, ILIKE fallback) → `catalog-service/.../search/ProductSearchService.java`
- Recommendations (co-purchase + content blend) → `catalog-service/.../service/RecommendationService.java` (+ `client/OrderClient.java`; data at order `controller/RecommendationDataController.java`)
- Image upload (MinIO) → `catalog-service/.../service/ObjectStorageService.java`
- Stock reserve/commit/release → `inventory-service/.../service/InventoryService.java` (durable DB-lock oversell guard); fast Redis ATP pre-check (409 early reject, degrades when Redis down) → `service/AtpService.java` (seeded by `config/AtpBackfillRunner.java`); bulk product enable/disable → catalog `PATCH /admin/products/active`
- Payment (mock/cod providers) → `payment-service/.../service/PaymentService.java` (+ `provider/*`)
- Rate limit → `gateway/.../filter/RateLimitFilter.java`; TLS/security headers → `SecurityHeadersFilter.java`
- Observability (trace·log·metric, joined by W3C trace.id) → OTel/Micrometer tracing config in each `application.yml`; hashed-user_id MDC → `*/config|filter/UserIdMdcFilter.java` (all 7 svcs); business meters → order `CheckoutService`/`SagaOrchestrator` (orders/GMV/saga), `PaymentService` (payment_attempts), auth `UserService` (signups); Node spans → `signaling-service/src/tracing.ts`. Infra config under `observability/` — `prometheus/{prometheus.yml,rules/slo.yml}`, `alertmanager/alertmanager.yml`, `grafana/dashboards/{infra,api-slo,business}.json` + `provisioning/datasources/datasource.yml`, `kibana/{init-kibana.sh,forensic-objects.ndjson}`, `filebeat/`, `elasticsearch/`. [[observability-tracing-pillar]]
- Frontend API client → `frontend/src/api.ts`; app shell → `frontend/src/App.tsx`
- Catalogue v2 discovery (sticky category/sort/facets toolbar, inline live filter, "Showing N of M") → `frontend/src/components/CatalogControls.tsx` (filter/sort state in `App.tsx` `displayed` useMemo); editorial-provenance cards → `ProductCard.tsx` (+ `lib/provenance.ts`); detail zoom + quick-add + indicative grade → `ProductDetail.tsx`; home recs strip → `RecommendedRow.tsx` (+ `lib/recentlyViewed.ts`). OpenSearch `searchProducts()` retained in `api.ts` but unwired (grid filters client-side). [[frontend-ecosystem]]
- Admin SPA (multi-page: login/dashboard/orders/products-CRUD/inventory) → `admin-app/src/pages/*`; login field is `identifier` [[admin-login-credential-gotcha]]; JWT rides `X-Access-Token` past nginx basic-auth [[admin-basic-bearer-header-collision]]
- User profile / order history / wishlist → `frontend/src/components/ProfileDrawer.tsx` (+ `api.ts` getOrders/getProfile, `lib/wishlist.ts`); order-status auto-poll in `App.tsx`
- Smoke assertions → `scripts/fullstack-smoke.sh` (browse asserts MUST use `?size=200` [[smoke-browse-default-page-gotcha]])
