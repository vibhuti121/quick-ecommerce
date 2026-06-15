# Varsha Routing — quick-ecommerce (MaLLADE storefront)

> Varsha reads this file at **Step 0c** (right after emitting the PROJECT PROFILE) and applies it
> **ahead of** the generic Domain Routing Table baked into the kit. This repo has hand-tuned project
> agents that beat the generic kit orchestrators for their domain — Varsha must prefer them.

## Routing rule

**If a domain below has a *Prefer* agent, spawn that agent first.** Spawn the *Generic fallback*
only when (a) no *Prefer* agent matches the domain, or (b) the *Prefer* agent reports the task is
out of its scope. Never spawn both for the same unit of work.

You spawn the **orchestrator / lead**, not its children — orchestrators hold their own
`Agent(<reportees>)` grant and spawn their specialists themselves. Pass each spawned agent only the
PROJECT PROFILE + the scoped task. Spawn independent domains in parallel.

## Table

| Domain | Prefer (tuned project agent) | Generic fallback |
|---|---|---|
| Frontend / storefront UI / catalogue / `.tsx` / CSS / component | **fe-lead** | `frontend-orchestrator` |
| Design direction for a UI surface (2-3 directions + preview, Figma) | **fe-design** | `design-agent` |
| Catalogue / commerce-UX / product surfaces / `api.ts`+`types.ts` over existing endpoints | **fe-commerce** | `domain-ux-agent` |
| Frontend a11y / perf / visual-QA / served-bundle proof / "QA-green ≠ done" | **fe-quality** | `frontend-qa-agent` |
| Deploy / `docker-compose.prod` / Cloudflare / TLS / backups / "take it live" / "box" | **devops** | `devops-orchestrator` |
| Architecture / scaling / 0→1M roadmap / schema design / service split-merge / cost-at-N | **sysdesign** | `architecture-agent` |
| "Where is X / how does Y work / which file owns Z" / repo orientation | **codebase-explorer** | `code-navigator` |
| Backend service / REST endpoint / entity / DB query / business logic | — | `backend-orchestrator` |
| QA gate / tsc / build broken / contract check (auto after every change) | — | `qa-orchestrator` |
| Infra / `.env` / OAuth client / secrets / cloud project setup | — | `infra-orchestrator` |
| WebRTC / signaling / coturn / TURN / ICE / peer video (realtime: yes) | — | `realtime-orchestrator` |
| "broken" / "error" / "not working" / diagnose-until-fixed loop | — | `problem-solver` |
| Goal blocked by unknown value(s) (cloud id, region, IP, realm, secret) | — | `ops-resolver-agent` |
| New integration / inter-service comms / REST vs WS vs gRPC vs MCP choice | — | `protocol-agent` |
| External research / library versions / API docs / pricing / best practices | — | `research-agent` |

## Notes

- `fe-lead` runs its own design-choice protocol and spawns fe-design / fe-build / fe-commerce /
  fe-quality — do **not** also spawn `frontend-orchestrator` for storefront UI.
- The spoke-level generic fallbacks (`design-agent`, `domain-ux-agent`, `frontend-qa-agent`) are
  **read-only researchers** and normally reached *through* their fallback parent (`frontend-orchestrator`
  / `qa-orchestrator`), not spawned directly — they only fire when `fe-lead`/`fe-quality` is absent or
  reports out-of-scope. They never write; the write-owner stays `fe-lead`/`fe-commerce` (tuned) or
  Varsha. `architecture-agent` is the generic mirror of `sysdesign` (decide-only); `code-navigator`
  mirrors `codebase-explorer` (map-first, read-only).
- `devops` owns the go-live runbook + prod override; `sysdesign` *decides* architecture and `devops`
  *executes* it. For an architecture decision spawn `sysdesign` first, then hand its decision to
  `devops` to provision.
- The generic backend/qa/infra/realtime/problem-solver/ops-resolver/protocol/research agents have **no
  tuned equivalent** in this repo — they are the primary path for their domain.
- This repo is `realtime: yes` (coturn present) → `realtime-orchestrator` is live, not dormant.
