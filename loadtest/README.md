# Load testing (Phase 2, Pillar 3)

[k6](https://k6.io) scripts that prove the stack holds up under load, make the Pillar-1 Redis
cache benefit visible on Grafana, and verify the gateway's edge rate-limit guard.

No host install needed — run the official `grafana/k6` image **on the compose network**, so it
reaches services by container name (the same internal hops the storefront/edge use).

## Prerequisites

The full stack must be up:

```bash
docker compose up -d
```

Catalog seed data is 9 products (ids 1–9).

## Scripts

| Script | Target | What it proves |
|--------|--------|----------------|
| `browse.js` | **catalog-service direct** (`:8090`) | Read throughput/latency + Redis cache hit-ratio climb |
| `journey.js` | **gateway** (`:8443`, HTTPS) | Full purchase path across auth, catalog, cart (Redis), order (outbox → inventory + payment) |
| `ratelimit.js` | **gateway** (`:8443`, HTTPS) | The per-client-IP rate limiter engages (429 + problem+json) |

### Why browse.js hits the service directly

The gateway enforces a deliberate **per-client-IP rate limit: 100 requests / 60s** (token bucket,
keyed on `X-Forwarded-For` — see `gateway/.../filter/RateLimitFilter.java`). That's an edge
abuse-guard, *not* app capacity. To measure the catalog app + cache we bypass it and hit the
service. `journey.js` exercises the real edge path instead, giving **each VU its own
`X-Forwarded-For`** (a real load test = many distinct clients) and pacing under the per-client
budget. `ratelimit.js` deliberately hammers from *one* IP to confirm the guard fires.

## Run

```bash
# 1) Catalog browse hot path — cache benefit + capacity (50 VUs, 45s steady)
docker run --rm --network quick-ecommerce_default \
  -e BASE_URL=http://catalog-service:8090 \
  -v "$PWD/loadtest:/scripts" grafana/k6 run /scripts/browse.js

# 2) Full guest journey through the gateway (15 VUs, 45s) — HTTPS edge, dev self-signed cert
#    journey.js gives each VU its own X-Forwarded-For to simulate distinct clients, so the gateway
#    must be brought up trusting that header (Pillar 5 default is OFF — see note below):
#      RATE_LIMIT_TRUST_FORWARDED_FOR=true docker compose up -d gateway
docker run --rm --network quick-ecommerce_default \
  -e BASE_URL=https://gateway:8443 \
  -v "$PWD/loadtest:/scripts" grafana/k6 run /scripts/journey.js

# 3) Edge rate-limit guard verification — HTTPS edge (works under the default; one real client = one bucket)
docker run --rm --network quick-ecommerce_default \
  -e BASE_URL=https://gateway:8443 \
  -v "$PWD/loadtest:/scripts" grafana/k6 run /scripts/ratelimit.js
```
> The k6 scripts set `insecureSkipTLSVerify` so the gateway's dev self-signed cert is accepted.
>
> **Pillar 5 — X-Forwarded-For trust.** The rate limiter keys on the real TCP peer by default and
> ignores the client-supplied `X-Forwarded-For` (otherwise a single client spoofs the header to mint
> unlimited buckets and bypass the limit). `journey.js` *relies* on per-VU XFF to look like many
> clients, so start the gateway with `RATE_LIMIT_TRUST_FORWARDED_FOR=true` before running it. Don't
> leave that on in a real deployment unless a trusted proxy/LB overwrites XFF. `ratelimit.js` is a
> single real client (one k6 container), so it fires the guard under the default — no flag needed.

Tune load with `-e VUS=80 -e DURATION=2m` (browse/journey) or `-e BURST=300` (ratelimit).

## Thresholds (the pass/fail gate)

Each script exits non-zero if its thresholds aren't met:

- **browse.js** — `http_req_failed < 1%`, `p95 < 400ms`, `checks > 99%`
- **journey.js** — `http_req_failed < 2%`, `p95 < 1.5s`, `orders_accepted > 95%`, `checks > 98%`
- **ratelimit.js** — `rl_429 > 0` (guard engaged), `rl_200 <= 120` (allowed ≈ capacity)

## Watch the cache benefit

While `browse.js` runs, open Grafana (`http://localhost:3000`, admin/admin) →
*quick-ecommerce — Catalog Cache & Services*. The **cache hit ratio** panel climbs toward ~1.0 as
the small product/page set is served from Redis instead of Postgres. Or query Prometheus:

```
sum(rate(cache_gets_total{result="hit"}[1m])) / sum(rate(cache_gets_total{result=~"hit|miss"}[1m]))
```
