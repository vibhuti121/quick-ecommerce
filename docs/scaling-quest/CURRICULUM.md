# 🗺️ SCALING QUEST — CURRICULUM (the whole plan)

The durable syllabus. Day-to-day state lives in `PROGRESS.md` (read that first to resume);
this file is read only to choose/preview the next level. Per-level "loot" (cheatsheets,
baselines, k6 reports) lives in sibling files and is read only when working that level.

## Premise
A gamified, hands-on systems-design bootcamp using the live `quick-ecommerce` Docker stack as
the lab. The founder is prepping for a **team-lead role at a Google/Meta-tier company**, so every
concept is framed as "how you'd say this in a staff/TL system-design or behavioral interview loop."

## Teaching contract (how to run every session)
- **Doubts-first:** ask his questions before each step.
- **One concept per step**, short and continuous — slow and steady.
- **👀 live observation** over narration — he learns by watching the stack, not reading docs.
  Re-run experiments rather than re-explain.
- **Confirm understanding** before moving on.
- After each 👀, give the **one-line interview soundbite** ("in a loop you'd say…").
- Gamified framing (levels / bosses / loot) keeps engagement.

## Level ladder

| Level | Theme | Learning objective | Boss challenge | Definition of done (unlocks next) |
|---|---|---|---|---|
| **L0** | Melt + Baseline | Read a system under load: tiers, percentiles, load-test triage, exit codes | Survive the assassination run and explain why checkouts still returned 202 | Baseline captured; can answer Quiz **Q1** (*202 ≠ fulfilled*) & **Q2** |
| **L1** | Vertical scaling (JVM) | Heap/GC ergonomics; move p95 with explicit flags on one box | Tune the 7 untuned JVMs to serve the same load in measurably less RAM | Same load, lower RSS, p95 held/improved — proven with flags + before/after |
| **L2** | Horizontal scaling + LB | Stateless replicas behind the gateway; why stateless scales | **Stampede boss** — cache stampede / thundering herd on a hot key | Replicas absorb load; stampede mitigated (lock/jitter/SWR) and shown live |
| **L3** | Data tier | Why the stateful tier is the hard one: indexes, pools, read paths, replicas | Find & fix the first DB bottleneck under load (slow query / pool exhaustion) | The data-tier knee identified and pushed out, measured |
| **L4** | Async + resilience | Sagas, retries/backoff, circuit breakers, timeouts; accepted ≠ done | Make the order saga survive a dependency outage gracefully | Outage injected; saga degrades cleanly, no data corruption, CB observed |
| **L5** | Observability | Tracing/metrics/logs; find root cause without guessing; cost of telemetry | Diagnose an injected fault using traces+metrics alone | Root-caused from signals, not grep luck |
| **Final** | 3AM-pager boss | Put it together under a realistic incident | Compound failure at "3AM" — triage, mitigate, write the postmortem | Incident handled + postmortem with the interview-grade narrative |

(Progression mirrors the classic vertical → horizontal → distributed scaling arc.)

## Per-level loot files
- `baseline.md` — L0 numbers + corrected incident log (the "before" state).
- `cheatsheet-level0.md` — 3-tier model, percentiles, load-test triage, exit codes.
- `run-assassination-k6.txt` — the L0 assassination-run k6 report (Q1 punchline).
- Future levels add `cheatsheet-levelN.md` alongside.

## Lab safety rules (always)
- NEVER `docker compose down -v` — volumes/data must survive.
- Before any load test: `ps aux | grep fullstack-smoke` — no second session with hands on the stack.
- Journey runs need `RATE_LIMIT_TRUST_FORWARDED_FOR=true` on the gateway (lab-only; restore at quest end).
