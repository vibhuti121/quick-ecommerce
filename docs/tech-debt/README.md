# Tech-debt ledger — quick-ecommerce

The durable, severity-ranked record of tech debt across this repo. Written **only** by the
`tech-debt-finder` agent (`.claude/agents/tuned/tech-debt-finder.md`), reached on-demand via `/varsha`
("find the tech debt / audit `<service>` / what breaks first"). The finder **diagnoses and documents —
it never fixes.** Fixes are dispatched by `/varsha` to the specialist named in each row's `Route-to`.

## Layout (per-severity files)

| File | Severity | Meaning |
|---|---|---|
| [`P0-critical.md`](P0-critical.md) | **P0 Critical** | Exploitable hole, data loss, or crash-loop/oversell under normal prod use. Ship-blocker. |
| [`P1-high.md`](P1-high.md) | **P1 High** | A real bug under normal use, or a contract break that 400s a live caller. Will bite. |
| [`P2-medium.md`](P2-medium.md) | **P2 Medium** | Maintainability / latent risk that bites under load or at the edge, not today. |
| [`P3-low.md`](P3-low.md) | **P3 Low** | Smell / cleanup / cheap hardening. |

Each file is one findings **table** with columns:
`ID · Lens · Title · file:line · Failure mode · Suggested fix · Route-to · Status`.

## Finding IDs

Global and stable: `TD-001`, `TD-002`, … A finding keeps its ID **for life** — across re-runs and across
severity files (a reclassification moves the row to another file but carries the same ID + status). IDs
are never reused. A finding lives in exactly **one** severity file at a time.

## Status lifecycle

`open` (filed by the finder) → `routed` (handed to `/varsha` for dispatch) → `fixed` (specialist closed
it — the row is kept for history). The finder sets `open`; the caller/specialist advances it.

## Lenses & routing

- **system-design** → `sysdesign`
- **security** → `backend-orchestrator` (→ `security-agent`)
- **dependency / CVE** → `qa-orchestrator` (→ `dependency-auditor`)
- **correctness / "broken now"** → `problem-solver`
- frontend/contract → `fe-lead`; deploy/infra → `devops`

## Scope discipline

The finder is **scoped per invocation** (a service / a lens / changed-files; whole-repo is explicit). A
scoped re-run reconciles **only findings in its scope** and never deletes out-of-scope rows. Read each
sweep's header (below) for what it actually covered — a partial sweep is not full coverage.

## Last sweep

**2026-06-16** · scope: **lens=security, service=gateway only** (`gateway/` filters + `application.yml`,
cross-referenced against `docker-compose.yml` / `docker-compose.prod.yml` / `deploy/` + Prometheus scrape
config for the prod CF-fronted edge). · counts: **P0 0 · P1 0 · P2 2 · P3 2** (4 new, 0 pre-existing).
Map was stale at sweep time (L0 `built-at-SHA f740ff5` ≠ HEAD `e6ffd1f`); gateway findings verified
against current source. Out-of-scope areas (other services, system-design/correctness lenses) NOT swept.
