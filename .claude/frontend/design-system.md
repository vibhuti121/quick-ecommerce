# MaLLADE Frontend — Design System & Shared Brain

> This is the **single source of truth** for the MaLLADE storefront frontend ecosystem — the
> frontend equivalent of `~/.claude/coo/plan.md`. **Every `fe-*` agent READS this first.**
> Only **`fe-lead`** WRITES decisions back (the Decisions Log at the bottom). Specialists propose;
> the lead records. If this file and the code disagree, the **code wins** — update this file.

---

## 0. What/where (ground truth)
- **Repo:** `/Users/vibhutiraman/code/quick-ecommerce` · frontend at `frontend/` (the storefront SPA).
- **Stack:** React **18.3.1** + Vite **5.4.11** + TypeScript **5.6.3** (strict) + `motion` **v12**
  (the framer-motion successor). Hand-written CSS in `frontend/src/index.css` (no Tailwind, no CSS-in-JS).
- **Fonts:** self-hosted via `@fontsource` imported in `frontend/src/main.tsx` — Inter 400/500,
  Poppins 600/700. **No runtime CDN.** Adding a weight = add the `@fontsource/...` import.
- **QA gate:** `cd frontend && npm run build` (tsc strict + vite) must be clean — zero TS errors.
- **Container truth:** `npm run build` only proves source compiles. A feature is NOT verified until the
  frontend **container is rebuilt** and the **served bundle is grepped** for the change:
  `docker compose up -d --build frontend gateway` then
  `docker compose exec -T frontend grep -rao "<marker>" /usr/share/nginx/html/assets | head`.
  Gateway serves the SPA same-origin at `https://127.0.0.1:8443/` (B1 containerized frontend).
- **Branch note:** verify branch artifacts before assuming — some branches lack the containerized
  frontend or the MaLLADE seeds (see memory `search-branch-divergence`).

---

## 1. Color tokens (the `:root` contract — `frontend/src/index.css`)
**Never invent hex. Never emit Tailwind classes. Always reference `var(--token)`.** The palette is
warm cream + honey/litchi (replaced the old indigo SaaS look).

| Token | Value | Role |
|---|---|---|
| `--honey` | `#c8860e` | primary brand / honey |
| `--honey-dark` | `#a66e07` | honey hover/pressed |
| `--litchi` | `#d64c5c` | secondary brand / litchi (the fruit) |
| `--litchi-dark` | `#b83b4a` | litchi hover/pressed |
| `--marigold` | `#f4b942` | warm highlight / badge accent |
| `--forest` | `#2d5016` | trust/success green (GI/lab/success) |
| `--accent` / `--accent-dark` | `= honey` | brand accent — 30+ consumers; maps to honey |
| `--accent-rgb` | `200, 134, 14` | honey, for `rgba()` focus rings / glows |
| `--bg` | `#faf8f5` | page background (cream) |
| `--bg-alt` | `#f3f7f2` | alternating section bg (sage) |
| `--surface` | `#ffffff` | cards / drawers / modals |
| `--text` | `#3d3d3d` | body text (warm charcoal) |
| `--muted` | `#6b7280` | secondary text |
| `--border` | `#ece7df` | warm-tinted hairline |
| `--danger` | `#dc2626` | errors |
| `--success` | `#2d5016` | success (= forest) |
| `--radius` | `14px` | default corner radius |
| `--shadow` | `0 4px 16px rgba(61,45,20,.08)` | resting card shadow |
| `--shadow-lg` | `0 12px 40px rgba(61,45,20,.16)` | lifted/hover/modal shadow |

**Contrast:** all badge/text pairings must pass **AA**. honey-on-cream and litchi-on-cream are
borderline for small text — use `--text`/`--forest` for small copy, reserve brand hues for fills,
icons, and ≥18px/bold.

---

## 2. Type system
- `--font-display`: `'Poppins', system-ui, …` — headings, brand voice (weight 600/700).
- `--font-body`: `'Inter', system-ui, …` — body, UI, controls (weight 400/500).
- Global `h1/h2/h3/.display` get Poppins 700 + `--text` + line-height 1.2 — but **only the family/
  weight/colour**, NOT large sizes (protects compact drawer/card titles).
- **Large display sizes are opt-in** via utility classes — use these in storytelling sections only:
  - `.display-1` 3.5rem/1.08 · `.display-2` 2.25rem · `.display-3` 1.5rem.
  - Do **not** put display sizes on a bare `h1/h2/h3` — add the `.display-*` class instead.

---

## 3. Motion vocabulary (`motion` v12, `motion/react`)
- Library import: `import { motion, useReducedMotion, useScroll, useTransform, type Variants } from 'motion/react'`.
- **Spring is the house style:** `{ type: 'spring', stiffness: 260, damping: 26 }` for card/element
  entrances; stagger children at `0.12`. Entrances rise from `y: 24, opacity: 0`.
- **Scrollytelling:** `useScroll({ target: ref, offset: ['start end','end start'] })` →
  `useTransform` onto scale/y/opacity (see `HoneyTeaser`).
- **a11y is MANDATORY, two layers — both required:**
  1. Global `@media (prefers-reduced-motion: reduce)` in `index.css` collapses CSS keyframes/transitions.
  2. **Every** motion component ALSO gates its JS-driven `useScroll`/`useTransform`/tilt behind
     `useReducedMotion()` — the CSS media query CANNOT stop motion-value inline transforms, so JS
     gating is not redundant, it is required. Feed static identity transforms when `reduce` is true.
- **Pointer-aware:** 3D-tilt / parallax only on **fine pointers** (`@media (pointer: fine)` /
  feature-checks) — never on touch/coarse. Target **60fps** on hover/filter reflow.

---

## 4. Honey = the hook, NEVER buyable (INVARIANT — do not break)
- `frontend/src/lib/comingSoon.ts`: `isComingSoon(p)` ⟺ `category === 'honey'`; `HONEY_IMAGE =
  '/updates/honey.jpg'` (the real MaLLADE jar — never a placeholder/`product.imageUrl`).
- Honey shows a **Coming Soon** badge + routes to `NotifyForm`/`ComingSoonModal`/`HoneyTeaser`, never
  add-to-cart. Card, modal, teaser, and carousel ALL feed **one** launch list:
  `saveNotify('honey', …)` (localStorage) + best-effort `notify('honey', …)` → PUBLIC
  `POST /api/catalog/notify`.
- Any new add-to-cart / quick-add surface MUST preserve this gate.

## 4b. Checkout gate (INVARIANT — do not break)
- Checkout requires a **non-guest** account (order-service 403s `guest-` tokens). Guest browse/cart is
  free; cart carries over on sign-in. UI shows "Sign in to place your order." Preserve on any cart change.
- Video-call gating (logged-in customers only) is also invariant — don't touch `VideoCall/` for catalogue work.

---

