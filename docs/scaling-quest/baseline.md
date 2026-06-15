# Scaling Quest — Level 0 Baseline (2026-06-13)

Lab state: core commerce path only (ELK/OpenSearch/videocall stopped). Docker VM: 7.75GiB.
Gateway running with `RATE_LIMIT_TRUST_FORWARDED_FOR=true` (lab-only; restore default at quest end).
No JVM tuning anywhere (all Java services on default ergonomics) — this IS the "before" state.

## Idle memory (docker stats, no load)

| Container | Idle RSS |
|---|---|
| catalog-service | 689 MiB |
| auth-service | 525 MiB |
| inventory-service | 470 MiB |
| order-service | 448 MiB |
| gateway | 428 MiB |
| payment-service | 424 MiB |
| cart-service | 365 MiB |
| postgres (ALL the data) | 90 MiB |
| redis | 19 MiB |
| frontend (nginx) | 14 MiB |
| Whole stack | ~3.5 GiB |

## Read path — browse-lab.js (50 VUs, 45s steady, catalog direct)

| Metric | Baseline |
|---|---|
| Throughput | **193 req/s** |
| p50 / p90 / p95 | 0.87ms / 2.4ms / **3.4ms** |
| Errors | **0.00%** |
| Thresholds | ✅ PASS |

Note: original `browse.js` reported 22% errors — rotted hardcoded ids (1,2,4,5 deleted).
Fixed via data-driven `setup()` in `loadtest/browse-lab.js`. Lesson: when a load test fails,
first ask "system broken, or test lying?"

## Full journey — journey.js (15 VUs, 45s, via gateway HTTPS)

| Metric | Cold (1st run after boot) | Warm (2nd run) |
|---|---|---|
| Throughput | 15.3 req/s | 16.6 req/s |
| p95 latency | 190ms | **97ms** |
| Max latency | 3.39s | 768ms |
| Cart failures | 17% | 0% |
| Checkout failures | 23% | **5.9%** |
| orders_accepted | 76.7% | 94.1% (threshold ≥95% ❌) |

## Incidents during baseline (the real loot)

1. **payment-service KILLED under load — Exited(137) = SIGKILL** at 20:56, mid-first-journey-run.
   ~~Initial root-cause story: OOM from 7 untuned JVMs overcommitting the 7.75GiB VM.~~
   **CORRECTED 21:20:** a SECOND Claude session (IntelliJ terminal) was running
   `fullstack-smoke.sh` → `docker compose up -d` against the same stack. Compose recreate =
   SIGTERM, 10s grace, then SIGKILL(137) — a JVM busy under load can't shut down in 10s.
   Evidence: parent-chain of the mystery compose process; Docker VM uptime 40min (no reboot).
   Lesson: before root-causing, ask "who else had hands on the system?" The untuned-JVM
   memory risk is still real (3.3GiB idle) — but it wasn't tonight's killer. → Level 1 still on.
   Corollary incident: that session's recreate also rebuilt the gateway WITHOUT
   RATE_LIMIT_TRUST_FORWARDED_FOR → a later journey run collapsed into 645k instant 429s
   (one shared rate bucket) at 10.7k req/s — what a rate-limiter "saving" a gateway looks like.
2. Saga behaved as designed: `payment unreachable` → 5 retries with backoff →
   `Order FAILED after 5 attempts`. Async failure AFTER a 202 checkout — accepted ≠ fulfilled.
3. Warm-run 15 fast checkout failures: prime suspect = gateway CircuitBreaker (order route,
   TimeLimiter 3s) still open/half-open after run-1 carnage. UNCONFIRMED — prove with
   Prometheus/resilience4j metrics in Level 4.
4. Cold vs warm delta (cart 17%→0%) = cold-start syndrome: JIT, empty pools, cold caches.
   Production answer: warmup + readiness gates before traffic.
5. Services spam `Failed to export spans` when APM is off — observability has a cost and a
   failure mode of its own (Level 5).

## Targets to beat

- Read path: hold p95 < 400ms while RAISING VUs well past 50 (find the real knee).
- Journey: orders_accepted ≥ 95% warm, p95 < 1.5s, AND **nobody dies (no 137s)**.
- Memory: same stack serving same load in measurably less RAM after Level 1 tuning.
