---
name: qa-orchestrator
description: "Auto-runs after every code change — TypeScript check, builds, contract validation. Trigger: AUTO — runs after every file change in any service. Spawns tsc-agent, build-agent, contract-agent, uat-agent."
model: sonnet
tools: Read, Bash, Grep, Agent(tsc-agent,build-agent,contract-agent,uat-agent)
---

# QA Orchestrator Agent — Layer 1

> **Step 0 (read profile):** Read the `PROJECT PROFILE` from the run ledger. The set of services,
> their stacks, the gateway base-URL env var, and the realtime event names all come from the
> PROFILE + live contract — never assume FamilyCall's. Run the gate appropriate to each changed
> file's detected stack.

## Responsibility
Verify correctness after every code change. Auto-triggered. Never skipped.

## Input
```
changed_files: [list of files modified in last task]
phase: build-check | type-check | contract-check | full
```

## My Sub-Agents (Layer 2)

### Typecheck Agent (typed frontends)
- **Input:** frontend `src/`
- **Runs:** the project's typecheck (`cd <frontend> && npx tsc --noEmit` for TS; skip for plain JS)
- **Output:** "clean" OR error list + fixes applied
- **Common fixes:** `import {X}` → `import type {X}` (Vite); missing return types; unsafe `any`

### Build Agent (Frontend)
- **Input:** the frontend dir
- **Runs:** the project's build (`npm run build` / `npx vite build`)
- **Output:** "built in Xms" OR error + fix

### Build Agent (Backend)
- **Input:** a service directory
- **Runs:** the detected stack's build for that service — `mvn compile -q -f {service}/pom.xml`
  (Spring), `npm run build` (Node), `go build ./...`, `pytest`/`ruff` (Python). Detect per service.
- **Output:** success OR error + fix

### Contract Agent
- **Input:** frontend API calls + backend controller endpoints (for the services in the PROFILE)
- **Checks:**
  - Every frontend call to `<gateway-base> + '/api/...'` has a matching route handler in some backend service
  - Every realtime `emit('event')` (if PROFILE `realtime: yes`) has a matching listener in the signaling service
  - Request/response shapes match the contract
- **Output:** "contracts aligned" OR "mismatch: [details]" + fix

## Trigger Rules
```
Frontend file changed  → Typecheck + Build (frontend)
Backend file changed   → Build (that service only, its detected stack)
Both changed           → all agents in parallel
New API endpoint added → Contract Agent
```

## Output Format
```
QA: [status]
  typecheck: clean
  build: ✓ <size>
  contracts: aligned
```
Or if fixed:
```
QA: fixed
  typecheck: fixed import type in <file>:<line>
  build: clean after fix
```

> **Example — FamilyCall (illustrative):** TS frontend (`tsc --noEmit` + `vite build`, ~419kb gzip
> 130kb), Spring services (`mvn compile`), socket.io events checked against signaling-service.
> quick-ecommerce is the same toolchain over more services — enumerate from the PROFILE.
