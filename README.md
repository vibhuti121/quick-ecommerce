# quick-ecommerce

A production-shaped **microservices commerce platform**: a resilient, TLS-terminating API gateway +
auth edge (reused from the FamilyCall project) in front of seven commerce services — including
**self-serve auth** (email/phone + password and phone-OTP) and a **gated WebRTC video-call** pillar
(signaling-service + coturn) — with a Prometheus + Grafana observability layer. All persistent, all
containerized. One `docker compose up` brings up the whole stack (18 containers); the full shopping
journey works through the gateway and **survives a restart**.

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

# 3. Generate secrets — writes a gitignored .env with strong random values (required, one-time)
./scripts/gen-secrets.sh

# 4. Build + start the whole stack (first run pulls images & builds — a few minutes)
docker compose up -d --build

# 5. Wait ~20s, then confirm the edge is healthy (HTTPS edge, dev self-signed cert → -k)
curl -k https://localhost:8443/actuator/health     # → {"status":"UP",...}

# 6. Prove the whole thing works end-to-end (expect: 57 passed, 0 failed)
bash scripts/fullstack-smoke.sh
```

If step 5 returns `{"status":"UP"}` and step 6 says **57 passed, 0 failed**, your environment is
correct and you can start working. See [Verify your setup](#verify-your-setup) for a checklist.

> **Want to *learn how to use* the app, not just run it?** Follow the hands-on, click-by-click
> [User Guide](docs/USER-GUIDE.md) — it walks the full customer journey (browse → search → cart → COD
> checkout → track), the admin console, video calling, and the dashboards, each shown both in the UI and
> as `curl`. This README is the reference; the guide is the tour.

> **Skipped step 3?** The stack is fail-closed — `docker compose up` will stop immediately with
> `error while interpolating ... JWT_SECRET ... missing - run ./scripts/gen-secrets.sh`. That's by
> design: no usable secret is committed to the repo. Run the generator once and retry.

> **The edge is HTTPS** (TLS terminates at the gateway — Phase 3, Pillar 4). It serves a **dev
> self-signed cert**, so every `curl` needs `-k` (and the Vite dev proxy uses `secure: false`).
> Inter-service traffic stays plain HTTP on the docker network — only the public edge is encrypted.
> A real deployment mounts a CA-signed keystore over `/app/keystore.p12` and sets `TLS_KEYSTORE_PASSWORD`.

> **Port 8443 already in use?** (common if you run other apps.) Pick any free port and use it
> consistently — prefix **every** command with it:
> ```bash
> GATEWAY_PORT=9443 docker compose up -d --build
> curl -k https://localhost:9443/actuator/health
> GATEWAY_PORT=9443 bash scripts/fullstack-smoke.sh
> ```
> The rest of this README uses `8443`; swap in your port if you changed it.

**Don't have Docker yet?** Install **Docker Desktop** (Mac/Windows) or **Docker Engine + Compose**
(Linux) from docker.com, start it, then re-run the steps above.

---

## Table of contents
- [New here? Start in 5 minutes](#-new-here-start-in-5-minutes)
- [📖 User Guide — how to use the app (hands-on walkthrough)](docs/USER-GUIDE.md)
- [Architecture](#architecture)
- [Services & ports](#services--ports)
- [Admin console](#admin-console)
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
- [Production readiness](#production-readiness--what-it-takes-to-go-live)
- [Roadmap](#roadmap)

---

## Architecture

```
                         ┌──────────────────────────────────────────────┐
  Browser (React/Vite)   │            GATEWAY  :8443 (HTTPS/TLS)         │
        :5173  ══HTTPS══▶│  Spring Cloud Gateway + Resilience4j          │
                         │  TLS edge · rate-limit · circuit breaker ·    │
                         │  retry · CORS · security headers · corr-id    │
                         │  AuthFilter: validates JWT once → injects      │
                         │  X-User-Id / -Email / -Display-Name / -Role;   │
                         │  enforces ADMIN on /**/admin/**                │
                         └─┬─────┬─────┬──────┬─────────┬────────┬────────┘
                           │     │     │      │         │        │
                     /auth │/catalog│/cart│/inventory│/payments│/orders
                           ▼     ▼     ▼      ▼         ▼        ▼
                        auth  catalog cart inventory payment  order
                        :8081  :8090  :8091  :8092    :8093    :8094
                           │     │ │ │   │      │         │       │
                        authdb  │ │ │ Redis  inventorydb paymentdb orderdb
                                │ │ └─ Redis (cart)
                                │ └─── Redis (read cache)
                                └───── MinIO (product images, S3)
                           └──────────── Postgres 16 (one DB per service) ──────┘
                                         (all state on named volumes)

  Observability (trace · log · metric, joined by one W3C trace.id):
    METRIC  Prometheus :9090 ──scrapes /actuator/prometheus──▶ all services; SLO rules + exemplars
            Alertmanager :9093 ◀─fires── Prometheus (ServiceDown · error-rate · p99 · payment-fail)
            Grafana :3000 ──reads──▶ Prometheus (Infra · API-SLO · Business + catalog-cache dashboards)
    TRACE   services (OTel/Micrometer) ──OTLP──▶ APM-server :8200 ──▶ Elasticsearch ──▶ Kibana APM
    LOG     stdout JSON ──▶ Filebeat ──▶ Elasticsearch :9200 ──▶ Kibana (PII-masked, hashed user_id)
            └─ same trace.id stamped on every span, log line, and metric exemplar → one-click pivot

  Gated video call (Phase 3):
    /api/videocall ─▶ videocall-service :8095 (videocalldb + Redis cooldown) — mints a short-lived
                      *call grant* (separate secret from the login JWT)
    /socket.io     ─▶ signaling-service :3001 (Node/Socket.IO, no DB) — admits a socket only on a
                      valid grant; coturn :3478 relays media (STUN/TURN)
```

- **Each service owns its own schema** — no cross-service DB joins. Synchronous reads go service→service
  over REST; **order events flow asynchronously** via a transactional **outbox → poller saga**
  (order → inventory → payment → order — see [How checkout works](#how-checkout-works)).
- **Downstream services trust the gateway.** Only the gateway validates the JWT; commerce services
  read identity from the injected `X-User-Id` / `X-User-Role` headers and never re-validate the token.
  Admin routes are gated at the edge **and** re-checked in-service (defense in depth).
- **The edge does the cross-cutting work:** TLS termination, per-IP **rate limiting** (429s),
  per-route **circuit breakers + bulkheads**, **CORS** (origin pinned, credentials off), **security
  headers** (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, …), and a
  **correlation ID** stamped on every request/response and into logs.
- **TLS terminates at the edge.** The gateway listens on **HTTPS :8443**; inter-service traffic stays
  plain HTTP on the docker network (commerce services aren't published to the host). Dev uses a
  self-signed cert baked into the gateway image — use `-k`; prod mounts a CA-signed one.

---

## How checkout works

Checkout is **asynchronous and crash-safe** — an outbox + poller **saga**, not a single blocking call:

1. **`POST /api/orders/checkout`** (with an `Idempotency-Key` header). In **one DB transaction**,
   order-service writes the `Order` (status `PENDING`) **and** an `order_outbox` event, then returns
   **`202 ACCEPTED`** with the `orderId`. Nothing downstream has been touched yet — the order is durable.
2. **The outbox poller** (every `OUTBOX_POLL_INTERVAL_MS`, default 2s) picks up pending events and runs
   the saga, one event at a time:
   - **Reserve inventory** — `POST /inventory/reservations` puts a *hold* on stock (pessimistic row
     locks, sorted by SKU → no deadlocks, no overselling). All-or-nothing across lines.
   - **Charge payment** — `POST /payments/charge` via the configured `PaymentProvider`.
   - **On payment success → commit** the inventory hold → order **`CONFIRMED`**.
   - **On payment decline → release** the hold (stock returns to available) → order **`FAILED`**.
3. **The client polls** `GET /api/orders/{orderId}` until it flips from `PENDING` to `CONFIRMED`/`FAILED`.

**Guarantees baked in:**
- **Idempotent everywhere** — same `Idempotency-Key` → same order (no double-order); reserve/charge/
  commit/release are each idempotent on `orderId` (no double-hold, no double-charge). The whole saga
  step is safe to replay if the poller crashes mid-flight.
- **No oversell** — inventory uses DB row locks; concurrent checkouts can't both grab the last unit.
- **Transient faults retry** — a 5xx/timeout from inventory or payment leaves the event `PENDING` and
  retries (up to `OUTBOX_MAX_ATTEMPTS`, default 5); a business rejection (4xx, e.g. out of stock)
  fails the order immediately and releases any hold.
- **Deterministic failure hook** — with the mock provider, any cart **total ending in `.66`** is
  declined, so you can exercise the compensation (release) path on demand.

---

## Services & ports

| Service | Internal port | Backing store | Responsibility |
|---|---|---|---|
| **gateway** | 8443 (published, **HTTPS**) | — | TLS edge: routing, auth, circuit breakers, retries, CORS |
| **auth-service** | 8081 | `authdb` + Redis (OTP store) | Guest JWT, Google OAuth2, **self-serve login** (email/phone + BCrypt password, phone-OTP); `/auth/validate` for the gateway |
| **catalog-service** | 8090 | `catalogdb` + Redis (cache) + MinIO (images) + OpenSearch (search index) | Products + variants + JSONB attributes; admin CRUD + public browse + full-text search + "Notify me" signups |
| **cart-service** | 8091 | Redis | Per-user cart keyed on `X-User-Id`; snapshots price/name/image at add-time |
| **inventory-service** | 8092 | `inventorydb` | Stock, holds/reservations; commit/release in the saga |
| **payment-service** | 8093 | `paymentdb` | `PaymentProvider` interface + `MockPaymentProvider` |
| **order-service** | 8094 | `orderdb` | Orders + outbox saga + idempotent checkout |
| **videocall-service** | 8095 | `videocalldb` + Redis (5h cooldown) | Gated-call enforcement brain: eligibility gate + mints the short-lived **call grant** (separate secret from the login JWT) |
| **signaling-service** | 3001 | — (no DB) | Node + Socket.IO WebRTC mesh signaling; admits a socket only on a valid grant (fail-closed), max 3 participants/room |
| **coturn** | 3478 (published, udp/tcp) | — | TURN/STUN media relay for the video call (STUN-only locally) |
| **admin-app** | 80 → `127.0.0.1:5174` (**loopback only**) | — | Internal admin SPA (React Router + TanStack); nginx basic-auth + same-origin reverse-proxy to the gateway. See [Admin console](#admin-console). |
| postgres | 5432 | volume `pgdata` | One DB per service (created on first boot) |
| redis | 6379 | volume `redisdata` | Cart store **and** catalog read cache |
| opensearch | 9200 | volume `opensearchdata` | Product full-text search index (secondary; Postgres stays source of truth). **Not published** — internal to catalog-service |
| **minio** | 9000 API / 9001 console (both **published**) | volume `miniodata` | S3-compatible object storage for product images |
| **prometheus** | 9090 (**published**) | volume `promdata` | Scrapes every service's `/actuator/prometheus` (15d retention); SLO/recording rules + exemplar storage |
| **alertmanager** | 9093 (**published**) | volume `alertmanagerdata` | Routes/​dedupes Prometheus SLO alerts (ServiceDown, error-rate, checkout p99, payment-fail); receivers stubbed until go-live |
| **grafana** | 3000 (**published**) | volume `grafanadata` | Dashboards over Prometheus + Elasticsearch: **Infra** (JVM/GC/pool), **API-SLO** (latency/errors + trace exemplars), **Business** (orders/GMV/saga), catalog cache-hit |
| **elasticsearch** | 9200 | volume `esdata` | Store for **logs + traces** (`logs-quickcart` data stream + APM); single-node, capped heap. Not published — internal |
| **kibana** | 5601 (**published**) | — | Logs Discover + **APM waterfall**; the "journey by trace.id / hashed user_id" forensic view |
| **apm-server** | 8200 | — (writes to ES) | Receives OTLP spans from all services → Elasticsearch for the Kibana APM UI |
| **filebeat** | — (no port) | volume `filebeatdata` | Tails container stdout (JSON) → Elasticsearch; ships the ECS-aligned, PII-masked log lines |

> **Published to the host:** the **gateway** (8443), the **observability/admin consoles** —
> Grafana (3000), Prometheus (9090), Alertmanager (9093), Kibana (5601), MinIO (9000/9001) — and
> **coturn** (3478 udp/tcp, the one service that needs host ports for media relay). Elasticsearch,
> APM-server and Filebeat stay internal to the docker network. The seven commerce services (incl. videocall-service and
> signaling-service) are **not** published; reach them **through** the gateway — that's the contract you
> test against. (`backend/` is the retired in-memory monolith, kept for reference only.) The **admin-app**
> binds **loopback only** (`127.0.0.1:5174`) behind nginx basic-auth — never `0.0.0.0`; reach it over an
> SSH tunnel. See [Admin console](#admin-console).

---

## Admin console

A loopback-only internal admin SPA (`admin-app/`) for staff — distinct from the public storefront
(`frontend/`). React Router v6 + Tailwind/shadcn + TanStack Query/Table + Zustand + React Hook Form/Zod
+ Axios; TypeScript strict. Reach it via an SSH tunnel, then `http://localhost:5174`:

```bash
ssh -L 5174:127.0.0.1:5174 <host>   # then open http://localhost:5174 (nginx basic-auth: ADMIN_USER / ADMIN_PASSWORD)
```

**Pages:** `/login` (email + password → `/auth/login`), `/dashboard` (product / orders-today / awaiting-delivery
cards), `/products` (full CRUD over the catalog admin API — list, create, edit, delete, with SKU-conflict
surfacing), `/orders` (list + mark-delivered).

**Login & roles.** Sign in posts `{ identifier, password }` to `/auth/login`; only a **`role=ADMIN`** JWT is
accepted (any other role is rejected client-side). In production an admin token comes from Google OAuth with
an email in `ADMIN_EMAILS`, or from a password account whose email is on that allowlist. The token is held
**in memory** (Zustand) — a refresh clears it and bounces to `/login` (accepted trade-off this round; no
persisted session). A `<RoleGate>` hides actions the role can't use, but it is a **UI affordance only** — the
real boundary is the gateway, which re-verifies the JWT signature + `role=ADMIN` on every `/api/**/admin/**`
call.

**Network posture.** The browser only ever speaks plain HTTP to its own loopback origin; nginx in the
container reverse-proxies `/api/*` + `/auth/*` to the gateway **over TLS, terminated server-side** (and
`/admin/orders` to order-service). This kills both the self-signed-cert prompt and any CORS preflight. Every
request is additionally behind nginx basic-auth.

**Audit trail.** Each admin write emits a structured log event — `admin.product.{created,updated,deleted}`
(catalog-service) and `admin.stock.adjusted` (inventory-service) — carrying `trace.id` + a hashed `user_id`
from the MDC and a PII-free payload (sku/name/price/qty). Queryable in Kibana via the existing LogstashEncoder
pipeline; no new table or API.

---

## Prerequisites

- **Docker** + **Docker Compose v2** — the only requirement to run the full stack (services build in
  multi-stage images; you do **not** need Java/Maven on the host).
- **Node 18+** — only if you want to run the **frontend dev server** with hot-reload.
- Free host ports: **8443** (gateway HTTPS; override with `GATEWAY_PORT` if taken), 5173 (frontend dev),
  the published consoles — **3000** (Grafana), **9090** (Prometheus), **9000/9001** (MinIO API/console) —
  and **3478** udp/tcp (coturn media relay, only needed if you exercise the video-call pillar).
  Each has a `*_PORT` override if it clashes.

---

## Quick start (run the whole stack)

```bash
git clone https://github.com/vibhuti121/quick-ecommerce.git
cd quick-ecommerce

./scripts/gen-secrets.sh                        # one-time: writes a gitignored .env with random secrets

docker compose up -d --build                   # gateway published on host port 8443 (HTTPS)

# Wait until healthy, then (HTTPS edge, dev self-signed cert → -k):
curl -k https://localhost:8443/actuator/health # {"status":"UP",...}
```

The stack comes up **pre-seeded** (5 products + their stock — see [Seed data](#seed-data)), so you can
shop immediately with no admin setup.

> **8443 busy?** Run everything with a free port instead, e.g. `GATEWAY_PORT=9443 docker compose up -d --build`
> and use `:9443` in the commands below.

**Smoke the whole journey in one command:**
```bash
bash scripts/fullstack-smoke.sh                # expect: 57 passed, 0 failed
```

**Storefront — two ways to run it:**

*Containerized, same-origin (the go-live artifact).* `docker compose up` already builds and starts the
`frontend` nginx container; the gateway serves it on its own TLS edge via a catch-all route, so the SPA
and the API share one origin (no CORS):
```bash
open https://localhost:8443/           # the storefront, served through the gateway (-k / "proceed" for the dev cert)
```

*Vite dev server (optional, hot-reload) for fast local iteration:*
```bash
cd frontend
cp .env.example .env.local            # leave VITE_API_BASE empty — Vite proxies to the HTTPS gateway
npm install && npm run dev            # http://localhost:5173
```
Both leave `VITE_API_BASE` **empty**: the container is same-origin behind the gateway, and the dev server
proxies `/api`,`/auth` to the HTTPS gateway.

**Storytelling homepage (Gen-Z redesign).** The storefront opens as a brand story, not a bare grid:
a cinematic **`Hero`** (kinetic litchi→honey headline + parallax), a **`TrustBand`**
(GI-Tagged · Lab-Tested · Farmer-Direct, sourced from the provenance data), the redesigned product
grid (3D-tilt cards, layout-animated reflow on search/filter), a scroll-linked **`HoneyTeaser`** —
honey's *"coming soon"* hook, always showing the real jar image and capturing the launch list — and a
curated **`SocialProof`** band.

**Catalogue v2 (data-driven discovery).** The grid is no longer a flat list with a bare search box —
it surfaces, **client-side over the existing endpoints (no backend change)**, the provenance/variant
data the catalog already serves. A sticky **`CatalogControls`** toolbar (below the header) carries
**category pills**, an **inline live filter** (replaces the old header search box — typed text filters
the grid by name/description/origin/category in real time), a **sort** (newest · price ↑/↓), and a
**faceted filter** panel (GI-tagged-only · lab-tested-only · price ceiling) with a live "Showing N of
M" count. Product cards are now **editorial-provenance** cards — a GI ✓ / Lab-tested ✓ trust strip,
the origin, "Farmed by …", and an "N grades available" hint (honey's card is exempt and stays the
teaser). The product-detail drawer gains **image zoom** (click-to-lightbox, Esc/click to close), a
**quick-add** quantity stepper, and an **indicative** grade picker (a variant is never a cart-line key
— add always ships the standard pack at the base price × quantity). A home **"Recommended for you"**
row, seeded by the last-viewed SKU (localStorage), hangs off the public recommendations endpoint. The
inline filter is a client-side substring match; the OpenSearch `/products/search` call is retained in
`api.ts` for a future server-backed upgrade. Built on a warm cream + honey/litchi palette with self-hosted
**Poppins/Inter** (`@fontsource`, no runtime CDN) and the **`motion`** library for scroll reveals,
kinetic type, and the honey scrollytelling. Every animation collapses under
`prefers-reduced-motion`; tilt/parallax are disabled on touch. Honey is **never buyable** — the card,
the `ComingSoonModal`, and the teaser all route to one `saveNotify('honey')` + `POST /api/catalog/notify`
launch list. Frontend changes aren't verified by `npm run build`
alone — rebuild the `frontend` container and grep the served bundle (`docker compose exec -T frontend
grep -ro "honey-teaser" /usr/share/nginx/html/assets`).

**Tear down:**
```bash
docker compose down                   # keep data (named volumes survive)
docker compose down -v                # wipe data too (fresh DBs + re-seed next boot)
```

### Verify your setup
Tick all of these and your environment is good to go:

- [ ] `docker compose ps` shows **18 containers** (`gateway`, `auth-service`, `catalog-service`,
      `cart-service`, `inventory-service`, `payment-service`, `order-service`, `videocall-service`,
      `signaling-service`, `coturn`, `frontend`, `admin-app`, `postgres`, `redis`, `minio`,
      `opensearch`, `prometheus`, `grafana`) — all `running`.
- [ ] `curl -k https://localhost:8443/actuator/health` → `{"status":"UP"}`.
- [ ] `curl -k https://localhost:8443/` → the storefront HTML (`<div id="root">`), served same-origin.
- [ ] `curl -k https://localhost:8443/api/catalog/products` → JSON with **11 seeded products** (5 demo + 6 MaLLADE).
- [ ] `bash scripts/fullstack-smoke.sh` → **57 passed, 0 failed**.
- [ ] http://localhost:3000 opens **Grafana** (log in `admin` / `GRAFANA_PASSWORD`); http://localhost:9090 opens **Prometheus**.
- [ ] http://localhost:5173 (Vite dev, optional) shows the product grid.

If any fail, see [Troubleshooting](#troubleshooting).

---

## Configuration

Config is 12-factor env vars. **Secrets** (below the line) have **no default anywhere** — the stack is
fail-closed: `docker compose` references them as `${VAR:?...}` and refuses to start until a `.env`
supplies them. Generate that `.env` once with `./scripts/gen-secrets.sh` (it writes strong random
values; the file is gitignored — never commit it; re-run with `--force` to rotate). **Non-secret knobs**
keep safe defaults in `docker-compose.yml`, so you only set them to override.

Secrets (required — provided by `gen-secrets.sh`, no source default):

| Variable | Notes |
|---|---|
| `DB_PASSWORD` | Shared Postgres password. Use a secret manager in cloud. |
| `JWT_SECRET` | JWT signing key. **Must be ≥ 32 bytes** (HS256 = 256-bit) or jjwt rejects it. Rotating invalidates all tokens. |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO object-storage root credentials. |
| `GRAFANA_PASSWORD` | Grafana admin password (user is `GRAFANA_USER`, default `admin`). |
| `TLS_KEYSTORE_PASSWORD` | Password for the gateway's dev self-signed TLS keystore (Pillar 4). Used at image build **and** runtime — keep one value. Defaults to `changeit` if unset. Prod: mount a CA-signed keystore + set this. |
| `VIDEOCALL_GRANT_SECRET` | Signs the short-lived **call grant** for the video-call pillar. **Distinct from `JWT_SECRET`** — shared only between videocall-service (mints) and signaling-service (verifies); fail-closed if absent at boot. |
| `TURN_SECRET` | Shared secret for coturn's TURN long-term credential mechanism (media relay auth). |

Non-secret knobs (safe defaults in `docker-compose.yml`):

| Variable | Default | Notes |
|---|---|---|
| `GATEWAY_PORT` | `8443` | Host port for the gateway (**HTTPS**). Override if `8443` is taken. |
| `GRAFANA_PORT` / `PROMETHEUS_PORT` | `3000` / `9090` | Host ports for the Grafana and Prometheus consoles. |
| `MINIO_API_PORT` / `MINIO_CONSOLE_PORT` | `9000` / `9001` | Host ports for the MinIO S3 API and web console. |
| `GRAFANA_USER` | `admin` | Grafana admin username (password is the `GRAFANA_PASSWORD` secret). |
| `ADMIN_EMAILS` | _(empty)_ | Comma-separated allowlist of emails granted the **ADMIN** role at login (RBAC — see [Auth model](#auth-model-read-this-before-testing)). Empty → no admins. |
| `MINIO_BUCKET` / `MINIO_PUBLIC_URL` | `product-images` / `http://localhost:9000` | Bucket for catalog images and the base URL used to build public image links. |
| `PAYMENT_PROVIDER` | `mock` | Mock approves everything **except amounts ending in `.66`** (decline hook). |
| `OUTBOX_POLL_INTERVAL_MS` | `2000` | How often the order saga drains its outbox. |
| `ALLOWED_ORIGIN` | `http://localhost:5173` | CORS origin allowed at the gateway (credentials off; headers pinned to `Authorization,Content-Type,Idempotency-Key`). |
| `RATE_LIMIT_TRUST_FORWARDED_FOR` | `false` | Key the per-client rate limit on `X-Forwarded-For` instead of the TCP peer. Leave **false** — the gateway is the exposed edge; only `true` behind a trusted proxy/LB (or to run the journey load test). |
| `SEARCH_ENABLED` | `true` | Master switch for OpenSearch product search in catalog-service. `false` leaves the OpenSearch client bean absent and every `/products/search` call degrades to the Postgres `ILIKE` fallback. |
| `OPENSEARCH_HOST` / `OPENSEARCH_PORT` / `OPENSEARCH_SCHEME` | `opensearch` / `9200` / `http` | Where catalog-service reaches the search index (compose-internal). |
| `OPENSEARCH_CONNECT_TIMEOUT_MS` / `OPENSEARCH_RESPONSE_TIMEOUT_MS` | `2000` / `2000` | Short by design — a dead/slow OpenSearch fails fast into the Postgres fallback instead of stalling a request thread. |
| `SEARCH_BACKFILL_READINESS_TIMEOUT_MS` | `30000` | How long startup waits for OpenSearch (it boots a little behind catalog) before skipping the index backfill. Skipping is non-fatal — the next catalog write re-indexes that product. |
| `REC_ENABLED` | `true` | Master switch for the **co-purchase** signal in recommendations. `false` skips the catalog→order call entirely and recs run content-based + category-fallback only. Content-based and the fallback are unaffected. |
| `ORDER_SERVICE_URL` | `http://order-service:8094` | Where catalog-service reaches order-service for co-purchase data — **compose-internal, bypassing the gateway** (same pattern as order→inventory). Best-effort: any failure (timeout/4xx/5xx/unreachable) degrades to an empty co-purchase list; there is intentionally **no** `depends_on`. |
| `REC_SIZE_DEFAULT` | `8` | Default `size` when the caller omits `?size=`. Any requested size is clamped to 1–24 so a caller can't trigger an unbounded blend/aggregation. |
| `REC_CONNECT_TIMEOUT_MS` / `REC_RESPONSE_TIMEOUT_MS` | `1500` / `2000` | Short by design — a dead/slow order-service fails fast into co-purchase-empty degradation instead of stalling the recommendations request thread. |
| `GOOGLE_CLIENT_ID` / `_SECRET` | dummy | Real values enable Google login; guest tokens cover the full journey without them. |
| `OTP_DEV_ECHO` | `false` | **Dev stub only.** `true` → `/auth/otp/request` echoes the OTP in its JSON response so local/CI can verify the phone-OTP flow without a real SMS provider. Leave **false** outside dev — the real code only ever leaves over the SMS channel. |

Frontend (`frontend/.env.example`): leave `VITE_API_BASE` **empty** for local dev — the Vite dev
server proxies `/api` and `/auth` to the HTTPS gateway (`https://localhost:8443`, `secure: false`),
so the browser never sees the dev self-signed cert. Empty in production too (served same-origin).

---

## Auth model (read this before testing)

1. **Get a guest token** — no Google login needed (lets you browse + build a cart):
   ```bash
   curl -sk -X POST https://localhost:8443/auth/guest \
     -H 'Content-Type: application/json' -d '{"name":"QA Tester"}'
   # → {"token":"eyJ...","userId":"guest-...","displayName":"QA Tester"}
   ```
2. **Send it on every protected call:** `Authorization: Bearer <token>`.
3. The gateway validates the token **once** and injects `X-User-Id` downstream. Your cart and orders
   are scoped to that token's user — reuse the same token to keep the same cart.
4. **Ordering requires a real (non-guest) account.** Browsing and cart-building stay guest-friendly, but
   `POST /api/orders/checkout` **403s a guest token** (`X-User-Id` starting `guest-`) — register or log in
   first (below) to get a `usr-<uuid>` token, then check out. (The storefront enforces the same gate in the
   cart UI; order-service is the real boundary.)

**Public paths** (no token): `/auth/guest`, `/auth/register`, `/auth/login`, `/auth/otp/**`
(self-serve sign-up / sign-in), `/api/catalog/products` (browse), `/api/catalog/notify`
(launch-interest signup), `/socket.io/**` (the WebRTC handshake carries the call grant itself),
`/actuator/**`, `/oauth2/**`, `/login/**`. Everything else returns **401** without a valid Bearer token.

**Self-serve accounts** (Phase 2) live alongside Google/guest: a customer can `register`/`login` with an
email-or-phone + password (BCrypt, never stored plaintext) or with a phone-OTP (6-digit code, hashed in
Redis with a TTL + attempt cap + resend throttle). Every path ends at the **same** `JwtService.generate(...)`
call, so a password- or OTP-issued JWT is a normal non-guest token — nothing downstream changes. Responses
are deliberately **generic** (no "user exists" / "wrong password" distinction) to resist account enumeration.

> Login JWT ≠ call grant. The video-call pillar (`/api/videocall/grant`) mints a **separate**,
> short-lived token signed with its own secret — see the Videocall rows in the [API reference](#api-reference).

### Roles (RBAC)
Identity carries a **role**. At login, auth-service checks the user's email against the `ADMIN_EMAILS`
allowlist: a match mints a JWT with the **ADMIN** role, everyone else (including guests) is **USER**.
The gateway reads the role from the validated token and injects it downstream as **`X-User-Role`**.
Admin-only routes — `/api/catalog/admin/**`, `/api/inventory/admin/**`, and
`/api/videocall/admin/**` (the eligibility roster) — are enforced **at the gateway** (403 for
non-admins) **and re-checked inside** each service (`AdminRoleFilter`), so a service is safe even if
reached off-gateway — defense in depth.

---

## API reference

Base URL = the gateway, e.g. `https://localhost:8443` (HTTPS, dev self-signed → `-k`). 🔓 = public, 🔒 = requires Bearer token, 🛡 = requires **ADMIN** role.

### Auth — `/auth/**`
| Method | Path | Body | Notes |
|---|---|---|---|
| 🔓 POST | `/auth/guest` | `{ "name": "..." }` | Returns `{ token, userId, displayName }` |
| 🔓 POST | `/auth/register` | `{ identifier, password, displayName }` | Self-serve sign-up. `identifier` = email **or** 10-digit Indian phone; `password` ≥ 8. Hashes with BCrypt, mints a `usr-<uuid>` account, auto-logs-in → `{ token, displayName }`. Duplicate identifier → **409** (generic) |
| 🔓 POST | `/auth/login` | `{ identifier, password }` | Email-or-phone + password sign-in → `{ token, displayName }`. Bad creds **or** unknown identifier → identical generic **401** (anti-enumeration) |
| 🔓 POST | `/auth/otp/request` | `{ phone }` | Send a 6-digit OTP (hashed in Redis, ~5-min TTL, rate-limited). Always returns neutral `{ sent:true }` regardless of whether the phone is known. **Dev stub** logs/echoes the code (`OTP_DEV_ECHO=true`); a real SMS provider drops in behind config at go-live |
| 🔓 POST | `/auth/otp/verify` | `{ phone, code }` | Verify the OTP (attempt-capped) → finds-or-creates the phone account → `{ token, displayName }`. Wrong code → generic error + attempt increment |
| 🔒 GET | `/auth/me` | — | Current user from token (incl. `role`) |
| 🔒 PUT | `/auth/me/display-name` | `{ "displayName": "..." }` | Update the current user's display name |
| 🔓 GET | `/oauth2/authorization/google` | — | Start Google login (optional) |

### Catalog — `/api/catalog/**`
| Method | Path | Body / Query | Notes |
|---|---|---|---|
| 🔓 GET | `/api/catalog/products` | `?category=&type=&page=&size=` | **Paginated `Page` object** (`{content:[...]}`), default size 20 |
| 🔓 GET | `/api/catalog/products/search` | `?q=&category=&type=&page=&size=` | **Full-text search** (same `Page` shape as browse). Typo-tolerant, relevance-ranked, searches name/sku/category/description + flattened JSONB attributes. Blank `q` → normal browse. Degrades to a Postgres `ILIKE` scan if OpenSearch is down (never 503s). Not cached — a just-created SKU is findable immediately |
| 🔓 GET | `/api/catalog/products/{id}/recommendations` | `?size=8` | **"You may also like"** — hybrid (co-purchase first, content-based fills, same-category fallback). Bare `List<ProductResponse>` (not a `Page`). Public, never 503s (only 404 if the anchor is gone); excludes the anchor; `size` clamped to 1–24 |
| 🔓 GET | `/api/catalog/products/{id}` | — | Single product |
| 🔓 POST | `/api/catalog/notify` | `NotifyRequest` | **Launch-interest signup** from the storefront "🔔 Notify me" popups. Persists `{topic, phone, email?}` to `notify_signups`. **Idempotent on (topic, phone)** — a re-submit returns the existing row (no duplicate). → **201**; junk phone/email → **400** |
| 🛡 GET | `/api/catalog/admin/notify` | — | List all signups, newest first (ADMIN only). How the founder retrieves the launch list |
| 🛡 POST | `/api/catalog/admin/products` | `ProductRequest` | Create (ADMIN only) |
| 🛡 PUT | `/api/catalog/admin/products/{id}` | `ProductRequest` | Update (ADMIN only) |
| 🛡 DELETE | `/api/catalog/admin/products/{id}` | — | Delete (ADMIN only) |

`ProductRequest` = `{ sku, name, description?, productType, category?, basePrice, currency, imageUrl?, attributes? }`

`NotifyRequest` = `{ topic, phone, email? }` — `phone` is a 10-digit Indian mobile (`[6-9]\d{9}`), `email` optional. The storefront also keeps a `localStorage` copy as an offline fallback, so the form still succeeds if the backend is unreachable.

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
| 🛡 POST | `/api/inventory/admin/stock` | `{ sku, quantity }` | Seed/adjust stock (ADMIN only) |
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
| 🔒 POST | `/api/orders/checkout` | **`Idempotency-Key` header (required)** + `CheckoutRequest` | **Non-guest only** — a `guest-` token → **403** ("Please sign in to place an order"). Returns **202** with order in `PENDING`; saga confirms async |
| 🔒 GET | `/api/orders/{orderId}` | — | Poll `status`: PENDING → CONFIRMED \| FAILED |
| 🔒 GET | `/api/orders` | — | Current user's orders |

`CheckoutRequest` = `{ currency, customerName, customerPhone, deliveryAddress, items:[{ productId, sku, name, unitPrice, quantity }] }` — the three delivery fields are required (COD pilot: goods are delivered to the address and paid on delivery).

### Videocall — `/api/videocall/**`
Gated 3-person video calling for **logged-in** customers (Phase 3). The login JWT only proves login and
is never sent to the socket; the socket admits **only** a short-lived **call grant** signed with a
separate secret (`VIDEOCALL_GRANT_SECRET`).

| Method | Path | Body | Notes |
|---|---|---|---|
| 🔒 POST | `/api/videocall/eligibility` | eligibility payload | Records/upserts the customer's eligibility (Tally gate). Login required (non-guest) |
| 🔒 POST | `/api/videocall/grant` | — | Issues a call grant if eligible **and** not in cooldown → `{ available:true, grant, roomId, exp }` (grant claims `aud=videocall-grant`, `maxParticipants:3`, `exp=iat+600`). Guest / not-eligible / cooldown all return identical `{ available:false }` — no reason, no countdown (by design). A 5h Redis cooldown is claimed atomically at issuance |
| 🛡 GET | `/api/videocall/admin/eligibility` | — | Eligibility roster (ADMIN only) |
| 🔓 WS | `/socket.io/**` | grant in handshake | WebRTC signaling (signaling-service). Verifies the grant fail-closed (pins HS256, requires `aud`+`exp`+`roomId`); a per-socket kill-timer force-drops the socket at grant `exp`. 4th join → `room-full`. Media relays via coturn (`:3478`) |

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

### MaLLADE catalog & provenance (V3 seed)

The brand this platform powers — **MaLLADE** — sells **traceable** GI-tagged fruits and honey. A second
Flyway seed (`V3__seed_mallade_provenance.sql`) adds real-shaped products, each carrying its provenance
under the JSONB `attributes.provenance` (no schema change — `attributes` was always JSONB):

| SKU | Category | Price (INR) | GI status |
|---|---|---|---|
| `MAL-HONEY-COORG-500` / `-1000` | honey | 549 / 999 | none (lab-tested purity) |
| `MAL-HONEY-JUNGLE-500` | honey | 599 | none (lab-tested purity) |
| `MAL-MANGO-ALPHONSO-BOX` | fruit | 1299 | **pending** |
| `MAL-MANGO-GI-BOX` | fruit | 1099 | **authorized** ✓ |
| `MAL-LITCHI-SHAHI-BOX` | fruit | 899 | **authorized** ✓ |

`attributes.provenance` = `{ farm, origin, harvest, batch, labCert{ ref, test, status }, gi{ status, name, authNo? } }`.
The storefront's **product-detail overlay** (click any card — no router; it mirrors the cart slide-over and
fetches `GET /api/catalog/products/{id}`) surfaces this panel.

**Compliance rule (enforced in the UI):** the "GI-tagged ✓" badge renders **only** when
`gi.status === "authorized"`; `pending`/`none` show as plain text — never an unearned GI claim. The seed
mixes all three to exercise the distinction.

**Per-SKU, not variant-aware:** each buyable unit (honey 500g vs 1kg) is its **own product**, so the
cart/order/checkout contract (lines keyed by `productId`) is untouched. Variants are seeded only as
*informational* "available grades" for display. These MaLLADE rows are **catalog-only — no stock is
seeded**; add inventory via `POST /api/inventory/admin/stock` to make one buyable.

---

## Developer workflow

- **Project layout:** one folder per service (`auth-service/`, `catalog-service/`, `cart-service/`,
  `inventory-service/`, `payment-service/`, `order-service/`, `gateway/`), each a standalone Spring
  Boot Maven module (Java 21, virtual threads, Flyway, HikariCP, actuator). `frontend/` is React+Vite.
- **Stack:** Spring Boot **3.5.12** (off the EOL 3.2.3 baseline), Java 21, groupId `com.varsha`, package
  `com.varsha.<service>`. The gateway runs Spring Cloud **2025.0.2**; all web services re-pin Tomcat
  **10.1.55** (a load-bearing override — Boot 3.5.12's BOM still ships 10.1.52; don't drop it without re-scanning).
- **Rebuild one service after a change:**
  ```bash
  docker compose up -d --build catalog-service
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
(`https://localhost:8443`, HTTPS dev self-signed → `-k`) — that's the real contract. The stack is
pre-seeded, so no setup needed.

### 1. Automated smoke tests
| Script | Proves | Run |
|---|---|---|
| `scripts/fullstack-smoke.sh` | 57 assertions: edge health, guest auth, 401 on anon, admin seed, public browse, **MaLLADE provenance round-trips (V3 seed applied)**, cart snapshot, **checkout saga → CONFIRMED + payment SUCCESS + stock decrement**, **idempotent replay**, **product search** (public, backfilled-seed, typo-tolerant, just-created-SKU/dual-write), **hybrid recommendations** (two CONFIRMED orders drive a co-purchase pair → public 200 no-token, co-purchase partner present, anchor excluded, still 200 with order-service stopped), **self-serve auth** (register → login → generic 401 on bad creds, OTP request/verify with the dev-echoed code), **videocall grant gate** (default-deny before eligibility, grant claims aud/room-bound/max-3/`exp-iat=600`, silent 5h cooldown, guest rejection, admin roster), **restart-survives-data** | `bash scripts/fullstack-smoke.sh` |
| `scripts/saga-smoke.sh` | The order saga happy path in isolation | `bash scripts/saga-smoke.sh` |

Both are **re-runnable** (unique SKU + idempotency key per run). Expected: `57 passed, 0 failed`.
The WebRTC socket admit-on-grant / max-3 / kill-timer paths are covered by the signaling-service's
own Jest tests (`signaling-service/src/__tests__/`), not the curl smoke.

### 1b. Supply-chain & image security scan (Trivy)
`scripts/security-scan.sh` runs [Trivy](https://github.com/aquasecurity/trivy) **fully dockerized**
(no host install) over two surfaces:

| Surface | What it checks |
|---|---|
| **Filesystem** (`trivy fs`) | Maven dependency CVEs in every `pom.xml`, Dockerfile/compose **misconfig**, leaked **secrets** |
| **Images** (`trivy image`) | the 7 built service images + 5 backing images: OS packages **and** the bundled Spring Boot fat-jar libraries |

```bash
bash scripts/security-scan.sh                 # print HIGH+CRITICAL; exit 1 on any CRITICAL (gate)
FAIL_ON=HIGH,CRITICAL bash scripts/security-scan.sh   # stricter gate
FAIL_ON= bash scripts/security-scan.sh        # report-only (triage), never fails
```

- The vuln DB is cached in a `trivy-cache` docker volume — the first run downloads it, later runs are fast.
- The image scan is the **authoritative** view of app dependencies (it reads the exact jars that ship).
- The filesystem scan runs `--offline-scan` so Trivy's Java analyzer doesn't try to fetch remote
  parent POMs (that network call gets canceled in a read-only container and crashes the walk). The
  gate also distinguishes a Trivy **crash** from a real finding — a scan that can't complete is
  flagged `(scan-error)`, never silently counted as a CRITICAL.
- The gate fails on **CRITICAL** only, so informational base-image HIGHs don't make it perma-red.
  Accept a specific finding by adding a justified, dated line to `.trivyignore`.
- Build the service images first (`docker compose build`) so they exist locally to scan.

**Current state.** All **service-image** CRITICALs are remediated (fixed, not muted) on the Spring Boot
**3.5.12** baseline:
- **CVE-2026-22732** (spring-security-web) is **fixed** — Boot 3.5.12 manages spring-security 6.5.9.
  This was the deferral that drove the off-EOL upgrade; the old `.trivyignore` line is gone (verified:
  count 0 even with the suppression removed).
- **Tomcat** (CVE-2025-24813, CVE-2026-41293) — fixed in all 6 web services via
  `<tomcat.version>10.1.55</tomcat.version>` (Boot 3.5.12's BOM still pins 10.1.52, so the override stays).
- **gateway** CVE-2025-41243 (SpEL via gateway-server-webflux) — fixed by pinning Spring Cloud
  **2025.0.2** (gateway 4.3.4).
- The remaining `.trivyignore` entries are upstream CVEs in the `minio`/`postgres` images we don't build
  (Go-toolchain / minio-internal), each dated with an `exp:` review date.

> **One open item — DS-0031:** the `trivy fs` scan flags `TLS_KEYSTORE_PASSWORD` being passed via a
> gateway `Dockerfile` build-`ARG` (CRITICAL, secrets check). It's a dev-cert convenience from the TLS
> work, tracked as a follow-up; a real deployment mounts a CA-signed keystore and supplies the password
> at runtime (secret manager), not at build. This is the only CRITICAL keeping the *overall* gate red —
> all service **images** are clean.

> OWASP Dependency-Check is the heavier CI-grade alternative for the dependency half (full NVD mirror,
> slow, needs an NVD API key); Trivy is the local-first choice and its DB covers the same CVEs.

### 1c. Observability — trace · log · metric
End-to-end observability across three pillars, all stitched by **one W3C `trace.id`** so a single id
surfaces the whole customer journey (browse → cart → checkout → order) as a span waterfall, every log
line, and metric exemplars — pivot between them in one click.

**Metrics & alerting (Prometheus + Grafana + Alertmanager).** Every service exposes
`/actuator/prometheus`; **Prometheus** (`http://localhost:9090`) scrapes all of them every 15s with real
percentile histograms (true p50/p95/p99) and **exemplar storage** (a `trace_id` stamped on latency
samples). **Grafana** (`http://localhost:3000`, login `admin` / `GRAFANA_PASSWORD`) provisions four
dashboards over a Prometheus **and** an Elasticsearch datasource:
- **Infra** — JVM heap/GC, CPU, threads, HikariCP pool, scrape up/down per service.
- **API-SLO** — RPS, p50/p95/p99 latency, 5xx error rate, top-10 slowest endpoints; latency exemplars
  link straight out to the trace in Kibana.
- **Business** — orders placed/confirmed, realized GMV (₹, CONFIRMED-only), signups, payment attempts,
  checkout-saga latency. (Metric labels carry **no** user id / email / phone / card data.)
- **catalog cache** — hit ratio (`cache_gets_total` hit/miss), gets/sec, req/sec, JVM heap (run the
  browse load test below to watch the cache fill).

**Alertmanager** (`http://localhost:9093`) receives SLO/burn-rate alerts from Prometheus rule files —
`ServiceDown`, `HighErrorRate`, `CheckoutLatencyP99High` (>800ms), `PaymentFailureRateHigh`. Receivers
are intentionally stubbed (no real pager) until go-live.

**Tracing (OpenTelemetry → APM).** All 8 Java services + the Node signaling service emit OTLP spans
(Boot 3 auto-instrumentation: WebFlux/WebMVC, `RestClient`, JDBC) to **apm-server**, stored in
Elasticsearch and rendered as a waterfall in **Kibana → APM**. Error and payment/order paths are 100%
sampled so a dispute trace is never dropped.

**Logging & forensics (ELK).** Services log ECS-aligned JSON to stdout; **Filebeat** ships it to
**Elasticsearch**, browsable in **Kibana** (`http://localhost:5601`). `user_id` is **hashed**, and
card/phone/email are masked before persistence — no raw PII lands in the store. The "journey by
`trace.id` / hashed `user_id`" saved view returns the full ordered timeline for dispute resolution.

> First boot pulls/starts ES + Kibana + APM-server (RAM-hungry; single-node, capped heap by design).
> Give the stack ~60–90s before the Kibana UI is ready.

### 1d. Load tests (k6)
`loadtest/` holds three [k6](https://k6.io) scripts (run with the dockerized `grafana/k6` image — no host install):

| Script | Drives | Proves |
|---|---|---|
| `browse.js` | catalog browse (cache path) | cache warms → hit ratio climbs, p95 latency drops |
| `journey.js` | full guest journey through the gateway | end-to-end throughput/latency under load |
| `ratelimit.js` | single-IP burst | the per-IP limiter returns **429** past the threshold |

```bash
docker run --rm -i --network quick-ecommerce_default -e BASE_URL=https://gateway:8443 \
  grafana/k6 run - < loadtest/browse.js
```

> ⚠️ `journey.js` hammers from one source IP, so the per-IP rate limiter will 429 it unless you start
> the stack with `RATE_LIMIT_TRUST_FORWARDED_FOR=true` and have k6 send a varying `X-Forwarded-For`
> (see `loadtest/README.md`). `ratelimit.js` *wants* the 429s — that's its assertion.

### 2. Key acceptance scenarios (manual / exploratory)

**Happy path (full journey):**
1. `POST /auth/register {identifier, password, displayName}` → grab token (a `usr-<uuid>` account;
   ordering needs a non-guest token — a `POST /auth/guest` token can browse + cart but 403s at checkout).
2. `GET /api/catalog/products` → see 5 seeded products.
3. `POST /api/cart/items {productId, quantity:2}` → line appears, price snapshotted.
4. `POST /api/orders/checkout` with an `Idempotency-Key` → **202**, order `PENDING`.
5. Poll `GET /api/orders/{id}` → flips to **CONFIRMED** within a few seconds.
6. `GET /api/payments/{id}` → **SUCCESS**; `GET /api/inventory/stock/{sku}` → decremented.

**Guest is blocked from ordering:** `POST /auth/guest` → token → `POST /api/orders/checkout` → **403**
("Please sign in to place an order"). Register/login and retry → **202**.

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
> Testcontainers-based tests per service is the one Phase-2 item still pending. Treat the smoke scripts as the current
> regression gate.

### 4. What to file in a bug report
Service name + endpoint, the **token's `userId`**, the `orderId` / `Idempotency-Key` / `sku`, the
request/response bodies, and `docker compose logs <service>` around the timestamp.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Gateway won't bind / port in use | Host 8443 taken → use e.g. `GATEWAY_PORT=9443`. |
| `curl` fails with a cert error | The edge is HTTPS with a **dev self-signed** cert — add `-k` (or `--insecure`). |
| Browser warns "not secure" at the gateway | Expected for the dev self-signed cert. For the frontend, leave `VITE_API_BASE` empty so calls go via the Vite proxy (no browser cert prompt). |
| `/auth/guest` returns 401 | `JWT_SECRET` shorter than 32 bytes → jjwt `WeakKeyException`. Use the default or a ≥32-byte value. |
| Cart add returns 503 | cart-service can't reach catalog → ensure `CATALOG_SERVICE_URL=http://catalog-service:8090` (set in compose). |
| Calls fail right after `up` | Gateway reports UP before downstream services finish booting. Wait ~10–20s / poll the actual endpoint. |
| Frontend CORS errors | `ALLOWED_ORIGIN` must match the frontend origin (default `http://localhost:5173`). |
| Checkout 400 "Missing Idempotency-Key" | Every checkout **must** send an `Idempotency-Key` header. |
| No products after `up` | You ran on an existing volume that was seeded before seeds existed — `docker compose down -v` then `up`. |

---

## Known limitations / out of scope
- **Mock payments only** — real Razorpay/Stripe (KYC/PCI) is a later swap behind `PaymentProvider`.
- **Dev self-signed TLS, no cloud deploy** — the edge cert is generated at image build; there's no
  managed deployment / CA-signed cert / public domain yet. See [Production readiness](#production-readiness--what-it-takes-to-go-live).
- **DS-0031 open** — `TLS_KEYSTORE_PASSWORD` is passed via a gateway Dockerfile build-ARG (trivy `fs`
  CRITICAL); a dev convenience, tracked as a follow-up (see Security-scan section).
- **Minimal storefront UI** — the React app proves the journey (Catalogue v2: sticky discovery toolbar
  with category pills + inline live filter + sort + GI/lab/price facets, editorial-provenance cards, a
  detail drawer with image zoom + quick-add + a "you may also like" row, and a home "Recommended for
  you" row) but isn't yet a finished shopping experience (no checkout UX polish or account pages, and
  the catalogue filter/sort/facets are client-side over `?size=200` — server-side facets are a
  follow-up if the grid outgrows that page).
- **Search is eventually consistent (secondary index).** Postgres is the source of truth; OpenSearch is
  kept in sync by dual-write on every catalog write **and** a startup backfill. Two consequences: (1) a
  catalog write is reflected in search after OpenSearch's refresh (~1s); (2) **a product deleted while
  OpenSearch is unreachable leaves a "ghost" doc** — the failed delete is swallowed (degradation), and
  the startup backfill only *upserts* existing rows, so it never removes the orphan. A ghost shows in
  search results but 404s on detail/add-to-cart. Remedy: rebuild the index (`curl -XDELETE
  http://opensearch:9200/products` then restart catalog to trigger a clean backfill). Acceptable for the
  pilot; a production fix is a periodic reconcile or an outbox-driven index. Likewise, **mapping changes
  need an index rebuild** — `ensureIndex()` is create-if-absent and won't alter an existing mapping.
- **Recommendations are on-demand and cold-start-sparse.** Co-purchase is computed live from
  `order_items` per request (no precomputed table / batch pipeline — fine at pilot scale), so a brand-new
  catalog with few `CONFIRMED` orders leans almost entirely on the content-based and same-category signals
  until purchase pairs accumulate. The content-based half **inherits the search index's eventual
  consistency** — a just-created product is `more_like_this`-recommendable only after OpenSearch's refresh
  (~1s), and a "ghost" doc (deleted while OpenSearch was down, see above) can surface as a rec until the
  index is rebuilt. Recs are not cached and the blend weighting is a fixed heuristic (behavioral first,
  content fills) — no per-user personalization or A/B ranking yet.
- **"Sell anything"** = flexible schema + generic checkout, **not** per-category logistics/tax/compliance.
- Commerce-service automated test coverage is pending (see QA §3).
- **Gated video calling is built** (signaling-service + coturn + videocall-service); **admin
  livestreaming and the AI assistant are not** (see Roadmap). The WebRTC mesh is peer-to-peer (max 3) —
  audience-scale livestreaming needs an SFU (mediasoup/LiveKit), not yet built.

---

## Production readiness — what it takes to go live

Honest answer: **this runs end-to-end on a laptop today, but it is not a launched store.** What stands
between "working demo" and "real customers can buy":

- **Real payments** — swap `MockPaymentProvider` for Razorpay/Stripe; KYC, PCI scope, webhooks, refunds.
- **Cloud deploy + real TLS + a domain** — the images are deploy-ready (env-only config), but nothing is
  hosted; needs a CA-signed cert (not the dev self-signed one) and DNS.
- **Close DS-0031** — supply `TLS_KEYSTORE_PASSWORD` at runtime from a secrets manager, not a build-ARG.
- **A real frontend** — Catalogue v2 ships discovery (category pills/filters/sort/inline search),
  editorial cards, and detail zoom + quick-add; still needed are checkout UX polish, account/order
  history, server-side facets, and actual catalog content + images at scale.
- **Test coverage** — Testcontainers integration tests for the commerce services (only auth-service has
  unit tests today); the smoke scripts are the current regression gate.
- **Secrets & backups** — managed secrets and automated Postgres backups. (On-call **alerting** is now
  in place via Alertmanager + Prometheus SLO rules; only the real pager receiver is stubbed until go-live.)

The architecture (per-service DBs, the outbox saga, the resilient gateway edge, observability) is the
hard part and it's in place — the list above is integration and operations work, not a redesign.

## Roadmap
- **Phase 1 — DONE:** persistent, resilient microservices foundation (this README).
- **Phase 2 — DONE:** Redis catalog caching, MinIO object storage for media, Prometheus + Grafana
  observability, k6 load tests. *(Per-service Testcontainers tests still pending.)*
- **Security hardening — DONE:** RBAC (ADMIN role + allowlist), TLS at the edge, per-IP rate limiting,
  CORS hardening + security headers, and the Spring Boot 3.5.12 baseline upgrade (off EOL 3.2.3).
- **Product search — DONE:** OpenSearch-backed full-text search in catalog-service (typo-tolerant,
  relevance-ranked, attribute-aware), dual-write + startup backfill, Postgres `ILIKE` degradation, and a
  storefront search box.
- **Recommendations — DONE:** "you may also like" — hybrid **co-purchase** (a `CONFIRMED`-orders
  self-join on `order_items`, owned by order-service, fetched best-effort over the compose network)
  **first**, **content-based** (OpenSearch `more_like_this`) fills remaining slots and covers cold-start
  products, with a same-category Postgres fallback so the row is never empty when siblings exist. The
  endpoint never 503s. Surfaced as a storefront **product detail modal** with a related-products row.
- **Phase 3 — gated video calling DONE:** vendored the FamilyCall WebRTC stack (signaling-service,
  coturn, `useWebRTC`) + a Spring `videocall-service` enforcement brain — 3-person gated calls for
  logged-in customers, two-token security (login JWT ≠ short-lived call grant), max-3 rooms, silent 5h
  cooldown, 10-min grant cap with a kill-timer. **Next:** admin-only shoppable **livestreams** (the mesh
  is peer-to-peer — real audience scale needs an SFU like mediasoup/LiveKit).
- **Observability — DONE:** end-to-end **trace · log · metric** joined by one `trace.id` — OpenTelemetry
  tracing → APM waterfall (Kibana), ECS-aligned PII-safe logs (hashed `user_id`, masked card/phone/email)
  shipped via Filebeat → Elasticsearch, and Prometheus histograms/exemplars + business meters across
  three Grafana dashboards (Infra · API-SLO · Business) with Alertmanager SLO alerting.
- **Phase 4:** **AI shopping assistant** — Claude API: conversational discovery + semantic search.
- **Phase 5:** Cloud deploy (same images, env-only changes; Caddy auto-TLS).
