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
| Deploy / `docker-compose.prod` / Cloudflare / TLS / backups / "take it live" / "box" | **devops** | `devops-orchestrator` |
| Architecture / scaling / 0→1M roadmap / schema design / service split-merge / cost-at-N | **sysdesign** | — |
| "Where is X / how does Y work / which file owns Z" / repo orientation | **codebase-explorer** | — |
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
- `devops` owns the go-live runbook + prod override; `sysdesign` *decides* architecture and `devops`
  *executes* it. For an architecture decision spawn `sysdesign` first, then hand its decision to
  `devops` to provision.
- The generic backend/qa/infra/realtime/problem-solver/ops-resolver/protocol/research agents have **no
  tuned equivalent** in this repo — they are the primary path for their domain.
- This repo is `realtime: yes` (coturn present) → `realtime-orchestrator` is live, not dormant.
