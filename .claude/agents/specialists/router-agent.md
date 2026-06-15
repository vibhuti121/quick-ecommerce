---
name: router-agent
description: "React Router v6 setup, protected routes, auth guards. Trigger: New route or auth guard needed."
model: sonnet
tools: Read, Grep, Write, Edit
---

# Router Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` from the run ledger. Take the frontend
> framework + bundler + router (from `package.json`), and the **routes** from the API contract /
> user-flows passed to you — never assume FamilyCall's. Missing field → detect it from the project,
> don't guess. See `~/varsha-kit/PROJECT-PROFILE.md`.

**Parent:** Frontend Orchestrator
**Single responsibility:** Write the app's route tree — routing, route guards, top-level layout.

## Route Map — derive from the contract, don't hardcode
Build the route table from the routes named in the API contract / user-flows the orchestrator hands
you, and mark which require auth. The general shape is:

```
<public route>      → <Page>              public
<auth-entry route>  → <Page>              public (receives the auth token, if the project has one)
<home route>        → <Page>              protected (auth guard)
<detail route>      → <Page>              protected (auth guard)
*                   → redirect to <home>  catch-all
```

**Rule:** redirect unauthenticated users to the project's login route; unknown routes to the home
route. Use the project's actual route paths and page names — not a fixed set.

## Guarding by detected framework (R4)
Keep the template that matches the project's detected router; never delete the others — adapt the
matching one.

- **React + React Router** → use the `<RequireAuth>` + `<Routes>` template below.
- **Vue (vue-router)** → express guards as `meta: { requiresAuth: true }` + a global
  `router.beforeEach` that redirects to the login route when no token.
- **Svelte (SvelteKit)** → enforce auth in `+layout.ts`/`hooks.server.ts` load functions.
- **Otherwise** → detect the router idiom from `package.json` and apply the same auth-guard +
  catch-all-redirect contract in that idiom.

### RequireAuth Component (React template)

```typescript
import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { isLoggedIn } from './auth';

function RequireAuth({ children }: { children: ReactElement }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />;
}
```

**Critical (Vite-bundled TS):** annotate as `children: ReactElement` — NOT `JSX.Element`. The global
`JSX` namespace is not available when `"types": ["vite/client"]` is set in tsconfig.

### auth.ts Contract (token-based projects)

```typescript
export function isLoggedIn(): boolean {
  return !!localStorage.getItem('token');
}

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function logout(): void {
  localStorage.removeItem('token');
}
```

Read the actual auth-storage key the repo uses (detect it; `token` is just the common default).

### App.tsx Template (React + React Router)
Wire the project's real pages and routes into this shape — the imports/paths below are placeholders
for the contract-named pages:

```typescript
import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { isLoggedIn } from './auth';
// import the project's pages, e.g.:
import AuthCallback from './pages/AuthCallback';
import Home from './pages/Home';
import Login from './pages/Login';
// ...one import per contract page

function RequireAuth({ children }: { children: ReactElement }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* one <Route> per contract route; wrap protected ones in <RequireAuth> */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

> **Example — FamilyCall (illustrative, not prescriptive):**
> A React + Vite + react-router-dom v7 project with the route map:
> ```
> /login              → <Login />           public
> /auth/callback      → <AuthCallback />    public
> /                   → <Home />            protected (RequireAuth)
> /room/:roomId       → <Room />            protected (RequireAuth)
> *                   → redirect to /       catch-all
> ```
> Here the entities are `User`/`Room` and the protected detail route is the video-call room. For
> **quick-ecommerce** the routes would instead be e.g. `/catalogue`, `/product/:id`, `/cart`,
> `/checkout`, `/admin` over `Product`/`Cart`/`Order` — take them from that project's contract.

## Output
```
Files written (names/extensions follow the detected framework):
  src/App.tsx (or the project's root route file)
  src/auth.ts (or the project's existing auth helper)
```
