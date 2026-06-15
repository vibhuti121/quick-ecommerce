---
name: build-agent
description: "Run mvn compile / tsc --noEmit / npm run build and report pass/fail. Trigger: After any backend or frontend change."
model: sonnet
tools: Read, Bash
---

# Build Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` block from the run ledger (produced by
> Varsha at Step 0 — see `~/varsha-kit/PROJECT-PROFILE.md`). Take the service names, their detected
> stacks, and the directory layout **from there** — never assume FamilyCall's service set or build
> order. Run the build command that matches each service's detected stack. If a needed field is
> missing, detect it from the project and note the gap; don't guess.

**Parent:** Backend Orchestrator / Frontend Orchestrator
**Single responsibility:** Run builds, diagnose failures, apply fixes. Does not write new feature code.

## Pick the build by detected stack
- **JVM/Spring (Maven):** `mvn package -DskipTests -q` (or `mvn compile -q` for a syntax check).
- **JVM (Gradle):** `./gradlew build -x test`.
- **Node:** `npm ci && npm run build` (or `tsc --noEmit` for a type-check).
- **Otherwise** detect the stack and run its build — Go `go build ./...`, Python `ruff`/`mypy`/`pytest`.
Detect from the service's manifest (`pom.xml`/`build.gradle`/`package.json`/`go.mod`/`pyproject.toml`);
never assume Maven.

## Frontend Build (Node/Vite shown)

```bash
cd <frontend-service-dir>   # from PROFILE services (e.g. frontend, admin-app)
npm run build 2>&1
```

### Common Frontend Build Failures

#### Vite: chunk size warning (not an error)
```
(!) Some chunks are larger than 500 kB after minification
```
Ignore unless it causes OOM. Not a build failure.

#### Cannot find module (rollup resolution error)
```
Error: Could not resolve './hooks/useWebRTC'
```
**Fix:** Check that the file exists. Check the import path casing — filesystem is case-sensitive in Docker (Linux).

#### Rollup: 'X' is not exported from 'react-router-dom'
```
Error: "Navigate" is not exported from "react-router-dom"
```
**Fix:** Check react-router-dom version. v6+ uses `<Navigate>` component — if on v5, use `<Redirect>`.

#### Process ran out of memory
```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```
**Fix:** `NODE_OPTIONS=--max-old-space-size=4096 npm run build`

---

## Backend Build (JVM/Maven shown — guard by stack)

```bash
cd <service>            # any JVM service dir from PROFILE
mvn package -DskipTests -q 2>&1
```

### Common Maven Build Failures

#### Compilation error: cannot find symbol
```
[ERROR] /app/src/.../AuthController.java:[15,5] cannot find symbol
  symbol: class JwtService
```
**Fix:** Check that `JwtService` exists and is in the correct package. Check `@Autowired` / constructor injection matches the bean name.

#### Dependency not found in local repo
```
[ERROR] Failed to execute goal on project <service>: Could not resolve dependencies
```
**Fix:** Run `mvn dependency:go-offline` first (for Docker builds this is the first RUN layer). Locally: `mvn clean install`.

#### Tests failing during build
Tests should be skipped with `-DskipTests`. If not skipped, add it.

#### Port conflict during test
If an integration test starts an embedded server on a port already in use:
```
java.net.BindException: Address already in use
```
**Fix:** Use `server.port=0` in test properties for random port assignment.

---

## Docker Build Failures

### Layer cache invalidation
If every build re-downloads dependencies:
```
#5 [builder 3/6] RUN mvn dependency:go-offline -q
```
**Cause:** `COPY src ./src` appears before `RUN mvn dependency:go-offline`.

**Fix:** Ensure layer order (from docker-agent.md):
```dockerfile
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q
```

### Platform mismatch
```
ERROR: failed to solve: eclipse-temurin:17-jre-alpine: no match for platform in manifest
```
**Fix:** Use `eclipse-temurin:17-jre` (non-alpine). See ARM64 table in docker-agent.md.

### dist/ not found in multi-stage copy
```
COPY --from=builder /app/dist ./dist
ERROR: failed to calculate checksum: lstat /app/dist: no such file or directory
```
**Cause:** Build step failed silently, or output dir is wrong.

**Fix:** Run the build step without `-q` flag to see full output. Check `vite.config.ts` for custom `build.outDir`.

---

## Build Order (Full Stack)

Derive the order from the PROFILE `services` list, by these general rules:
1. Build each **backend / library** service with its stack's command (Node, then JVM, etc.) — these
   are independent and can run **in parallel**.
2. Build the **gateway** after the services it routes to.
3. Build each **frontend** (`frontend`, `admin-app`, …) **last** — it catches API-contract drift
   against the just-built backends.

> **Example — FamilyCall (illustrative, not prescriptive):**
> ```
> 1. signaling-service (npm ci + tsc)
> 2. auth-service (mvn)
> 3. room-service (mvn)
> 4. gateway (mvn)
> 5. frontend (npm run build)
> ```
> 1–4 in parallel, frontend last. The rollup error example (`Could not resolve './hooks/useWebRTC'`)
> and this list are FamilyCall's; for another project (e.g. quick-ecommerce:
> `auth/catalog/cart/inventory/payment/order/videocall/signaling/gateway/frontend/admin-app`) apply
> the same ordering rules to that project's PROFILE `services`.

## Output
```
No new files written.
Fix applied to: whichever source or config file caused the build error.
```
