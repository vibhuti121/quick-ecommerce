# quick-ecommerce

A production-shaped **microservices commerce platform**: a resilient API gateway + auth edge (reused
from the FamilyCall project) in front of five commerce services, all persistent, all containerized.
One `docker compose up` brings up the whole stack; the full shopping journey works through the
gateway and **survives a restart**.

> Sells **anything** — `product_type` ∈ {physical, digital, service, subscription, rental} with a
> JSONB `attributes` column, so adding a new kind of product needs no schema change.

---

## 👋 New here? Start in 5 minutes

You do **not** need to install Java, Maven, Node, Postgres, or Redis. You need **Docker** and one
command. This gets the entire backend running on your laptop:

```bash
# 1. Check Docker is installed and running (should print a version, no error)
docker --version
docker compose version

# 2. Clone and enter the repo
git clone https://github.com/vibhuti121/quick-ecommerce.git
cd quick-ecommerce

# 3. Build + start the whole stack (first run pulls images & builds — a few minutes)
docker compose up -d --build

# 4. Wait ~20s, then confirm the edge is healthy
curl http://localhost:8080/actuator/health        # → {"status":"UP",...}

# 5. Prove the whole thing works end-to-end (expect: 16 passed, 0 failed)
bash scripts/fullstack-smoke.sh
```