## 5. Component inventory (REUSE — don't recreate)
Existing `frontend/src/components/` (read the file before re-building its behavior):
| Component | Role |
|---|---|
| `Header.tsx` | top nav + search entry + cart/profile/auth triggers |
| `Hero.tsx` | kinetic litchi→honey headline + parallax (storytelling) |
| `TrustBand.tsx` | GI-Tagged · Lab-Tested · Farmer-Direct strip (from provenance) |
| `ProductGrid.tsx` | catalogue grid; `LayoutGroup` + `AnimatePresence` popLayout reflow |
| `ProductCard.tsx` | grid card; 3D-tilt on fine pointers only; honey→ComingSoon routing |
| `ProductDetail.tsx` | product drawer (provenance, variants, recommendations row) |
| `HoneyTeaser.tsx` | scrollytelling honey "coming soon" + NotifyForm (id=`honey-teaser`) |
| `SocialProof.tsx` | curated soft-launch voices (no fake star/verified claims) |
| `SearchBar.tsx` | search box (debounced) → OpenSearch `/products/search` |
| `CartDrawer.tsx` | cart slide-over |
| `ProfileDrawer.tsx` | account/profile slide-over |
| `AuthModal.tsx` | login/register modal |
| `NotifyForm.tsx` | shared phone(req)+email(opt) launch-list capture |
| `NotifyModal.tsx` / `ComingSoonModal.tsx` | honey teaser popups (reuse `.overlay`+`.product-modal`) |
| `UpdatesCarousel.tsx` | updates/teasers carousel |
| `VideoCall/` | gated 3-person calling (do NOT touch for catalogue work) |
- Shared CSS primitives: `.overlay` / `.overlay-open`, `.product-modal`, `.icon-button`, `.display-*`.

---

## 6. Catalogue data available (surface it — backend already serves it, no backend change needed)
`frontend/src/api.ts` + `types.ts`:
- **browse** `GET /api/catalog/products?size=200` — full grid.
- **search** `GET /api/catalog/products/search?q=&size=50` — OpenSearch, typo-tolerant; ILIKE-degrades.
- **by-id** `GET /api/catalog/products/{id}`.
- **recommendations** `GET /api/catalog/products/{id}/recommendations?size=8` — hybrid (co-purchase +
  content), **never 503s**, PUBLIC.
- **notify** `POST /api/catalog/notify` — PUBLIC launch-list capture.
- **Per-product fields carried but under-surfaced on the grid:** `provenance` (farm/origin/GI/lab/
  batch), `variants` (list), `sku`, `category` (a string, but groupable for a category rail).
- **The catalogue is static by *presentation*, not by data.** Catalogue v2 surfaces this richness
  **client-side over these existing endpoints** — no new backend route in scope.

---

## 7. The Design-Choice Protocol (what makes this a "lead", not a one-shot builder)
For **each UI surface** we change, run this loop — this is the core ritual of the ecosystem:
1. **`fe-design`** produces **2–3 distinct directions** (not variations of one) — each with: a name,
   a one-line rationale, explicit tradeoffs, and a **preview** (a Figma frame if Figma MCP is
   connected; otherwise an in-code preview + a `capture.mjs` screenshot). Grounded in §1–3 tokens +
   the brand brief + current premium-food/e-commerce research (WebSearch).
2. **`fe-lead`** surfaces the directions to the founder via **`AskUserQuestion` with previews on**
   (one question per surface). The lead recommends one (first option, "(Recommended)").
3. **Founder picks.** The lead records the choice + date + rationale in the **Decisions Log** below.
4. **`fe-build`** / **`fe-commerce`** implement **only the chosen** direction.
5. **`fe-quality`** verifies (QA gate → container grep → screenshots → Lighthouse → a11y/motion).
- **No production code before a direction is chosen** for a surface. Design choices are the point.

---

## 8. Figma integration (two-way; founder enables once; degrades gracefully)
- **Owner:** `fe-design`. **Status:** the Figma Dev Mode MCP is **NOT yet connected** on this machine
  (one-time founder action — see §Phase 1 of the plan). Until then, the protocol falls back to
  in-code previews + `capture.mjs` screenshots. **Figma is never a hard blocker.**
- **When connected**, `fe-design` may use Figma MCP tools (loaded via `ToolSearch` at run time):
  `get_variables` (pull design tokens/frames), `get_code`, `get_image`, and push proposed UI back.
- **Token discipline (hard rule):** Figma variables → **map to the existing `:root` tokens in §1**.
  Never emit Tailwind utility classes; never paste raw hex; reuse the components in §5. If a Figma
  frame needs a token we don't have, the lead decides whether to add a `:root` var (logged in §10) —
  specialists don't add tokens unilaterally.
- **Confirm the exact MCP registration command against Figma's current setup doc at enable time** —
  the official path has shifted between `claude mcp add …` and a Figma plugin install. Don't hardcode.

### 8a. Design-platform decision — Penpot evaluated, MCP write-loop NO-GO (2026-06-12)
- **Why Penpot was evaluated:** the founder's Figma seat is Starter/View → **6 tool-calls/MONTH**
  (reads count) — too tight for an iterate-against-it loop. Penpot self-host has **no rate limits**
  and an official MCP, so it was spiked as `fe-design`'s platform.
- **Outcome (see `~/penpot-eval/GO-NOGO-REPORT.md`):** self-hosted Penpot transport/token-auth/
  `tools/list` + native DTCG token import all **work**. But the MCP **`execute_code` write loop is a
  NO-GO** — the non-headless browser-plugin bridge flaps every ~33 s, **loses its token on every
  reconnect**, and writes time out on a zombie socket. Immature; not reliable for an agent loop (self-hosted).
- **DECISION (founder, 2026-06-12):** **do NOT drive Penpot live via MCP.** Use self-hosted Penpot
  **only for native token import** (our `:root` set → `~/penpot-eval/mallade-tokens.json`, valid DTCG),
  and keep `fe-design`'s iteration on the **existing in-code previews + `capture.mjs` screenshots**
  path (§9). This is the no-rate-limit design loop, today, without the flaky bridge.
