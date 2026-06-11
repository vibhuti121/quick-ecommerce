# PROJECT-CONTEXT.md — quick-ecommerce (MaLLADE)

> **What this is:** a production-shaped **microservices e-commerce platform**. A resilient, TLS-terminating
> API gateway + auth edge in front of **six commerce services**, each with its own database, plus search,
> object storage, caching, observability, an isolated admin console, and a React storefront. The brand it
> powers is **MaLLADE** — traceable, GI-tagged honey & fruit.
>
> **How to use this file:** attach/paste it into an AI (Claude or other) to ask questions about the
> codebase. It is the engineering "single source of context." For more depth see the **Pointers** at the
> bottom. Facts here are code-verified (not just README claims).

---

## 1. Project status — how much is built

| Area | Status | Notes |
|---|---|---|
| **Phase 1 — Core microservices** | ✅ Done | 6 services, per-service Postgres/Redis, outbox saga, resilient gateway, survives restart |
| **Phase 2 — Scale & ops** | ✅ Done | Redis catalog cache, MinIO image storage, Prometheus + Grafana, k6 load tests |
| **Security hardening** | ✅ Done | RBAC (ADMIN allowlist), edge TLS, per-IP rate limit, CORS + security headers, Spring Boot 3.5 upgrade |
| **Product search** | ✅ Done | OpenSearch (typo-tolerant) + Postgres `ILIKE` fallback, dual-write + startup backfill |
| **Recommendations** | ✅ Done | Hybrid: co-purchase → content-based → category fallback; never 503s |
| **Storefront UI polish** | ✅ Done | Iterations 0–9 — "Warm Luxe Gold" design language + hero, product-card & PDP redesign, collection taxonomy + luxury filter **sidebar** — see `frontend/CLAUDE.md` |
| **Real payments** | ⬜ Pending | Mock provider only; Razorpay/Stripe is a later swap behind `PaymentProvider` |
| **Cloud deploy + CA TLS** | ⬜ Pending | Images are deploy-ready; no hosting/domain/CA cert yet (dev self-signed) |
| **Commerce-service tests** | ⬜ Pending | Only auth-service has unit tests; others covered by smoke scripts |
| **DS-0031** | ⬜ Open | `TLS_KEYSTORE_PASSWORD` passed via gateway Dockerfile build-ARG (trivy CRITICAL); supply at runtime in prod |
| **Frontend backlog** | ⬜ Pending | Cart/checkout UX (progress/cross-sell), profile order-timeline; Exotic/Juices/Gift-Box collections await real SKUs (PDP provenance spotlight done) |

---

## 2. Full tech stack

**Backend** — Java 21 (virtual threads on), **Spring Boot 3.5.x**, **Spring Cloud Gateway 2025.0.2**
(WebFlux/Reactor), Maven (multi-module, group `com.varsha`), Flyway (schema), HikariCP (pooling),
Spring Data JPA/Hibernate, Spring Data Redis, Spring Security + OAuth2 Client, **jjwt** (HS256),
**Resilience4j** (circuit breaker / retry / bulkhead), **Bucket4j + Caffeine** (rate limiting),
**OpenSearch 2.11.1** Java client (low-level), **AWS SDK v2** (S3/MinIO), Micrometer (Prometheus),
Logback + Logstash encoder, Tomcat 10.1.55.

**Frontend** — React 18, Vite 5, TypeScript, `@fontsource` (Inter + Fraunces). Single-page app, no router.

**Infrastructure** — Docker Compose (15 containers), Postgres 16, Redis 7, MinIO (S3-compatible),
OpenSearch 2.11.1, Prometheus, Grafana, nginx (frontend + admin static serving).