If step 4 returns `{"status":"UP"}` and step 5 says **16 passed, 0 failed**, your environment is
correct and you can start working. See [Verify your setup](#verify-your-setup) for a checklist.

> **Port 8080 already in use?** (common if you run other apps.) Pick any free port and use it
> consistently — prefix **every** command with it:
> ```bash
> GATEWAY_PORT=8088 docker compose up -d --build
> curl http://localhost:8088/actuator/health
> GATEWAY_PORT=8088 bash scripts/fullstack-smoke.sh
> ```
> The rest of this README uses `8080`; swap in your port if you changed it.

**Don't have Docker yet?** Install **Docker Desktop** (Mac/Windows) or **Docker Engine + Compose**
(Linux) from docker.com, start it, then re-run the steps above.

---

## Table of contents
- [New here? Start in 5 minutes](#-new-here-start-in-5-minutes)
- [Architecture](#architecture)
- [Services & ports](#services--ports)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start-run-the-whole-stack)
- [Verify your setup](#verify-your-setup)
- [Configuration](#configuration)
- [Auth model (read this before testing)](#auth-model-read-this-before-testing)
- [API reference](#api-reference)
- [Seed data](#seed-data)
- [Developer workflow](#developer-workflow)
- [QA guide](#qa-guide)
- [Troubleshooting](#troubleshooting)
- [Known limitations / out of scope](#known-limitations--out-of-scope)
- [Roadmap](#roadmap)

---

## Architecture

```
                         ┌──────────────────────────────────────────────┐
  Browser (React/Vite)   │                  GATEWAY  :8080               │
        :5173  ─────────▶│  Spring Cloud Gateway + Resilience4j          │
                         │  (circuit breaker · retry · bulkhead · CORS)  │
                         │  AuthFilter: validates JWT once → injects      │
                         │  X-User-Id / X-User-Email / X-User-Display-Name│
                         └───┬───────┬───────┬───────┬───────┬───────┬───┘
                             │       │       │       │       │       │
                      /auth  │/catalog│ /cart │/inventory│/payments│/orders
                             ▼       ▼       ▼       ▼       ▼       ▼
                          auth   catalog   cart  inventory payment  order
                          :8081   :8090   :8091   :8092    :8093    :8094
                             │       │       │       │       │       │
                          authdb  catalogdb Redis inventorydb paymentdb orderdb
                             └───────┴───────┬───────┴───────┴───────┘
                                   Postgres 16  +  Redis 7   (named volumes)
```

- **Each service owns its own schema** — no cross-service DB joins. Synchronous reads go service→service
  over REST; **order events flow asynchronously** via a transactional **outbox → poller saga**
  (order → inventory → payment → order).
- **Downstream services trust the gateway.** Only the gateway validates the JWT; commerce services
  read identity from the injected `X-User-Id` header and never re-validate the token.

---

## Services & ports

| Service | Internal port | Backing store | Responsibility |
|---|---|---|---|
| **gateway** | 8080 (published) | — | Edge: routing, auth, circuit breakers, retries, CORS |
| **auth-service** | 8081 | `authdb` | Guest JWT + Google OAuth2; `/auth/validate` for the gateway |
| **catalog-service** | 8090 | `catalogdb` | Products + variants + JSONB attributes; admin CRUD + public browse |
| **cart-service** | 8091 | Redis | Per-user cart keyed on `X-User-Id`; snapshots price/name/image at add-time |
| **inventory-service** | 8092 | `inventorydb` | Stock, holds/reservations; commit/release in the saga |
| **payment-service** | 8093 | `paymentdb` | `PaymentProvider` interface + `MockPaymentProvider` |
| **order-service** | 8094 | `orderdb` | Orders + outbox saga + idempotent checkout |
| postgres | 5432 | volume `pgdata` | One DB per service (created on first boot) |
| redis | 6379 | volume `redisdata` | Cart storage |

> **Only the gateway is published to the host.** Everything else is reachable **through** it — that's
> the contract you test against. (`backend/` is the retired in-memory monolith, kept for reference only.)

---

## Prerequisites

- **Docker** + **Docker Compose v2** — the only requirement to run the full stack (services build in
  multi-stage images; you do **not** need Java/Maven on the host).
- **Node 18+** — only if you want to run the **frontend dev server** with hot-reload.
- Free host ports: **8080** (gateway; override with `GATEWAY_PORT` if taken), 5173 (frontend dev).

---

## Quick start (run the whole stack)

```bash
git clone https://github.com/vibhuti121/quick-ecommerce.git
cd quick-ecommerce

docker compose up -d --build                   # gateway published on host port 8080

# Wait until healthy, then:
curl http://localhost:8080/actuator/health     # {"status":"UP",...}
```

The stack comes up **pre-seeded** (5 products + their stock — see [Seed data](#seed-data)), so you can
shop immediately with no admin setup.

> **8080 busy?** Run everything with a free port instead, e.g. `GATEWAY_PORT=8088 docker compose up -d --build`
> and use `:8088` in the commands below.

**Smoke the whole journey in one command:**
```bash
bash scripts/fullstack-smoke.sh                # expect: 16 passed, 0 failed
```

**Frontend (optional, hot-reload):**
```bash
cd frontend
cp .env.example .env.local            # VITE_API_BASE — edit if your gateway isn't on 8088
npm install && npm run dev            # http://localhost:5173
```

**Tear down:**
```bash
docker compose down                   # keep data (named volumes survive)
docker compose down -v                # wipe data too (fresh DBs + re-seed next boot)
```

### Verify your setup
Tick all of these and your environment is good to go:

- [ ] `docker compose ps` shows **9 containers** (`gateway`, `auth-service`, `catalog-service`,
      `cart-service`, `inventory-service`, `payment-service`, `order-service`, `postgres`, `redis`) — all `running`.
- [ ] `curl http://localhost:8080/actuator/health` → `{"status":"UP"}`.
- [ ] `curl http://localhost:8080/api/catalog/products` → JSON with **5 seeded products**.
- [ ] `bash scripts/fullstack-smoke.sh` → **16 passed, 0 failed**.
- [ ] (frontend, if used) http://localhost:5173 shows the product grid.

If any fail, see [Troubleshooting](#troubleshooting).

---

## Configuration

All config is 12-factor env vars with safe local defaults in `docker-compose.yml`, so the stack runs
with **no `.env` at all**. Copy `.env.example` → `.env` to override. Key knobs:

| Variable | Default | Notes |
|---|---|---|
| `GATEWAY_PORT` | `8080` | Host port for the gateway. **Use `8088` on dev machines.** |
| `DB_PASSWORD` | `postgres` | Shared Postgres password (dev). Use a secret manager in cloud. |
| `JWT_SECRET` | `varsha-dev-jwt-secret-min-256-bits-change-me` | **Must be ≥ 32 bytes** (HS256 = 256-bit) or jjwt rejects it. |
| `PAYMENT_PROVIDER` | `mock` | Mock approves everything **except amounts ending in `.66`** (decline hook). |
| `OUTBOX_POLL_INTERVAL_MS` | `2000` | How often the order saga drains its outbox. |
| `ALLOWED_ORIGIN` | `http://localhost:5173` | CORS origin allowed at the gateway. |
| `GOOGLE_CLIENT_ID` / `_SECRET` | dummy | Real values enable Google login; guest tokens cover the full journey without them. |

Frontend (`frontend/.env.example`): `VITE_API_BASE` — gateway URL for local dev (`http://localhost:8088`).
Empty in production (frontend is served same-origin behind Caddy).

---

## Auth model (read this before testing)

1. **Get a guest token** — no Google login needed:
   ```bash
   curl -s -X POST http://localhost:8088/auth/guest \
     -H 'Content-Type: application/json' -d '{"name":"QA Tester"}'
   # → {"token":"eyJ...","userId":"guest-...","displayName":"QA Tester"}
   ```
2. **Send it on every protected call:** `Authorization: Bearer <token>`.
3. The gateway validates the token **once** and injects `X-User-Id` downstream. Your cart and orders
   are scoped to that token's user — reuse the same token to keep the same cart.

**Public paths** (no token): `/auth/guest`, `/api/catalog/products` (browse), `/actuator/**`,
`/oauth2/**`, `/login/**`. Everything else returns **401** without a valid Bearer token.

---

## API reference

Base URL = the gateway, e.g. `http://localhost:8088`. 🔓 = public, 🔒 = requires Bearer token.

### Auth — `/auth/**`
| Method | Path | Body | Notes |
|---|---|---|---|
| 🔓 POST | `/auth/guest` | `{ "name": "..." }` | Returns `{ token, userId, displayName }` |
| 🔒 GET | `/auth/me` | — | Current user from token |
| 🔓 GET | `/oauth2/authorization/google` | — | Start Google login (optional) |

### Catalog — `/api/catalog/**`
| Method | Path | Body / Query | Notes |
|---|---|---|---|
| 🔓 GET | `/api/catalog/products` | `?category=&type=&page=&size=` | **Paginated `Page` object** (`{content:[...]}`), default size 20 |
| 🔓 GET | `/api/catalog/products/{id}` | — | Single product |
| 🔒 POST | `/api/catalog/admin/products` | `ProductRequest` | Create (admin) |
| 🔒 PUT | `/api/catalog/admin/products/{id}` | `ProductRequest` | Update |
| 🔒 DELETE | `/api/catalog/admin/products/{id}` | — | Delete |

`ProductRequest` = `{ sku, name, description?, productType, category?, basePrice, currency, imageUrl?, attributes? }`

### Cart — `/api/cart/**` (🔒, scoped to `X-User-Id`)
| Method | Path | Body | Notes |
|---|---|---|---|
| 🔒 GET | `/api/cart` | — | `{ userId, items:{<productId>:line}, itemCount, total }` |
| 🔒 POST | `/api/cart/items` | `{ productId, quantity }` | **`quantity` is a signed delta** (+1 add, −1 decrement; line ≤0 removed) |
| 🔒 DELETE | `/api/cart/items/{productId}` | — | Remove a line |
| 🔒 DELETE | `/api/cart` | — | Clear cart |

### Inventory — `/api/inventory/**` (🔒)
| Method | Path | Body | Notes |
|---|---|---|---|
| 🔒 GET | `/api/inventory/stock/{sku}` | — | `{ sku, availableQty, ... }` |
| 🔒 POST | `/api/inventory/admin/stock` | `{ sku, quantity }` | Seed/adjust stock (admin) |
| 🔒 POST | `/api/inventory/reservations` *(saga-internal)* | — | Hold stock for an order |
| 🔒 POST | `/api/inventory/reservations/{orderId}/commit` *(saga)* | — | Confirm hold |
| 🔒 POST | `/api/inventory/reservations/{orderId}/release` *(saga)* | — | Release on failure |

### Payment — `/api/payments/**` (🔒)
| Method | Path | Body | Notes |
|---|---|---|---|
| 🔒 POST | `/api/payments/charge` *(saga-internal)* | — | Charge via provider |
| 🔒 GET | `/api/payments/{orderId}` | — | `{ status: SUCCESS|FAILED, ... }` |

### Orders — `/api/orders/**` (🔒)
| Method | Path | Headers / Body | Notes |
|---|---|---|---|
| 🔒 POST | `/api/orders/checkout` | **`Idempotency-Key` header (required)** + `CheckoutRequest` | Returns **202** with order in `PENDING`; saga confirms async |
| 🔒 GET | `/api/orders/{orderId}` | — | Poll `status`: PENDING → CONFIRMED \| FAILED |
| 🔒 GET | `/api/orders` | — | Current user's orders |

`CheckoutRequest` = `{ currency, items:[{ productId, sku, name, unitPrice, quantity }] }`

---

## Seed data

On a **fresh** volume, Flyway seeds the catalog and matching stock — one product per `product_type`:

| SKU | Type | Price (INR) | Seeded stock |
|---|---|---|---|
| `PHY-TSHIRT-001` | PHYSICAL | 499.00 | yes |
| `DIG-EBOOK-001` | DIGITAL | 799.00 | yes |
| `SVC-CLEAN-001` | SERVICE | 1999.00 | yes |
| `SUB-STREAM-001` | SUBSCRIPTION | 299.00 | yes |
| `RENT-DRILL-001` | RENTAL | 149.00 | yes |

Seeds are **idempotent** (skip if the SKU exists) and only run on a fresh DB. `docker compose down -v`
wipes volumes and re-seeds on next boot.

---

## Developer workflow

- **Project layout:** one folder per service (`auth-service/`, `catalog-service/`, `cart-service/`,
  `inventory-service/`, `payment-service/`, `order-service/`, `gateway/`), each a standalone Spring
  Boot Maven module (Java 21, virtual threads, Flyway, HikariCP, actuator). `frontend/` is React+Vite.
- **Stack:** Spring Boot 3.2.x, Java 21, groupId `com.varsha`, package `com.varsha.<service>`.
- **Rebuild one service after a change:**
  ```bash
  GATEWAY_PORT=8088 docker compose up -d --build catalog-service
  ```
- **Tail logs:** `docker compose logs -f order-service`
- **New DB migration:** add `V<n>__desc.sql` under `<service>/src/main/resources/db/migration/`
  (`ddl-auto: validate` — schema changes happen **only** through Flyway, never auto-DDL).
- **Adding a route to the edge:** add a route block + matching `resilience4j` instance in
  `gateway/src/main/resources/application.yml`; add public paths to `AuthFilter.PUBLIC_PATHS`.
- **Frontend → gateway:** all calls go through `frontend/src/api.ts` (lazy guest token, mapping layer).
  Keep `types.ts` stable; the adapter maps backend DTOs to it.

---

## QA guide

### 0. Test environment
Run the stack as in [Quick start](#quick-start-run-the-whole-stack). Test **only through the gateway**
(`http://localhost:8088`) — that's the real contract. The stack is pre-seeded, so no setup needed.

### 1. Automated smoke tests
| Script | Proves | Run |
|---|---|---|
| `scripts/fullstack-smoke.sh` | 16 assertions: edge health, guest auth, 401 on anon, admin seed, public browse, cart snapshot, **checkout saga → CONFIRMED + payment SUCCESS + stock decrement**, **idempotent replay**, **restart-survives-data** | `GATEWAY_PORT=8088 bash scripts/fullstack-smoke.sh` |
| `scripts/saga-smoke.sh` | The order saga happy path in isolation | `GATEWAY_PORT=8088 bash scripts/saga-smoke.sh` |

Both are **re-runnable** (unique SKU + idempotency key per run). Expected: `16 passed, 0 failed`.

### 2. Key acceptance scenarios (manual / exploratory)

**Happy path (full journey):**
1. `POST /auth/guest` → grab token.
2. `GET /api/catalog/products` → see 5 seeded products.
3. `POST /api/cart/items {productId, quantity:2}` → line appears, price snapshotted.
4. `POST /api/orders/checkout` with an `Idempotency-Key` → **202**, order `PENDING`.
5. Poll `GET /api/orders/{id}` → flips to **CONFIRMED** within a few seconds.
6. `GET /api/payments/{id}` → **SUCCESS**; `GET /api/inventory/stock/{sku}` → decremented.

**Payment failure path (built-in hook):** check out a cart whose **total ends in `.66`**
(e.g. one unit of a 100.66 item) → payment **declines** → inventory **released** → order **FAILED**.
This is the deterministic way to exercise the saga's compensation path. Seed a `.66` product via
`POST /api/catalog/admin/products` + stock, then check out.

**Idempotency:** repeat the **same** checkout with the **same** `Idempotency-Key` → you get the **same
`orderId`** and **no second charge / no extra stock decrement**. Change the key → a new order.

**Auth enforcement:** any `/api/cart`, `/api/orders`, `/api/inventory`, `/api/payments` call **without**
a token → **401**. Catalog browse works without a token.

**Persistence:** place an order, then `docker compose down` (keep volumes) → `up` → the order is still
`CONFIRMED`, the product still listed, the stock level unchanged. (`down -v` wipes and re-seeds.)

**Resilience drill:** `docker compose stop payment-service`, attempt checkout → the gateway circuit
breaker returns a fallback (503) rather than hanging; the order does not get stuck mid-saga.
`docker compose start payment-service` → recovers.

### 3. Unit / integration tests
Currently **auth-service** ships JUnit tests (controller + JwtService). Run inside a build container:
```bash
docker run --rm -v "$PWD/auth-service":/app -w /app maven:3.9-eclipse-temurin-21 mvn test
```
> ⚠️ **Coverage gap (be aware):** the commerce services (catalog/cart/inventory/payment/order) do
> **not** yet have unit/integration tests — they're verified by the smoke scripts above. Adding
> Testcontainers-based tests per service is planned (Phase 2). Treat the smoke scripts as the current
> regression gate.

### 4. What to file in a bug report
Service name + endpoint, the **token's `userId`**, the `orderId` / `Idempotency-Key` / `sku`, the
request/response bodies, and `docker compose logs <service>` around the timestamp.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Gateway won't bind / port in use | Host 8080 taken by a legacy app → use `GATEWAY_PORT=8088`. |
| `/auth/guest` returns 401 | `JWT_SECRET` shorter than 32 bytes → jjwt `WeakKeyException`. Use the default or a ≥32-byte value. |
| Cart add returns 503 | cart-service can't reach catalog → ensure `CATALOG_SERVICE_URL=http://catalog-service:8090` (set in compose). |
| Calls fail right after `up` | Gateway reports UP before downstream services finish booting. Wait ~10–20s / poll the actual endpoint. |
| Frontend CORS errors | `ALLOWED_ORIGIN` must match the frontend origin (default `http://localhost:5173`). |
| Checkout 400 "Missing Idempotency-Key" | Every checkout **must** send an `Idempotency-Key` header. |
| No products after `up` | You ran on an existing volume that was seeded before seeds existed — `docker compose down -v` then `up`. |

---

## Known limitations / out of scope
- **Mock payments only** — real Razorpay/Stripe (KYC/PCI) is a later swap behind `PaymentProvider`.
- **No admin role enforcement yet** — any authenticated user can hit `/admin/**` (role/tier is planned).
- **"Sell anything"** = flexible schema + generic checkout, **not** per-category logistics/tax/compliance.
- Commerce-service automated test coverage is pending (see QA §3).
- Live social commerce + AI assistant are **not built yet** (see Roadmap).

---

## Roadmap
- **Phase 1 — DONE:** persistent, resilient microservices foundation (this README).
- **Phase 2:** Redis catalog caching, object storage for media, Prometheus metrics, k6 load test,
  per-service Testcontainers tests.
- **Phase 3:** **Live social commerce** — reuse the FamilyCall WebRTC stack (signaling-service, coturn,
  `useWebRTC`) for shoppable livestreams.
- **Phase 4:** **AI shopping assistant** — Claude API: conversational discovery + semantic search.
- **Phase 5:** Cloud deploy (same images, env-only changes; Caddy auto-TLS).
