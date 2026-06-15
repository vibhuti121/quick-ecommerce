# 💾 SCALING QUEST — PROGRESS LEDGER

## 📍 CURRENT LEVEL: **L0 — Melt + Baseline** (replaying slowly, doubts-first · Step 2 next)

> **This is the single source of truth.** Resuming a session? Read THIS file first — the
> `▶ CURRENT STATE` block below tells you everything needed to pick up. Do NOT re-read the
> transcript. Read `CURRICULUM.md` only to choose the next level; read a level's cheatsheet
> only when revisiting that level. See `README.md` for the read-order rule.

---

## ▶ CURRENT STATE  *(rewrite this block at the end of every session)*

- **Level:** L0 — Melt + Baseline (played once fast; **replaying slowly, doubts-first**).
- **Resume point:** mid Level-0 slow-replay. Step 1 done live (👀 7 idle JVMs ~3.3GiB vs
  Postgres ~90MiB). Just finished a Go-vs-Java gateway digression (our gateway IS Java /
  Spring Cloud Gateway; real-world edge proxies favor Go/Rust/C for footprint + concurrency +
  low-pause GC). **Next action:** Step 2 — `ps aux | grep fullstack-smoke` to confirm no
  second session has hands on the stack, then continue the 7-step replay (see below).
- **Open doubts / unanswered:** Quiz **Q1** (*202 Accepted ≠ order fulfilled*) and **Q2** still
  UNANSWERED — re-ask only after finishing the slow replay, before unlocking L1.
- **Boot command (core only, heavy stuff off):**
  ```bash
  docker compose up -d postgres redis minio auth-service catalog-service cart-service \
    inventory-service payment-service order-service gateway frontend admin-app
  docker compose stop opensearch videocall-service signaling-service
  ```
  Journey runs need the lab flag: `RATE_LIMIT_TRUST_FORWARDED_FOR=true docker compose up -d gateway`
  (restore default at quest end). NEVER `docker compose down -v` — volumes/data must survive.
- **Before any load test:** `ps aux | grep fullstack-smoke` — a 2nd Claude session once
  SIGKILLed payment-service via a concurrent compose recreate.

### The 7-step Level-0 slow-replay (the agreed resume path)
1. Free RAM + boot CORE (cmd above), then `docker stats` 👀 — 7 idle JVMs ~3.3GiB vs Postgres ~90MiB.
2. `ps aux | grep fullstack-smoke` — confirm no 2nd session has hands on the stack.
3. Replay the 3-tier map slowly: Presentation(SPAs+gateway) / Application(stateless) / Data(pg+redis+minio). One-liner: *push state down so the middle can multiply.*
4. `browse-lab.js` (50 VUs) live → 193 req/s @ p95 3.4ms, 0% err. Lesson: is the TEST lying before the system is broken? (22% was rotted fixtures).
5. `journey.js` cold vs warm (needs the lab gateway flag) → cart 17%→0% = cold-start syndrome, live.
6. Open `run-assassination-k6.txt` → payment killed T+20s, saga retries 5× while checkouts still 202. Punchline answers Quiz Q1: *202 Accepted ≠ fulfilled.*
7. Re-ask Quiz Q1 & Q2, confirm understanding → unlock **L1 (Vertical Scaling: JVM heap/GC)**.

### Teaching contract (carry across every session)
Doubts-first · one concept per step · mark live moments with 👀 · confirm understanding before
moving on · re-run experiments rather than re-explain · after each 👀 give the one-line
**Google/Meta TL/staff interview soundbite**. He learns by watching live, not by reading docs.
Full method + level map in `CURRICULUM.md`.

---

## 📜 SESSION LOG  *(append-only, newest first — 2–4 lines each)*

### 2026-06-15 — docs system + gateway digression
- Built this progress/plan documentation system (PROGRESS.md + CURRICULUM.md + README.md) to
  stop context explosion: a resume now reads one small ledger, not the transcript. SAVE.md retired
  to a redirect.
- Closed the Go-vs-Java gateway question: confirmed our gateway is Spring Cloud Gateway (Java),
  explained why real-world edge proxies (Envoy/Traefik/Caddy/nginx) favor Go/Rust/C. Soundbite:
  *consistency + ecosystem leverage beat per-component optimization until scale forces the trade.*
- Still at L0 Step 2. Quiz Q1/Q2 pending.

### 2026-06-13 — L0 first play (fast) + baseline captured
- Booted core stack (~3.5GiB), drew 3-tier map. 7 untuned JVMs idle at 330–730MiB each.
- `browse.js` cried 22% errors → fixture rot (deleted ids) → built data-driven `loadtest/browse-lab.js`
  → clean baseline 193 req/s @ p95 3.4ms. Lesson: "is the test lying, or the system broken?"
- `journey.js` cold vs warm: cart 17%→0% (cold-start syndrome).
- payment-service Exited(137): first blamed OOM → **corrected**: a 2nd Claude session's
  fullstack-smoke (compose recreate → SIGKILL) was the killer. Lesson: "who else has hands on the system?"
- Assassination run saved (`run-assassination-k6.txt`): killed payment T+20s, watched saga retry
  "payment unreachable" 5× while checkouts still got 202. → the Q1 punchline.
- Outcome: L0 played end-to-end but too fast → decided to REPLAY L0 slowly, doubts-first.