> Version note: README states Spring Boot **3.5.12** (the off-EOL baseline); the poms currently pin
> **3.5.14**. Treat as "3.5.x". Tomcat is re-pinned to **10.1.55** (a load-bearing override over Boot's BOM).

---

## 3. Architecture

```
  Browser (React/Vite SPA, :5173 dev)
        │  HTTPS
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ GATEWAY  :8443  (Spring Cloud Gateway, TLS terminates here)  │
  │ filters: correlation-id · security-headers · auth (JWT) ·    │
  │ rate-limit (per-IP) · bulkhead · per-route CB + retry · CORS │
  │ validates JWT once → injects X-User-Id/-Email/-Role downstream│
  └─┬───────┬───────┬────────┬─────────┬─────────┬───────────────┘
    │/auth  │/catalog│/cart  │/inventory│/payments│/orders   (+ catch-all → SPA)
    ▼       ▼        ▼        ▼          ▼         ▼
  auth   catalog   cart   inventory  payment    order
  :8081  :8090    :8091   :8092      :8093      :8094
    │     │ │ │      │        │          │         │
  authdb │ │ └Redis(cart)  inventorydb paymentdb orderdb
         │ └─Redis (read cache)              (outbox→saga poller)
         ├── MinIO (product images, S3)
         └── OpenSearch (search index)

  Observability:  Prometheus :9090 ──scrape /actuator/prometheus──▶ all services
                  Grafana    :3000 ──reads──▶ Prometheus
  Admin (dark):   admin-app  127.0.0.1:5174 (nginx basic-auth) ──▶ order-service /admin/orders
```

- **DB-per-service** — no cross-service DB joins. Synchronous reads go service→service over REST; order
  events flow **asynchronously** via a transactional outbox → poller saga.
- **Downstream services trust the gateway.** Only the gateway validates the JWT; commerce services read
  identity from injected `X-User-*` headers and never re-validate. Admin routes are gated at the edge **and**
  re-checked in-service (defense in depth).
- **TLS only at the edge.** The gateway listens HTTPS :8443 (dev self-signed); inter-service traffic is
  plain HTTP on the docker network (commerce services aren't host-published).

---

## 4. Services & ports

| Service | Port | Published? | Store | Responsibility |
|---|---|---|---|---|
| **gateway** | 8443 | ✅ (HTTPS) | — | TLS edge: routing, auth, rate-limit, circuit breakers, CORS, headers, corr-id |
| **auth-service** | 8081 | ❌ | `authdb` | Guest JWT, `/auth/validate`, Google OAuth2, RBAC |
| **catalog-service** | 8090 | ❌ | `catalogdb` + Redis + MinIO + OpenSearch | Products/variants/JSONB attrs, browse, search, recs, images, admin CRUD |
| **cart-service** | 8091 | ❌ | Redis only | Per-user cart, price snapshot at add-time |
| **inventory-service** | 8092 | ❌ | `inventorydb` | Stock + reservations (hold/commit/release) |
| **payment-service** | 8093 | ❌ | `paymentdb` | `PaymentProvider` + `MockPaymentProvider` |
| **order-service** | 8094 | ❌ | `orderdb` | Orders + outbox saga + idempotent checkout |
| postgres | 5432 | ❌ | — | One DB per service |
| redis | 6379 | ❌ | — | Cart store + catalog read cache |
| opensearch | 9200 | ❌ | — | Product search index (secondary; Postgres is source of truth) |
| minio | 9000 / 9001 | ✅ | — | S3 API / web console for product images |
| prometheus | 9090 | ✅ | — | Scrapes every `/actuator/prometheus` (15s) |
| grafana | 3000 | ✅ | — | Dashboards (catalog cache hit-ratio, per-service) |
| **admin-app** | 5174 | ✅ (127.0.0.1 only) | — | nginx basic-auth console → order-service `/admin/orders` |
| frontend (dev) | 5173 | dev only | — | Vite dev server; proxies `/api`,`/auth` → gateway :8443 |

---

## 5. How each service works (deep dive)

### gateway (the edge)
Global filters (execution order in parentheses):
- **CorrelationIdFilter (-4)** — generates/propagates `X-Correlation-ID`, into logs (MDC).
- **SecurityHeadersFilter (-5)** — `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, etc.
- **AuthFilter (-1)** — for protected paths, requires `Authorization: Bearer`; validates the token via a
  **circuit-broken** call to auth-service `/auth/validate`; **strips** any client-sent `X-User-*` then
  **re-injects** validated `X-User-Id/-Email/-Display-Name/-Role`; enforces ADMIN on `/**/admin/**` (403);
  public whitelist: `/auth/guest`, `/api/catalog/products`, `/api/catalog/notify`, `/actuator/**`,
  `/oauth2/**`, `/login/**`, plus the SPA catch-all.
- **RateLimitFilter (-3)** — Bucket4j + Caffeine token bucket, **100 req / 60s per IP**, emits
  `X-RateLimit-*`; only trusts `X-Forwarded-For` when `RATE_LIMIT_TRUST_FORWARDED_FOR=true`.
- **BulkheadFilter (1)** — per-route concurrency caps.
- **Per-route Resilience4j** — circuit breaker (50% failure / 10-call window / 10s open) + **retry on GET only**
  (2 retries, 50→500ms backoff); failures fall back to `/fallback/**` (503) instead of hanging.
- **CORS** — origin pinned to `ALLOWED_ORIGIN`, headers `Authorization,Content-Type,Idempotency-Key`,
  credentials off. **TLS** — PKCS12 keystore at `/app/keystore.p12` (`TLS_KEYSTORE_PASSWORD`).

### auth-service (`authdb`)
- `POST /auth/guest` → mints a guest **JWT (USER role, ~30 min)** — no login needed.
- `GET /auth/validate` → returns `{userId,email,displayName,role}` for the gateway.
- `GET /auth/me`, `PUT /auth/me/display-name`.
- **Google OAuth2** success handler creates/updates a `users` row; emails in **`ADMIN_EMAILS`** are promoted
  to **ADMIN** (guests are always USER). HS256 via **jjwt**; `JWT_SECRET` is fail-closed, ≥32 bytes.

### catalog-service (`catalogdb` + Redis + MinIO + OpenSearch)
- **Model:** `ProductType` enum {PHYSICAL, DIGITAL, SERVICE, SUBSCRIPTION, RENTAL} + a **JSONB `attributes`**
  column → new product kinds need no schema change. Provenance/GI live under `attributes.provenance`
  (`farm, origin, harvest, batch, labCert, gi.{status,name,authNo}`). Variants are informational (cart is
  keyed by productId, not variant). Flyway **V1–V4** (baseline → seeds → MaLLADE provenance seed → notify table).
- **Endpoints:** public `GET /api/catalog/products` (paginated), `/products/search?q=`, `/products/{id}`,
  `/products/{id}/recommendations`, `POST /products` `/notify`; admin (🛡) CRUD under `/api/catalog/admin/**`
  incl. multipart image upload.
- **Search:** OpenSearch index `products`; **dual-write** on every catalog write + a **startup backfill**
  (waits ≤30s for readiness). Query = multi-field fuzzy (`AUTO`) + phrase-prefix type-ahead over
  name/sku/category/description/flattened attributes. **Degrades to a Postgres `ILIKE` scan** when OpenSearch
  is down (never 503s). Toggle `SEARCH_ENABLED`.
- **Recommendations (hybrid, never 503s):** ① **co-purchase** — calls order-service over the docker network
  (best-effort, short timeouts, empty on failure); ② **content-based** — OpenSearch `more_like_this`; ③
  **same-category** Postgres fallback. Size clamped 1–24. Toggle `REC_ENABLED`.
- **Redis read-through cache:** product (3600s) + browse pages (600s); **evicted on every write** so reads
  never outlive changes; **degrades to DB** if Redis is down (errors/404s aren't cached).
- **MinIO/S3:** admin image upload → `product-images` bucket; stores the in-network endpoint but returns the
  host-facing `MINIO_PUBLIC_URL` so the browser can fetch.

### cart-service (Redis only)
- `GET /api/cart`, `POST /api/cart/items`, `DELETE /api/cart/items/{id}`, `DELETE /api/cart`.
- **Signed-delta quantity** (`+1` add, `-1` decrement; line ≤0 removed). On a **new line** it snapshots
  price/name/image from catalog (`CatalogClient`) — later catalog price changes don't move the cart. Keyed on
  the gateway-injected `X-User-Id`; one Redis blob `cart:{userId}` with an inactivity TTL.

### order-service (`orderdb`) — the saga owner
- `POST /api/orders/checkout` (requires `Idempotency-Key`) writes the **Order (PENDING)** *and* an
  `order_outbox` event in **one transaction**, returns 202. Idempotent on the key (same key → same order).
- A **`@Scheduled` outbox poller** (`OUTBOX_POLL_INTERVAL_MS`, default 2000) drains pending events and runs
  the saga per event: **reserve inventory → charge payment → commit hold (CONFIRMED)** or **release
  (FAILED)**. Up to **5 attempts**; a **business 4xx** (e.g. out of stock, payment decline) is terminal →
  release + FAILED; a **5xx/timeout** is transient → retry. Every step idempotent on `orderId`.
- `delivery_status` (AWAITING_DELIVERY → DELIVERED) is orthogonal to the saga (COD pilot, admin-driven).
- `/admin/orders/**` is **not** routed by the gateway and not host-published; reachable only via admin-app,
  and re-checked by an in-service `AdminRoleFilter` (`X-User-Role: ADMIN`).

### inventory-service (`inventorydb`)
- Stock = `available_qty` + `reserved_qty` with a Hibernate `@Version`. Two-phase reservations
  **HELD → COMMITTED | RELEASED**, idempotent on `orderId`. Reserve locks rows `SELECT … FOR UPDATE`
  **sorted by SKU** (deadlock-free, all-or-nothing) → **no oversell** under concurrent checkouts.

### payment-service (`paymentdb`)
- `PaymentProvider` interface; the active bean is chosen by `PAYMENT_PROVIDER`. **MockPaymentProvider**
  approves everything **except a total ending in `.66`** → deterministic decline hook to exercise the saga's
  compensation (release) path. Idempotent per `orderId`.

### admin-app (loopback console)
- nginx static SPA behind **HTTP basic-auth** (`ADMIN_USER`/`ADMIN_PASSWORD`, htpasswd generated at start),
  bound to **127.0.0.1:5174**. Reverse-proxies `/admin/orders` → order-service injecting `X-User-Role: ADMIN`.
  This is the username/password popup people sometimes hit — it is the admin console, not the storefront.

### observability / loadtest
- Prometheus scrapes every `/actuator/prometheus` every 15s (gateway over HTTPS, skip-verify for dev cert).
  Grafana ships a catalog cache-hit dashboard. k6 scripts: `browse.js` (cache path), `journey.js` (full guest
  journey through the edge), `ratelimit.js` (asserts 429s past the limit).

---

## 6. Checkout saga — end-to-end

1. `POST /api/orders/checkout` + `Idempotency-Key` → in **one DB tx**, write Order (PENDING) + outbox event → **202**.
2. Outbox poller picks it up → **reserve inventory** (row-locked hold) → **charge payment**.
3. Payment success → **commit** the hold → order **CONFIRMED**. Payment decline / out-of-stock → **release** → order **FAILED**.
4. Client polls `GET /api/orders/{id}` until PENDING flips.

**Guarantees:** idempotent everywhere (no double-order/charge/hold), no oversell (DB row locks), transient
faults retry, business rejections fail fast + compensate. **Drill:** a cart total ending in **`.66`** forces
a decline so you can watch the release path.

---

## 7. Auth & RBAC model
- **Guest by default** — the storefront mints a guest token silently; there is **no login UI**.
- The gateway **validates the JWT once** and injects `X-User-*`; downstream services trust those headers.
- **RBAC:** at OAuth login, emails in `ADMIN_EMAILS` get the **ADMIN** role; admin routes
  (`/api/catalog/admin/**`, `/api/inventory/admin/**`) are gated at the edge **and** re-checked in-service.
- **Public paths** (no token): `/auth/guest`, `/api/catalog/products`, `/api/catalog/notify`, `/actuator/**`,
  `/oauth2/**`, `/login/**`, + the SPA. Everything else → 401 without a valid Bearer token.

---

## 8. Frontend (storefront)
React 18 + Vite + TS SPA in `frontend/`. **No router** — product-detail / cart / profile are state-driven
overlays in `src/App.tsx`. All API calls go through `src/api.ts` (lazy guest token, DTO→type mapping), which
the Vite dev server proxies (`/api`,`/auth`) to the gateway `https://localhost:8443`. Styling is one
`src/index.css` with CSS-variable design tokens — the **"Warm Luxe Gold"** brand (deep gold `#b8860b` +
espresso text on warm cream), Inter body + Fraunces display. The storefront scopes the catalog to brand
items (**honey + fruit only**, client-side) and browses via a luxury left **filter sidebar** + a
forward-looking **collection taxonomy** (empty collections show "Coming soon"). **Full UI details, design
tokens, and the iteration history (0–9) live in `frontend/CLAUDE.md`** — read that before any storefront change.
Hard rule there: **never touch `api.ts` / `types.ts` / component props** (UI work is CSS + markup only).

---

## 9. Repo layout
```
quick-ecommerce/
├─ gateway/            # Spring Cloud Gateway edge (filters, routes, resilience, TLS)
├─ auth-service/       # JWT + OAuth2 + RBAC               (authdb)
├─ catalog-service/    # products, search, recs, cache, images (catalogdb + Redis + MinIO + OpenSearch)
├─ cart-service/       # Redis-only cart
├─ inventory-service/  # stock + reservations              (inventorydb)
├─ payment-service/    # PaymentProvider + mock            (paymentdb)
├─ order-service/      # checkout + outbox saga            (orderdb)
├─ frontend/           # React/Vite storefront  (see frontend/CLAUDE.md)
├─ admin-app/          # nginx basic-auth admin console (loopback)
├─ observability/      # prometheus.yml + grafana provisioning/dashboards
├─ scripts/            # gen-secrets.sh, fullstack-smoke.sh, saga-smoke.sh, security-scan.sh, init-multiple-dbs.sh
├─ loadtest/           # k6: browse.js, journey.js, ratelimit.js
├─ backend/            # retired in-memory monolith (reference only)
└─ docker-compose.yml  # the source of truth for services/ports/env
```

---

## 10. Run & verify
```bash
./scripts/gen-secrets.sh            # one-time: writes a gitignored .env (fail-closed without it)
docker compose up -d --build        # 15 containers
curl -k https://localhost:8443/actuator/health      # {"status":"UP"}
bash scripts/fullstack-smoke.sh     # 33 assertions, expect "33 passed, 0 failed"
```
Storefront, two ways: containerized same-origin at `https://localhost:8443/`, or dev hot-reload:
```bash
cd frontend && cp .env.example .env.local   # leave VITE_API_BASE empty
npm install && npm run dev                   # http://localhost:5173 (proxies to the gateway)
```
> **Port gotcha:** the Vite proxy targets `https://localhost:8443`. If you override `GATEWAY_PORT` in `.env`,
> the storefront will 500 (proxy can't reach the gateway) until the two match.

---

## 11. Conventions & constraints
- **Flyway-only schema** (`ddl-auto: validate`) — schema changes go through `V<n>__*.sql`, never auto-DDL.
- **Fail-closed secrets** — compose references every secret as `${VAR:?}`; `.env` (from `gen-secrets.sh`) is required and gitignored.
- **DB-per-service** — no cross-service joins; reach other services over REST (or, for order events, the saga).
- **Test through the gateway** — that's the real contract; commerce services aren't host-published.
- **Frontend** — CSS + markup only; never change `api.ts` / `types.ts` / props.

---

## 12. Known limitations
- **Mock payments only** (real Razorpay/Stripe is a later swap behind `PaymentProvider`).
- **Dev self-signed TLS, no cloud deploy** (needs CA cert + domain + hosting).
- **Commerce-service automated tests pending** (only auth-service has unit tests; smoke scripts are the gate).
- **Search/recs are eventually consistent** — OpenSearch is a secondary index; a product deleted while
  OpenSearch is down can leave a "ghost" doc until the index is rebuilt.
- **DS-0031 open** — `TLS_KEYSTORE_PASSWORD` passed via a gateway Dockerfile build-ARG; supply at runtime
  from a secret manager in prod.

---

## 13. Pointers (deeper docs)
- **`README.md`** — full product + ops guide (quick start, API reference, QA, seed data, troubleshooting).
- **`frontend/CLAUDE.md`** — storefront UI: design tokens, component map, iteration history, UI rules.
- **`docker-compose.yml`** — authoritative service/port/env wiring.
- **`PRODUCT-REPORT.md`** — product framing.
