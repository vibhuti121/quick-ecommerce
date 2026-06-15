# CLAUDE.md — quick-ecommerce (MaLLADE storefront)

> Governance file for this repo. These instructions apply to every session that opens here.

## 1. Prime directive — route ALL work through `/varsha`

**All development and planning work MUST begin by invoking `/varsha`** — the Layer 0 root
orchestrator for this repo. This includes: writing or editing any service/frontend code, designing a
UI surface, changing config or infra, deploying, writing migrations, planning a feature, scoping a
change, or auditing the codebase.

Do **not** edit code, design, deploy, or plan directly. Open `/varsha` and let it scope the work,
route it to the right agent, and run the QA gate. There is no carve-out — even a "one-line fix"
or a "quick question about the code" starts at `/varsha`.

## 2. Why

`/varsha` owns each problem end-to-end through a disciplined flow: detect project + QA gate → check
memory → read the relevant code → scope (measured, not guessed) → write a ledger → checkpoint →
execute → QA gate → correctness pass on risk domains → reconcile ledger → doc sync → report. Editing
directly skips the QA gate, the routing-to-the-right-specialist step, and the ledger/doc-sync
discipline this repo is built around — which is how regressions and contract breaks slip in.

- Skill contract: `~/.claude/commands/varsha.md`
- Routing table (source of truth for destinations): `.claude/varsha-routing.md`

## 3. How `/varsha` routes (orientation — `/varsha` applies this itself at Step 0c)

`/varsha` reads `.claude/varsha-routing.md` and **prefers the tuned project agent** over the generic
kit orchestrator for each domain. You spawn the orchestrator/lead, not its children — it spawns its
own specialists.

| Domain | Goes to |
|---|---|
| Storefront UI / catalogue / `.tsx` / CSS / component | **fe-lead** (hub → fe-design / fe-build / fe-commerce / fe-quality) |
| Design direction for a UI surface (2-3 directions + preview) | **fe-design** |
| Catalogue / commerce-UX / `api.ts`+`types.ts` over existing endpoints | **fe-commerce** |
| Frontend a11y / perf / visual-QA / served-bundle proof | **fe-quality** |
| Architecture / scaling / schema / service split-merge / cost-at-N | **sysdesign** (decides; `devops` executes) |
| Deploy / `docker-compose.prod` / Cloudflare / TLS / backups / "take it live" | **devops** |
| "Where is X / how does Y work / which file owns Z" / orientation | **codebase-explorer** (reads the codemap first) |
| Backend service / REST endpoint / entity / DB query / business logic | `backend-orchestrator` |
| QA gate / tsc / build broken / contract check | `qa-orchestrator` |
| Infra / `.env` / OAuth / secrets / cloud setup | `infra-orchestrator` |
| WebRTC / signaling / coturn / TURN / peer video | `realtime-orchestrator` |
| "broken" / "error" / "not working" / diagnose-until-fixed | `problem-solver` |
| Blocked by an unknown value (cloud id, region, IP, secret) | `ops-resolver-agent` |
| New integration / REST vs WS vs gRPC vs MCP choice | `protocol-agent` |
| External research / library versions / API docs / pricing | `research-agent` |

## 4. Honest limit

This file is **instruction-level guidance, not a physical gate** — it strongly biases a session to
start at `/varsha`, but it cannot block a stray edit. If true hard enforcement is ever wanted, the
mechanism is a `PreToolUse` hook in `settings.json` that blocks `Edit`/`Write` unless a `/varsha`
session is active (with a bypass for trivial reads). Not configured today, by choice.

## 5. Repo map (orientation only — confirm via `codebase-explorer`, don't spelunk)

Spring-microservices backend + React/Vite storefront, behind a TLS gateway on `:8443`.

- **Services:** `gateway` (:8443, TLS/auth/CORS/rate-limit), `auth-service`, `cart-service`,
  `catalog-service` (products + search), `order-service` (sagas), `payment-service`,
  `inventory-service` (oversell guard), `admin-app`, `frontend` (storefront),
  `signaling-service` + `videocall-service` + `coturn` (gated video), `backend` (shared domain/infra).
- **Infra dirs:** `loadtest/` (k6), `observability/` (ELK/APM/Prometheus), `scripts/` (gen-secrets),
  `deploy/` (prod compose override), `docs/`, `.claude/` (agents, codemap, routing).

For "where is X / how does Y work", ask `/varsha` → `codebase-explorer` (it reads the persistent
codemap instead of re-deriving architecture from source).

## 6. Conventions

- **Durable plan:** `docs/ROADMAP.md` (Horizons H0→H4). After any planning round, update it **and**
  its Changelog — not just a throwaway plan file.
- **Reports/ledgers** live under `docs/` (e.g. `docs/scaling-quest/PROGRESS.md` is the single-source
  ledger pattern to mirror).
- **Memory** lives at `~/.claude/projects/-Users-vibhutiraman-code-quick-ecommerce/memory/` and under
  `~/mallde/`. Never write under `.claude/` from a headless run (it is hard-blocked).
- **Commit only when explicitly asked.** Do not commit or push on your own.

## 7. Planned (NOT yet built): `tech-debt-finder`

A future **read-only audit agent** — not implemented yet, do not assume it exists. When built, its
contract will be:

- **Sweeps the repo** for tech debt across system-design, security, and correctness, reusing the
  codemap to stay token-cheap; it does **not** duplicate `sysdesign` / `security-agent` /
  `dependency-auditor` — it surfaces issues and points deep ones at those specialists.
- **Reports only — never fixes.** It writes a **severity-ranked report** under `docs/tech-debt/`
  (modeled on the `docs/scaling-quest/PROGRESS.md` ledger), with file:line, severity, and a suggested
  fix per finding.
- **Routing:** findings are fed back into `/varsha`, which dispatches the chosen items to
  `backend-orchestrator` / `devops` / `sysdesign` etc. Finder **diagnoses**, `/varsha` **dispatches**,
  orchestrators **fix**. (A subagent cannot invoke `/varsha` itself — the hand-off is an explicit
  step, not something the finder does.)