- **Revisit trigger (not now):** if the live-authoring loop is wanted, first test the write against
  **Penpot cloud** (`design.penpot.app`, the MCP's tested target) to learn if the flap is
  self-host-specific (possibly an nginx WS-proxy / token-on-reconnect fix) or inherent. Figma stays
  the documented fallback for one-shot static snapshots (writes are rate-exempt).

---

## 9. Verification ladder (QA-green is necessary, NOT sufficient)
1. `cd frontend && npm run build` clean (tsc strict + vite).
2. **Container truth:** rebuild `frontend gateway`, grep served bundle for the new marker (see §0).
3. **Visual:** `frontend/capture.mjs` (Playwright — **NOT ours; run in place, do NOT commit**)
   screenshots of grid / filtered / search / detail; Lighthouse target **90+ perf / 100 a11y**.
4. **Invariants:** any cart/quick-add change → re-verify honey-never-buyable (§4) + checkout gate (§4b).
5. **a11y/motion:** OS reduce-motion collapses all animation; every control keyboard-reachable with
   visible focus; AA contrast on all badge/text pairings.
6. **Regression:** `scripts/fullstack-smoke.sh` green — discount known cold-start 503s
   (videocall/opensearch); browse asserts use `?size=200` (memory: smoke-browse-default-page-gotcha).

---

## 10. Decisions Log (append-only; ONLY `fe-lead` writes here)
> Format: `YYYY-MM-DD · <surface> · chosen: <direction> · why: <one line> · [Figma: <link>]`
- _2026-06-10 · ecosystem scaffold created (this file + fe-lead + fe-design/build/commerce/quality +
  refreshed /frontend command). No surface decisions yet — Catalogue v2 design-choice rounds pending
  (run in a future session; new agents aren't loadable the session they're authored)._
- 2026-06-12 · Catalogue v2 · Discovery · chosen: **Sticky toolbar** · why: category pills + sort +
  collapsible GI/Lab/price filters in one sticky bar; best fit for a small SKU count, mobile-first,
  keeps the single animated grid + its reflow. New `CatalogControls.tsx`, all client-side over `browse?size=200`.
- 2026-06-12 · Catalogue v2 · Product card · chosen: **Editorial provenance** · why: provenance becomes
  the hero — GI ✓ + Lab-tested ✓ trust strip under the image, origin + farm prominent, price/CTA pinned
  bottom. GI badge moved off the image overlay into the trust strip. Honey card behavior unchanged.
- 2026-06-12 · Catalogue v2 · Search · chosen: **Inline live filter** · why: founder picked the simplest —
  search folded into the sticky toolbar, filters the visible grid live client-side (substring over
  name/desc/origin/category), no dropdown. TRADEOFF (founder-consented): drops the OpenSearch server
  round-trip + typo-tolerant ranking from the storefront grid; `/products/search` endpoint + `searchProducts()`
  retained in api.ts (not deleted), just no longer wired to the grid. Search box relocated header → toolbar.
- 2026-06-12 · Catalogue v2 · Detail · chosen: **Zoom + quick-add** · why: click-to-zoom lightbox on the
  single hero image (no fake multi-image gallery — data has one imageUrl), a quantity stepper + an
  informational grade picker next to Add-to-cart, plus a home "Recommended for you" row seeded by
  last-viewed SKU (localStorage) over the PUBLIC recommendations endpoint. INVARIANT kept: a variant is
  never a cart-line key (grade picker is indicative-price only; add-to-cart always ships the standard pack).
- 2026-06-12 · Catalogue v2 · **BUILD COMPLETE & VERIFIED** · all four surfaces implemented + container-truth
  confirmed: served bundle (`index-*.js` + `index-*.css`) greps positive for `catalog-controls` / `cc-pill` /
  `home-recs` / `image-lightbox` / `grade-select` / "Recommended for you" after `docker compose up -d --build
  frontend gateway`. `npm run build` clean (CSS 47→52 kB). Invariants re-checked LIVE: honey-not-buyable holds
  (honey SKUs category=honey → isComingSoon → Notify-only card); guest→login checkout gate holds (order-service
  → 403 "Please sign in to place an order" on a fully-valid guest payload). New files: lib/recentlyViewed.ts,
  lib/provenance.ts, components/CatalogControls.tsx, components/RecommendedRow.tsx. README storefront section synced.
- 2026-06-12 · honey-coming-soon · chosen: **Direction A "The Drop" no-date variant + real-count-hidden-until-≥25**
  · why: native Gen-Z drop/scarcity framing without committing to a launch date we can't yet hit; honest
  count, no fabricated social proof. Applied across all 3 honey touchpoints (ProductCard honey variant,
  HoneyTeaser, ComingSoonModal). Launch-date seam: `HONEY_LAUNCH_DATE` nullable constant in
  lib/comingSoon.ts — null ⇒ no-date "The Drop" copy (built this pass); set ⇒ countdown-clock path
  (stubbed conditional, full clock styling deferred). Count: `honeyInLineCount()` reads the REAL launch
  list + applies the ≥25 floor (renders nothing below it / when unavailable) — NO hard-coded number.
  FOLLOW-UP (out of /frontend scope, backend): the only list-read endpoint today is ADMIN-gated
  `GET /api/catalog/admin/notify`; a PUBLIC `GET /api/catalog/notify/count?topic=honey` is needed before
  a live in-line count can show to anonymous shoppers — until then the count stays hidden (honest).
- 2026-06-13 · Fruit quiz ("Find your MaLLADE match") · Phase-0 waitlist centerpiece · chosen: **HYBRID**
  (founder pre-resolved the design choice) · B grid-multiselect = BACKBONE (tap-to-collect fruit grid,
  every card a real `<button aria-pressed>`), C story-stepper = SOUL (per-fruit "vs your usual" nugget reveal
  — taste/rarity LEAD + compliance-gated cited nutrition), A swipe-deck = FLOURISH (shareable persona result
  card only — native share + retake, NO drag/gesture layer). 1 "vibe" question feeds persona. Capture reuses the
  EXISTING NotifyForm → ONE `POST /api/catalog/notify` with `{topic:'quiz', name, source:'quiz', fruits:[slugs]}`
  (backend V6 fans out server-side — no client loop). Honey selectable = demand signal via honey notify list,
  NEVER a cart. Nugget content is a per-fruit data object (placeholder copy ships now; signed-off copy swaps as a
  data-only edit). New: lib/quizFruits.ts (derives fruit set+slugs from live catalogue, FALLBACK set), notify()
  extended with optional `NotifyExtra {name,source,fruits}` (6-arg honey callers byte-identical).
- 2026-06-13 · TOKEN ADDED (fe-lead call, logged) · `--litchi-rgb: 214, 76, 92` in `:root` · why: the quiz litchi
  card reveal/persona-ribbon needs a soft litchi wash via `rgba(var(--litchi-rgb), .08)`; mirrors the existing
  `--accent-rgb` (honey) convention exactly — more flexible than a fixed tint hex. fe-design proposed; I chose the
  -rgb variant over a fixed `--litchi-tint` for opacity flexibility + symmetry.
- 2026-06-13 · Fruit quiz · **BUILD COMPLETE & VERIFIED** · hybrid shipped: grid backbone + nugget soul + persona
  result + reused NotifyForm (extended non-breaking with optional `collectName`/`onNotifyWithName`; the 3 honey
  callers byte-identical). Mounted between `<TrustBand/>` and `<main id="catalog">`. New: components/FruitQuiz.tsx,
  lib/quizContent.ts, lib/quizFruits.ts; edited api.ts (NotifyExtra), NotifyForm.tsx, App.tsx, index.css. Container
  truth CONFIRMED: served bundle greps positive for `fruit-quiz` (CSS+JS) + "Find your MaLLADE match" (JS) after
  `docker compose up -d --build frontend gateway`. `npm run build` clean (CSS 52→58 kB). Invariants re-checked LIVE:
  honey-not-buyable holds (0 add-to-cart in quiz; honey pick = notify-only demand signal via the server fan-out;
  HONEY_IMAGE forced; "Forest Wanderer" persona for honey); checkout-gate untouched (no cart/order code). a11y: AA
  contrast FIXED on a fe-quality finding — selected litchi/mango fill → `--litchi-dark` (5.2:1), selected honey label
  → `--honey-dark` + 1.17rem large-text (3.98:1 ≥3:1), Coming-Soon badge → `--text` on marigold (5.6:1); two-layer
  reduced-motion + `<button aria-pressed>` grid + aria-live basket + role=status nugget + fieldset/legend vibe Q.
  CONTENT IS PLACEHOLDER/DRAFT (data-driven in quizContent.ts) — founder must SIGN OFF the per-fruit nuggets +
  nutrition cites (USDA FoodData Central; honey = taste-only, no health claim) + personas before public go-live;
  signed copy swaps as a data-only edit. README storefront section synced. UNCOMMITTED (founder commits when he asks).
- 2026-06-13 · Taste Match **V2** (founder-score prototype, LOCAL ?taste-match, NOT deployed) · chosen:
  **A+B HYBRID** (founder pre-resolved, after scoring V1 1/10 "boring, not Tinder/Snap, weak imagery") ·
  why: base = **A "Dark Editorial Gloss"** (near-black premium gradient, ONE full-bleed real fruit photo
  per card, gold hairline = --marigold, big Poppins display, quiet-luxury adult tone) so it never tips
  childish; inject **B "Vivid Pop-Juicy"** energy ONLY on the high-moments (bold `WANT IT!`/`NAH` swipe
  stamps, "Top 3% Rare" scarcity badge, loud shareable Snap-sticker persona reveal with "challenge a
  friend"). NOT pure-A (too calm) and NOT pure-B (too young). Decision 1 = YES render the 9:16 persona
  reveal to a downloadable/shareable **PNG** (html-to-image — added dep) = real screenshot-and-post viral
  loop, not text-only navigator.share. Decision 2 = YES full **elastic card-stack swipe physics**
  (peek-behind next card + spring throw on release + LIKE/NOPE drag-opacity) via motion v12, gated by the
  two-layer reduced-motion kill-switch (static WANT/NAH button fallback). Scoring logic in lib/tasteMatch.ts
  UNCHANGED; added imageUrl + microFact per fruit + share-card copy + rarity % per persona. Imagery =
  PROTOTYPE-ONLY Unsplash/Pexels in /public/taste-match-proto/ (must swap to owned MaLLADE photography for
  prod). PROTOTYPE_MODE=true → notify STUBBED (0 real POSTs). Honey = persona flavor only, NEVER buyable.
  Throwaway design-round artifacts (proto/TasteMatchDirections.tsx, .tm2-proto CSS block, ?tm-directions
  gate, capture-tm-directions.mjs) removed after promoting the dark tokens. UNCOMMITTED, never on mallde.in.
- 2026-06-13 · TOKEN ADDED (fe-lead call, logged) · promoted the A "Dark Editorial Gloss" dark tokens from
  the scoped `.tm2-proto` block into a **scoped `.taste-match` / `.tm-standalone` block** (NOT global :root —
  these dark values are prototype-local and would clash with the cream storefront): `--tm-bg #0b0a10`,
  `--tm-bg-2 #16121c`, `--tm-ink #f6f1ea`, `--tm-ink-dim`, `--tm-card #1c1722`, `--tm-hairline` (gold from
  --marigold), `--tm-scrim`. Warm brand hues --honey/--litchi/--marigold stay the accents. Rationale: keep
  the dark palette confined to the local-only prototype surface so it never leaks into the live storefront.
- 2026-06-13 · Taste Match V2 · **BUILD COMPLETE & VERIFIED** (local-only prototype, NOT committed/deployed) ·
  hybrid shipped: dark-editorial swipe DECK (motion v12 elastic drag + peek-behind + WANT IT!/NAH stamps on
  drag) + loud B-energy persona reveal → downloadable/shareable **9:16 PNG** via html-to-image@1.11.13 (added
  dep) off an off-screen 1080×1920 capture node (navigator.canShare files → native share, else `<a download>`
  + text/clipboard fallback). New `DECK = DUELS.map(d=>d.left)` (6 image-backed cards; right-swipe=WANT-IT vote
  → picks → resolveTasteResult UNCHANGED, demand signal flows as before); added imageUrl+microFact per fruit,
  rarity%+shareLine per persona. PROTOTYPE_MODE=true → notify STUBBED (0 real POSTs). Files: lib/tasteMatch.ts,
  components/TasteMatch.tsx (rewritten), index.css (.taste-match/.tm-* block rewritten in dark hybrid; dark
  tokens scoped to .tm-standalone/.taste-match, NOT :root), App.tsx (removed IS_TM_DIRECTIONS gate+import).
  Cleanup DONE: deleted proto/TasteMatchDirections.tsx, .tm2-proto CSS block, capture-tm-directions.mjs;
  left proto-shots/ + public/taste-match-proto/. QA: `npm run build` clean (CSS 66 kB); two-layer reduced-motion
  ✓ (useReducedMotion swaps SwipeCard→static WANT IT!/NAH buttons; CSS @media layer kept); keyboard ✓ (all
  controls Tab-reachable, gold focus rings); honey-not-buyable ✓ (honey = swipe card demand vote + Golden
  Forager persona only, ZERO add-to-cart); checkout-gate untouched. a11y FIXED on fe-quality findings: the two
  marigold-on-photo labels (.tm-card-eyebrow, .tm-sharecard-rare) got dark backing pills bumped to rgba(11,10,16,
  0.82) → worst-case-over-pure-white 6.77:1 (clears AA small-text 4.5:1; minifies to #0b0a10d1 in dist). popLayout
  dev-warning cleared via forwardRef on SwipeCard/StaticCard (kept mode="popLayout" to preserve swipe-throw feel).
  Screenshots in proto-shots/v2-*.png. DEFERRED (honest): prototype imagery is Unsplash/Pexels placeholder (swap
  to owned MaLLADE photography before any non-prototype use); continuous drag-coupled peek-scale not wired (peek
  reveals on throw — reads as a stack). Founder plays + scores V2 next (2nd founder-taste data point).
- 2026-06-12 · design-platform · chosen: **self-hosted Penpot for token import + in-code previews for
  iteration** (NOT Penpot MCP live-authoring) · why: spike proved the self-hosted MCP `execute_code`
  **write loop is a NO-GO** — browser-plugin bridge flaps ~33 s + drops token on reconnect → writes time
  out (full evidence in `~/penpot-eval/GO-NOGO-REPORT.md` + §8a). Token bridge (`mallade-tokens.json`,
  DTCG) imports natively, no MCP needed. Penpot-cloud write test is the revisit path if live-authoring is wanted.
- 2026-06-13 · Taste Match **V4 JUICE-PASS** (local-only prototype, ?taste-match, NOT committed/deployed) ·
  direction LOCKED (A+B hybrid from V2 — NO new design-choice round) · founder scored V3 4.5/10 and named 5
  drags; all 5 shipped: **(1) REAL continuous-drag physics** — top card follows pointer 1:1 (motion v12
  drag="x" + useMotionValue x → useTransform rotate/stamp-opacity + a live like/nah COLOUR TINT wash + a
  stamp scale-pop; `is-armed` glow the instant the card crosses SWIPE_THRESHOLD; spring-throw past threshold,
  snap-back under). **(2) Juicier climax** — rarity number COUNTS UP 0→rarityPct (animate(), easeOutExpo),
  restrained gold SHIMMER sweep + tasteful SPARK burst on the persona card (CSS keyframes, tokens-only).
  **(3) Mid-deck social-proof FLASH** — brief "X% of swipers also wanted this" pill after select swipes
  (indices {2,5}); numbers are STATIC/ILLUSTRATIVE (SOCIAL_PROOF map + code comment + swap-to-real seam),
  pointer-events:none so never blocks a swipe, auto-dismiss ~1.9s. **(4) Fruit↔photo correctness** — curated
  premium stock, every imageUrl matches its fruit, DECK deduped by BOTH name AND imageUrl so round-2 cards
  never reuse a round-1 photo (PIC seam + SWAP-TO-OWNED-PHOTO comments in tasteMatch.ts; old set in
  public/taste-match-proto/_v3-backup/). **(5) Dynamic NATURAL copy** — `composeRevealCopy(wants, skips,
  persona)` writes the reveal descriptive + share line FROM the player's real picks (names the fruits chased
  vs waved off, varied via a seeded pick off the swipe pattern → stable per run, different across runs);
  reveal stays staggered. Source string bumped → `'taste-match-v4'`. PROTOTYPE_MODE=true → notify STILL
  STUBBED (0 real POSTs; only fetch = html-to-image data-URL→blob). Card label→image VERIFIED: Alphonso
  Mango→mango.jpg, (round-2 mango framing)→mango2.jpg, Litchi→litchi.jpg, Shahi Litchi→litchi2.jpg,
  Mangosteen→mangosteen.jpg, Guava→guava.jpg, Pomegranate→pomegranate.jpg, Wildflower Honey→honey.jpg,
  (round-2 honey framing)→honey2.jpg — all serve HTTP 200, no mismatch. QA: `npm run build` clean (CSS 71 kB);
  two-layer reduced-motion ✓ VERIFIED via Playwright (reduce → StaticCard only, 0 swipe layer; count-up shows
  FINAL value immediately; 0 shimmer/spark spans rendered + @media kills keyframes as layer two); honey-not-
  buyable ✓ (honey = swipe demand vote + persona flavor only, ZERO cart/checkout/api in TasteMatch.tsx);
  checkout-gate untouched. Edits: lib/tasteMatch.ts (PIC + corrected DUELS + dedup-by-image DECK + FRUIT_WORD +
  composeRevealCopy), components/TasteMatch.tsx (drag tints/armed/scale, social-proof flash, RarityCountUp,
  composed copy wiring, shimmer/spark, v4 source), index.css (tints/armed/social-proof/shimmer/sparks/
  reveal-copy/count-up + reduced-motion layer two). Screenshots proto-shots/v4-*.png (intro, deck, mid-drag,
  social-proof, reveal-climax, capture-open, reduced-deck, reduced-reveal). DEFERRED (honest): imagery is still
  curated Unsplash/Pexels stock (swap to owned MaLLADE photography before any non-prototype use); social-proof
  numbers are illustrative until a real demand-aggregate endpoint exists. Founder plays + scores V4 next.
- 2026-06-13 · Taste Match **V5 REFINEMENT** (local-only prototype, ?taste-match, NOT committed/deployed) ·
  direction LOCKED (A+B hybrid; NO new design-choice round — the persona-reveal got an honest-math refit, not a
  new visual direction) · founder scored V4 5.65/10 (V1 1→V2 3→V3 4.5→V4 5.65) and named 4 drags; all 4 shipped:
  **(#1) HONEST PERSONA-MATCH** — KILLED the fake per-persona "rarer than 82% of swipers" constant (rarity/
  rarityPct fields deleted). Replaced with a GENUINE computation: 5 archetype profile-vectors over the fruit set
  (Tropical Romantic=litchi+mangosteen / Sweet-Tooth Sovereign=mango / Tangy Adventurer=guava+pomegranate /
  Heritage Purist=honey / Jewel Connoisseur=pomegranate+mangosteen); the player's want-picks → an L2-normalised
  taste VECTOR; cosine-similarity to each archetype → closest is the persona, similarity → "You're N% <Persona>".
  N is a REAL function of picks (verified across 10 play patterns: all-mango→92% Sovereign, litchi+mangosteen→96%
  Romantic, guava+pom→97% Adventurer, honey→94% Purist, blend→91%, no-wants→floored 70%). HONESTY: raw cosine maps
  monotonically through displayPct() into a 70-99 band (a documented PRESENTATION ease, order-preserving, NOT a
  fabrication; ranking uses raw cosine); NO population stat anywhere — the comparative line is a taste-ARCHETYPE
  match, persona.title is a flavour title ("The Romantic") not a stat. **(#2) IMAGERY** — same curated premium-
  stock seam, tightened editorial grade + vignette in CSS (.tm-card-photo/.tm-sharecard-photo/.tm-card-grade) so
  it reads art-directed; SWAP-TO-OWNED-PHOTO seam comments intact (ceiling = founder's owned shoot,
  ~/mallde/growth/taste-match-photo-brief.md). **(#3) DECK VARIABILITY** — V4's static deck → a LARGER POOL (9
  distinct correct fruit↔photo cards) + seeded mulberry32 Fisher-Yates shuffle per session (buildDeck(Date.now())
  on each Start → stable within a run, different across runs); DECK_SIZE=7. Verified two plays differ from card[1]
  on. **(#4) HABIT HOOK** — DAILY FRUIT DROP (dailyDropIndex = epochDay % POOL.length leads the deck + is the
  intro hero, rotates daily) + a localStorage STREAK (new lib/tasteStreak.ts: recordRun on reveal, consecutive-
  day count, advanced/sameDay/reset phrasing "N-day taste streak — come back tomorrow for a new drop"; intro shows
  live streak or a "play daily" nudge + "Today's drop: <name>"). HONEST per-device footnote shown; server-truth
  streak/daily-drop needs a backend table (future V7) — localStorage is the feel-test stand-in. Source bumped →
  `'taste-match-v5'`; PROTOTYPE_MODE=true (0 real POSTs; only fetch = html-to-image data-URL→blob). New file:
  lib/tasteStreak.ts. Edits: lib/tasteMatch.ts (POOL/buildDeck/shuffle/dailyDrop/introHero + scorePersona archetype
  cosine + composeRevealCopy now takes matchPct; deleted resolveTasteResult/DECK/INTRO_HERO/rarity/dead Slug alias),
  components/TasteMatch.tsx (deck state + scorePersona + MatchCountUp + streak/drop UI + share badge = honest %/title),
  index.css (.tm-streak-*/.tm-intro-drop/.tm-match-num + tightened grade/vignette + reduced-motion layer two).
  QA: `npm run build` clean (CSS 72.22 kB); two-layer reduced-motion ✓ VERIFIED via Playwright (reduce → static-card
  only, swipe-card=0; count-up final value immediately; 0 shimmer spans; streak pill/result carry NO CSS animation);
  keyboard ✓ (Tab reaches Nah; gold focus rings); AA contrast ✓ (tm-ink-on-tm-bg, marigold large-bold badge on
  near-black ~7:1); honey-not-buyable ✓ (honey = swipe vote + persona flavor only, ZERO cart/checkout/api-POST);
  checkout-gate untouched. Screenshots proto-shots/v5-*.png (intro+streak/drop, mid-drag, honest reveal, streak
  result, deck-variability A/B, reduced-deck, reduced-reveal). DEFERRED (honest): imagery still curated stock (swap
  to owned MaLLADE photography); streak/daily-drop is localStorage/per-device until a backend table (V7). Founder
  plays + scores V5 next.

- 2026-06-13 · Taste Match **V5.1 SMALL REFINEMENT** (local-only prototype, ?taste-match, NOT committed/deployed) ·
  NO new design-choice round (two contained founder asks on the locked V5 direction) · solo fe-lead edit (no
  specialist spawn; ran capture/QA directly). Two founder changes:
  **(1) DAILY DROP = FRUIT-ONLY** — today's drop computed to HONEY, which must never be the hero (honey is
  coming-soon/demand-only, never buyable). Added a `demandOnly?: boolean` flag to DuelFruit; introduced
  `fruitHeroIndices()` (POOL indices where !demandOnly) and changed `dailyDropIndex` to rotate over FRUIT
  indices only (`fruitIdx[epochDay % fruitIdx.length]`) — so the intro hero + first deck card are ALWAYS a
  buyable fruit. Demand-only cards still appear IN the shuffled deck as votes, just never as the drop.
  Verified via node: 0 demand-only heroes across 30 consecutive epoch-days; today's drop = Shahi Litchi.
  **(2) LAB-TESTED demand-only category** — honey (both Wildflower + Litchi entries) marked `demandOnly:true`;
  added a NEW pool item GHEE (slug `ghee`, name "Bilona Ghee", emoji 🧈, accent honey, microFact, demandOnly,
  FRUIT_WORD `ghee:'ghee'`, image public/taste-match-proto/ghee.jpg = Pexels 20689447 golden-ghee-jar+bowl,
  CORRECTNESS-RULE checked vs 3 rejected candidates incl. a honeycomb shot that risked honey confusion). All
  5 archetype vectors retuned to weight ghee (Heritage Purist now peaks on BOTH honey 1.0 AND ghee 1.0;
  Sweet-Tooth 0.5 / Jewel 0.4 / Romantic 0.2 / Adventurer 0.15). SLUGS extended with honey+ghee so reveal copy
  can name them as wants. New `LabBadge` component renders ONLY when `fruit.demandOnly` — top-right pill, gold
  ✓ tick + cream uppercase "Lab-tested" on rgba(11,10,16,0.82) backing, forest-green hairline border carrying
  the trust signal; rendered in BOTH SwipeCard and StaticCard after the eyebrow. SOCIAL_PROOF got a ghee line.
  Source tag UNCHANGED `'taste-match-v5'`; PROTOTYPE_MODE=true (0 real POSTs; only fetch = html-to-image
  data-URL→blob). Submit payload's `fruits: winnerSlugs` may include honey/ghee = correct demand capture.
  Edits: lib/tasteMatch.ts (demandOnly flag + ghee POOL/PIC/FRUIT_WORD + fruitHeroIndices/dailyDropIndex +
  retuned archetype profiles + SLUGS), components/TasteMatch.tsx (LabBadge + render in both cards + ghee
  social-proof), index.css (.tm-lab-badge/.tm-lab-badge-tick). New asset: public/taste-match-proto/ghee.jpg.
  QA: `npm run build` clean (CSS 72.22 → 72.57 kB); served-truth on :5173 (no container step — never deployed).
  Playwright capture verified ALL: intro hero = Shahi Litchi FRUIT (no badge) PASS; first deck card fruit/no-
  badge PASS; honey card Lab-tested badge=true; ghee card ("Bilona Ghee") Lab-tested badge=true; reveal "94%
  The Heritage Purist" with ghee composed into the copy; reduced-motion swipe=0/static=1 PASS. Screenshots
  proto-shots/v5_1-01..05-*.png. Invariants: honey-not-buyable ✓ AND ghee-not-buyable ✓ (both demand-vote/
  persona signals only — ZERO cart/checkout/api-POST; grep-confirmed no new cart/api refs for honey OR ghee);
  PROTOTYPE_MODE ✓; tokens-only ✓ (no Tailwind/raw hex); two-layer reduce-motion ✓; AA badge ✓; honest-number
  rule ✓ (no fabricated population stats). DEFERRED (honest, carried from V5): curated stock imagery (ghee.jpg
  is a stand-in, swap to owned MaLLADE photography); streak/daily-drop localStorage/per-device until backend
  (V7). Founder plays + scores V5.1 next.

- 2026-06-13 · Taste Match **V6** (local-only prototype, ?taste-match, NOT committed/deployed) · three NEW
  gated VISUAL surfaces grafted onto the locked V5.1 base + a non-gated progression engine (XP/rank, passport,
  badges). Design-choice round RAN (fe-design produced directions per surface); **the founder INTENTIONALLY
  OVERRODE the fe-lead recommendations** and picked these three by hand — built EXACTLY as chosen, no re-litigation:
  **(S1) Taste Rank = 1B "Drawn fruit-mascot"** — a CSS/SVG-drawn orange-style fruit character (litchi→marigold
  gradient body, face = eyes-with-highlights + smile, a leaf sprig, a per-tier emoji accessory) that EVOLVES
  SLOWLY across plays off the localStorage XP curve (tasteXp.ts: 5 tiers 0/120/360/900/2000 ≈ 3-4 months to top).
  `.is-tN` swaps aura brightness / body sheen / expression so each tier visibly levels-up 🌱→👑; litchi→marigold
  XP band + honest "N XP from <next>". CSS-only idle bob + aura pulse, both reduce-killed.
  **(S2) Fruit Passport = 2A "Literal India silhouette + glowing region pins"** — MAKE-OR-BREAK; the prior preview
  outline was flagged ROUGH/kachcha. REPLACED with a **production-quality CC0/public-domain India SVG** (fe-design
  sourced a Natural-Earth-derived mainland outline, simplified 1356→200 pts, cos-latitude projected; viewBox
  `0 0 604 611`, ~2.45KB path). 6 geographically-placed region pins (Gujarat/Maharashtra/UP/Bihar/Karnataka/Kerala)
  with discovered (marigold glow) / region-complete (litchi ring) / locked (dim) states + a multi-fruit count badge;
  "N of 14 fruits collected" bar. Verified silhouette renders crisp + recognizable at 240px mobile (Kutch bulge,
  Bengal neck, J&K, Kanyakumari tip). NOTE: medium-fidelity decorative provenance silhouette, NOT survey-grade /
  not a political-boundary statement.
  **(S3) Reveal = 3C "Hero summary + expandable accordion"** — persona HERO card FIRST (identity-led, Spotify-
  Wrapped: the COMPOSED insight line is the headline, before the % — "You're X% a match" + taste-words + Share-
  persona-card button), then collapsible accordion rows: 📍 picks by origin (provenance: name + origin + GI ✓ ONLY
  when giYear non-null + ≤20-word story) · 💛 also loved ("the one you're missing", honest affinity never a fabricated
  %) · 🏅 your taste rank (S1 mascot) · 🗺 fruit passport N/14 (S2 map). Progressive disclosure; climax lands before detail.
  WIRING: on run completion the reveal fires `recordRun` (streak) → `awardRun` (XP/tier) → `recordDiscoveries`
  (passport) EXACTLY ONCE (ref-guarded, keyed `[phase, winnerSlugs]`), surfacing tier-up + newly-earned badges +
  new-region pops. Submit source flipped `'taste-match-v5'` → **`'taste-match-v6'`** with extra `{ fruits, persona, city }`.
  MOTION: Ken-Burns slow-zoom on the active swipe card's photo (18s alternate, CSS-only) + the existing drag-parallax
  (x/rotate/tint motion-values) + ONE ambient honey-dipper MP4 (Mixkit CC0 #2801, **0.78MB**, self-hosted
  `public/taste-match-proto/ambient-honey.mp4` + poster, muted/loop/inline) layered over the intro daily-drop photo —
  ALL reduce-killed (the `<video>` isn't even mounted under reduce; capture confirmed count 0).
  TOKEN ADDED (fe-lead call, logged): 3 prototype-only illustration tokens on the scoped `.tm-standalone,.taste-match`
  block — `--tm-ink-face #2a1a0e` (mascot eyes/mouth + pin numerals), `--tm-leaf #4a7c1f`, `--tm-sprout #b8761e`
  (lowest-tier body) — so the mascot/pin literals live in ONE declaration; all V6 rules reference only var(--…).
  Edits: components/TasteMatch.tsx (Reveal → 3C hero+accordion + AccRow + TasteRankMascot + FruitPassportMap +
  progression effect + ambient video + source flip), index.css (S1/S2/S3 CSS + Ken-Burns + ambient video + reduce
  selectors + illustration tokens), App.tsx (removed the throwaway ?tm-v6-proto branch+import). NEW non-gated libs
  (built earlier this session): lib/tasteXp.ts, lib/tastePassport.ts, lib/tasteImages.ts. Deleted throwaway:
  components/tm-v6-preview.tsx + capture-tm-v6.mjs. NEW assets: public/taste-match-proto/ambient-honey.mp4 (+poster).
  QA: `npm run build` clean (CSS 72.57 → 81.64 kB; JS dropped 505→480 kB after preview removal); served-truth on
  live Vite :5174 (no container step — ?taste-match is never deployed, :5173/4 IS the served truth). Playwright
  capture verified ALL 8: intro (ambient video paints) · deck (Ken-Burns) · WANT stamp · reveal-hero (insight-first,
  91% match, GI ✓ green on chikoo) · reveal-accordion (all 4 rows, also-loved=Shahi Litchi "the one you're missing",
  no fabricated %) · character (Gourmand·Lvl 3 mascot, chef-hat) · map (production India outline, 5/14, pins lit) ·
  reduced-motion (static photo, ambient <video> count=0). Screenshots proto-shots/v6-final-*.png. Invariants:
  honey-not-buyable ✓ AND ghee-not-buyable ✓ (demand-vote/persona only — ZERO cart/checkout/api-POST; the only
  also-loved route is the 14 buyable fruits, honey/ghee excluded; passport collectibles exclude honey/ghee);
  PROTOTYPE_MODE=true ✓ (0 real POSTs — notify STUBBED to console.log, no `notify(` call); tokens-only ✓ (no
  Tailwind, no raw hex in rules — the 3 illustration literals are scoped token declarations); two-layer reduce-
  motion ✓ (ambient video unmounted + Ken-Burns/bob/aura/pin-pulse all killed); honest-number rule ✓ (matchPct is
  real cosine; XP/passport are localStorage per-device with a footnote; no fabricated population stats). DEFERRED
  (honest): localStorage XP/passport/streak are per-device, NOT server-truth (a real cross-device rank needs a
  backend account table — V7); ambient MP4 + stock fruit photography are stand-ins for owned MaLLADE assets; the
  India outline is medium-fidelity decorative, not survey-grade. NOT committed/pushed. Founder plays + scores V6 next.
- 2026-06-14 · Taste Match **V7 CONVERSION + PERSISTENCE LAYER** (local-only prototype, ?taste-match, NOT
  committed/deployed) · founder-scored V6 7.5/10 → ADD a go-live conversion + persistence layer ON TOP of the
  locked V6 game (NOT a rebuild). Four surfaces. Design-choice round ran LIGHT (AskUserQuestion unavailable in the
  subagent → degraded to in-code previews per protocol; choices marked **fe-lead recommended, PENDING founder
  confirmation**):
  **(1) Login-to-claim (PRIMARY, white-hat) · chosen: Inline panel** — when a run EARNS something real
  (new badge > tier-up > new region, precedence in `claimableFrom`) the reveal shows an HONEST collapsed cue
  BELOW the celebration banners (achievement lands FIRST, never hidden): "You unlocked 🏅 <thing> — Log in to
  save your badge & keep your Taste Rank →". Tapping expands an inline login panel in-flow (NOT a blocking modal).
  Already-logged-in + earned → no CTA, just a quiet "Saved to your profile" line (`.tm-claim-saved`).
  **(2) Exit-intent loss-aversion (SECONDARY, rubric-capped) · chosen: Gentle bottom toast** — fires at most
  ONCE per session (sessionStorage `mallade.tastematch.exitNudgeShown`), only for a guest WITH real progress,
  honest copy ("Your 🥭 badge + Taste Rank are saved on this device — log in to keep them everywhere."), obvious
  ✕ + "Not now" skip, NO false "lose it forever", reduce-motion respected. Once-per-session re-fire asserted PASS.
  **(3) Login surface · Google primary behind `VITE_GOOGLE_CLIENT_ID`** — GIS lazy-loaded ONLY when the client-id
  is present (absent → Google slot hidden gracefully, capture confirmed slot count 0); button → `POST /api/auth/google
  {credential}`. Fallback = single `identifier` field (email OR phone) + password + register toggle → existing
  `/auth/login` & `/auth/register`. On auth success → device→account merge of current localStorage progress
  (`POST /api/catalog/taste/profile/merge`) mirroring the guest-cart carry-over invariant; then reads switch to
  server. ALL server calls stub-tolerant (null on 404 — verified: the expected merge 404 logged, layer did NOT crash;
  localStorage stays the fallback).
  **(4) Address footprint · chosen: State → PIN → City** — NotifyForm gained opt-in `stateFirst` prop (default
  false → honey/coming-soon callers byte-identical). State is a `<select>` of `INDIAN_STATES` (keys of
  STATE_TO_CAPITAL, 28+8 sorted) FIRST, then PIN, then City; picking a state auto-fills City = capital iff City
  empty (founder "state known → capital as city" rule). State+PIN are the per-pincode demand-footprint signal.
  NEW lib: lib/tasteProfile.ts (isLoggedIn / deviceSnapshot / claimableFrom / claimWith{Google,Password} /
  fetchServerProfile / exit-nudge once-guard / GOOGLE_ENABLED). NEW api.ts: register / login / loginWithGoogle /
  get|merge|upsertTasteProfile (all token-storing, all null-on-failure). NEW types: TasteProfile, DeviceTasteProgress.
  Edits: components/TasteMatch.tsx (GIS shim + loadGis + isGuest/exitNudge in TasteMatch() + claimable/TasteClaim/
  ExitNudge in Reveal() + NotifyForm stateFirst & source flip), components/NotifyForm.tsx (stateFirst + State select +
  capital auto-fill + validation), lib/pincode.ts (export STATE_TO_CAPITAL + INDIAN_STATES), index.css (V7 block +
  reduce selectors + .coming-soon-select), types.ts. Submit source flipped `'taste-match-v6'` → **`'taste-match-v7'`**
  (+ `state` in extra). PROTOTYPE_MODE=true untouched (notify still STUBBED, 0 real POSTs).
  QA: `npm run build` clean + `tsc --noEmit` exit 0; served-bundle grep on live Vite :5174 found markers
  tm-claim-cue / tm-exit-nudge / taste-match-v7 / coming-soon-select in JS+CSS. Playwright (capture-tm-v7.mjs,
  throwaway, NOT committed) verified all surfaces: v7-01 claim-cue (badge-first, "Rare Taste unlocked" THEN cue),
  v7-02 panel (Google slot=0, email/phone fallback, no-thanks, honest footnote), v7-03 register toggle ("Create
  account & save"), v7-04 exit-nudge (gentle bottom toast, ✕ + "Not now") + once-per-session PASS, v7-05 capture
  (Name→Mobile→Email→State select(Karnataka)→PIN→City auto-fill "Bengaluru"), v7-06 reduced-motion (static panel,
  focus ring). Invariants: honey-not-buyable ✓ AND ghee-not-buyable ✓ (ZERO cart/checkout/api-POST touched — this is
  a NEW claim surface, deliberately NOT entangled with the guest→login CHECKOUT gate which is untouched); checkout
  stays OFF in pilot ✓; tokens-only ✓; two-layer reduce-motion ✓ (claim panel animation killed, exit-nudge
  transitions off under reduce); white-hat honest-copy ✓ (no false "lose forever", no nagging, no-thanks always
  visible). DEFERRED (honest): the 3 backend seams (`/api/auth/google`, taste profile get/merge/upsert) are
  CONTRACT-STUBBED — they 404 in local dev and the layer degrades to localStorage; real cross-device persistence
  needs those endpoints built in catalog-service + auth-service. Login=Inline & Exit=bottom-toast are fe-lead
  recommendations PENDING explicit founder confirmation. NOT committed/pushed. Founder reviews + confirms surfaces next.

- 2026-06-14 · Taste Arcade games-hub + header reward chip + 2 home entry points + V7 persistence wire · chosen ·
  BUILD ROUND, design pre-LOCKED by founder (no choice round): Fork A = **A4 "Taste Arcade" hub, Direction A**
  (reward panel TOP, games grid BELOW) per approved shot `proto-shots/taste-home/hub-dirA-loggedin.png` + `hub-guest.png`;
  Fork B = **B1 header reward chip**. Routing = **`?games` overlay rendered INSIDE Storefront** (NO new router dep) —
  extends the existing `?taste-match`/`?call=` URL-param idiom with `history.pushState`/`popstate`; browser Back AND
  in-UI "‹ Back to shop" both close the overlay WITHOUT remounting the SPA → **logged-in session survives the
  round-trip** (fe-quality compared `qe.guestToken` pre/post = unchanged). Surfaces: NEW `components/GamesHub.tsx`
  (Dir A; reuses `TasteRankMascot`+`FruitPassportMap` now **exported** from TasteMatch.tsx — kept in-place per the prep
  marker-classes tm-rank-mascot/tm-xp-bar/tm-passport-map, NOT extracted; featured-LIVE Taste Match + Fruit Memory/Origin
  Quiz "Coming soon" slots; guest reward-guest dashed variant), NEW `components/GameTeaser.tsx` (home `.game-teaser`
  near HoneyTeaser), `components/UpdatesCarousel.tsx` (Taste Arcade lead slide via new `onPlayGames` prop, existing
  notify slides untouched), `components/Header.tsx` (B1 `.reward-chip` guest+logged-in, reads peekTier/peekPassport,
  `🍈 N/14` glyph, opens hub via new `onOpenGames`), `App.tsx` (`?games` branch + openGames/closeGames/popstate +
  GameTeaser/GamesHub mount), `components/TasteMatch.tsx` (export the 2 components + the persistence wire), index.css
  (hub/teaser/chip/overlay/carousel CSS, tokens-only). **Persistence (V7) — NOW LIVE, not stubbed:** the taste-profile
  backend exists (README §endpoints: GET `/api/catalog/taste/profile` zeroed-default-never-404 + non-guest-403; POST
  monotonic-merge upsert) — so the wire is real. Logged-in run-complete fires `void upsertTasteProfile(deviceSnapshot({
  persona}))` at TasteMatch progression effect L322 (after setXpResult, guarded `if(isLoggedIn())`); chip+hub read
  server truth via `getTasteProfile()` w/ localStorage fallback on null; **guests never call it** (`/api/catalog/taste/**`
  stays AUTHENTICATED — guest- token → 401, verified by curl). PROTOTYPE_MODE=true untouched; winnerSlugs byte-identical;
  login-merge already wired (not duplicated). QA (fe-quality): `npm run build` clean (CSS index-CA2Jm2nG.css / JS 506.84kB,
  only the pre-existing >500kB advisory); **container-truth** — rebuilt frontend+gateway, all 12 class markers
  (games-hub-overlay/reward-panel/reward-guest/games-grid/game-card/reward-chip/chip-fruit/game-teaser/gt-stamp/
  updates-eyebrow/hub-back + "Taste Arcade") HIT in the SERVED nginx bundle; structural match on all 7 approved targets;
  smoke 57/73 = ZERO new regressions (16 fails all the known cold-start/OpenSearch-warmup races per memory). Invariants:
  honey-not-buyable ✓ AND ghee-not-buyable ✓ (grep confirms ZERO cart/checkout/notify logic in GamesHub/GameTeaser);
  checkout-gate ✓ (no cart code touched); guest-flow byte-identical ✓; keyboard ✓ (back/play/login Tab-reachable, chip is
  <button>); two-layer reduce-motion ✓ (JS useReducedMotion identity-variants in GamesHub/GameTeaser + CSS @media block).
  **A11y fix this round:** fe-quality caught 3 AA contrast fails on the NEW gold CTAs/labels (white-on-honey 3.06:1,
  honey-dark-on-cream 4.08:1); fe-lead fixed using established house token pairings — `.gt-cta` & `.game-play` →
  --marigold bg + --text/--tm-bg label (6.14:1 / 11.14:1), `.gt-eyebrow` → --text (10.25:1), `.chip-tier b` → --litchi-dark
  (5.27:1); re-verified in the served bundle, all 4 now ≥AA. NOT committed/pushed (founder commits only when asked).
