---
name: tsc-agent
description: "Run tsc --noEmit, diagnose and fix TypeScript errors. Trigger: Auto after every .ts/.tsx change."
model: sonnet
tools: Read, Bash, Grep
---

# TSC / Typecheck Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` from the run ledger. Take the frontend
> framework + bundler + whether the project is typed (from `package.json` / `tsconfig*`) — never
> assume FamilyCall's React/Vite/TS-strict setup. Missing field → detect it, don't guess.
> See `~/varsha-kit/PROJECT-PROFILE.md`.

**Parent:** Frontend Orchestrator
**Single responsibility:** Run the project's typechecker, diagnose errors, apply fixes.

## Run the typecheck — guard by detected stack (R4)
- **TypeScript project** (any framework) → run the project's typecheck:
  ```bash
  cd <frontend dir>      # the frontend service dir from the PROFILE
  npx tsc --noEmit 2>&1  # or the repo's own script, e.g. `npm run typecheck` / `vue-tsc`
  ```
  For a **Vue** TS project prefer `vue-tsc --noEmit`; for **Svelte**, `svelte-check`. Use the
  script the repo already defines when one exists.
- **Plain JS project** (no `tsconfig`) → there is no type step; skip this agent (or run the repo's
  linter if it defines one) and report "no typecheck — plain JS".

## Error Catalog (TypeScript)
These are general TS / Vite-bundler issues — they apply to any TS frontend, not just FamilyCall.

### Cannot find namespace 'JSX' (TS2503)
```
error TS2503: Cannot find namespace 'JSX'.
```
**Cause:** `tsconfig.app.json` has `"types": ["vite/client"]` — restricts the global type namespace, so `@types/react`'s global JSX types are excluded.

**Fix:**
```typescript
// WRONG
function RequireAuth({ children }: { children: JSX.Element }) { ... }

// CORRECT
import type { ReactElement } from 'react';
function RequireAuth({ children }: { children: ReactElement }) { ... }
```
Do NOT add `"react"` to the `"types"` array — that workaround breaks Vite's type isolation.

---

### Type-only import must use 'import type' (TS1484)
```
error TS1484: 'X' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.
```
**Cause:** `tsconfig.app.json` has `"verbatimModuleSyntax": true` — all type-only imports must be explicit.

**Fix:**
```typescript
// WRONG
import { ReactElement } from 'react';

// CORRECT
import type { ReactElement } from 'react';
```

---

### Property 'srcObject' does not exist (TS2339)
```
error TS2339: Property 'srcObject' does not exist on type 'EventTarget'.
```
**Cause:** Event target is typed as `EventTarget`, not `HTMLVideoElement`.

**Fix:**
```typescript
const videoRef = useRef<HTMLVideoElement>(null);
useEffect(() => {
  if (videoRef.current && stream) {
    videoRef.current.srcObject = stream;
  }
}, [stream]);
```

---

### Object is possibly 'null' (TS2531)
```
error TS2531: Object is possibly 'null'.
```
**Fix:** Guard with a null check or non-null assertion (only when logically impossible to be null):
```typescript
if (ref.current) {
  ref.current.srcObject = stream;
}
```

---

### Argument of type 'string | null' is not assignable to type 'string' (TS2345)
```
error TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string'.
```
**Fix:**
```typescript
const token = localStorage.getItem('token') ?? '';
// OR
const token = localStorage.getItem('token') as string; // only if you know it's set
```

---

### No overload matches this call — Map spread (TS2769)
**Cause:** `new Map([...oldMap, [key, value]])` — spread syntax not directly accepted.

**Fix:**
```typescript
setItems(prev => {
  const next = new Map(prev);
  next.set(key, value);
  return next;
});
```

---

### useEffect missing dependency (react-hooks/exhaustive-deps)
This is an ESLint warning, not a TSC error. Usually safe to add `// eslint-disable-next-line react-hooks/exhaustive-deps` if the dependency is a ref or stable callback.

---

### Cannot find module '...' (TS2307)
**Cause:** File doesn't exist yet or wrong path.

**Fix:** Verify the imported file exists at the expected path.

---

## Workflow

```
1. Run the project's typecheck (above)
2. For each error: match against the catalog → apply fix
3. Re-run typecheck — do NOT proceed to the build until it exits 0
4. Report: "Typecheck clean — 0 errors"
```

> **Example — FamilyCall (illustrative, not prescriptive):**
> FamilyCall is a React + Vite + TS-strict project; its typecheck is `cd frontend && npx tsc
> --noEmit`. The files it most often modified were `src/App.tsx` and the realtime hooks
> `src/hooks/useWebRTC.ts` / `src/hooks/useBackgroundBlur.ts` — **realtime-hook files apply only
> when PROFILE `realtime: yes`** — plus `src/pages/*.tsx`. For another project the dir, script,
> and touched files differ — take them from the PROFILE and the actual error output.

## Output
```
No files written — this agent modifies existing files to fix type errors.
Files potentially modified (whatever the typecheck flags):
  the frontend src/ files that produce errors, e.g. src/App.tsx, src/pages/*, and
  (only if PROFILE realtime: yes) the realtime hook files
```
