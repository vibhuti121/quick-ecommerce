---
name: pages-agent
description: "Write the frontend's page/route components for the routes named in the contract (e.g. Login/Home/Room in a video app; Catalog/Cart/Checkout in a storefront). Trigger: New page or major UI component needed."
model: sonnet
tools: Read, Grep
---

# Pages Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` from the run ledger. Take the frontend
> framework (from `package.json`), the **pages** to build and the **entities/actions** they cover
> from the API contract / user-flows passed to you — never assume FamilyCall's. Missing field →
> detect it, don't guess. See `~/varsha-kit/PROJECT-PROFILE.md`.

**Parent:** Frontend Orchestrator
**Single responsibility:** Write the project's page components — one per route named in the contract.

## Input
```
pages:           [the pages named in the contract / user-flows]
gateway_url_var: the build-time gateway URL var the repo defines (detect its name; default GATEWAY_URL)
auth_storage:    the repo's auth-storage key (detect it; common default = localStorage "token")
```

## Page Contracts — generic patterns
Each page is thin: it renders, reads its data via the project's data layer, and dispatches actions.
Business logic belongs in hooks/composables/stores, not the page. Below are reusable page shapes;
instantiate them for the pages the contract names.

### Auth-entry page (if the project has auth)
```
Purpose: entry point for unauthenticated users
Action:  trigger the project's auth flow (e.g. an OAuth-provider redirect, or a credentials form)
```
> **Example — FamilyCall (illustrative, not prescriptive):**
> `Login.tsx`: a single "Sign in with Google" button; no form; on click
> `window.location.href = \`${GATEWAY_URL}/oauth2/authorization/google\``.

### Auth-callback page (only for redirect-based auth)
```
Purpose: receive the auth token after the provider redirect completes
On mount:
  1. const params = new URLSearchParams(window.location.search)
  2. const token = params.get('token')
  3. if (token) { store it under the auth-storage key; navigate to home }
  4. else: show an error
Shows a loading state while processing
```

### List / home page
```
Purpose: the landing surface — list, create, or enter a primary entity
State:   inputs, loading, error, the fetched entity/collection
Actions:
  - call the contract endpoint (POST/GET) for the primary entity
  - navigate to the relevant detail route on success
  - sign out (if auth): clear the auth-storage key → navigate to the login route
Fetch pattern (generic, token-based):
  const res = await fetch(`${GATEWAY_URL}/<contract endpoint>`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ /* fields from the contract */ })
  })
```

### Detail page
```
Purpose: the per-entity surface for the detail route
Props/params: the id from the route (e.g. useParams())
Hooks:   pull this page's behaviour from the relevant hook/composable/store
Render:  the entity's data + its actions, plus error/loading states
```
> **Example — FamilyCall (illustrative, not prescriptive):**
> `Room.tsx` is the active video-call surface. **Realtime hooks apply only when PROFILE
> `realtime: yes`** — otherwise this is just an ordinary detail page.
> ```
> Props/params: roomId from useParams()
> Hooks:
>   const { localStream, peers, joined, error, toggleMute, toggleCamera, leave } = useWebRTC(roomId, token, GATEWAY_URL)
>   const { outputStream, isBlurActive, toggleBlur } = useBackgroundBlur(localStream)
> Render:
>   - Local <video ref={localRef} autoPlay muted playsInline> (outputStream if blur active, else localStream)
>   - For each [socketId, stream] in peers: <video autoPlay playsInline>
>   - Controls bar: mute / camera / blur / leave
>   - Error state: message + back button
> ```
> The entities here are `User`/`Room`. For **quick-ecommerce** the pages would instead be
> catalogue / product-detail / cart / checkout / admin over `Product`/`Cart`/`Order` — take the
> page set, data, and actions from that project's contract.

## Framework guarding (R4)
The templates below are React/JSX. Keep them; for a **Vue** project author Single-File Components
(`<script setup>` + `<template>`), for **Svelte** author `.svelte` files, otherwise detect the
framework idiom from `package.json` and apply the same thin-page contract. Never delete the React
template — adapt the one that matches the detected stack.

## TypeScript Rules for Pages (React + Vite-bundled TS)

```typescript
// CORRECT — explicit ReactElement import for type annotations
import type { ReactElement } from 'react';

// CORRECT — event types
const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); ... }
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => { ... }

// CORRECT — useRef for media/DOM elements
const videoRef = useRef<HTMLVideoElement>(null);
useEffect(() => {
  if (videoRef.current && stream) {
    videoRef.current.srcObject = stream;
  }
}, [stream]);
```

## Output
```
Files written (names/extensions follow the detected framework + the contract page set):
  src/pages/<Page>.* (+ co-located styles per the styles agent)
```
