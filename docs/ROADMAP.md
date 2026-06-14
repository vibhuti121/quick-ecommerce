# MaLLADE — Master Roadmap

> **Single source of truth for "what's done, what's next, and why."** Built so any future
> session (you or `/varsha`) can pick up cleanly without re-deriving the plan from memory.
> **North star:** asset-light litchi + litchi-honey agro-brand — milestone **6 June 2028**.

- **Brand / product:** MaLLADE — premium GI-tagged fruits (farm/type/location/harvest traceable) + Coorg jungle honey.
- **Platform:** the `quick-ecommerce` microservices stack (codename "QuickCart"). Spring Boot, Java 21, React/Vite storefront, Docker Compose.
- **Live today:** **https://mallde.in** — Phase-0 waitlist + browse pilot (NO money / checkout / FSSAI / GST yet).
- **Last verified:** 13 Jun 2026 — read-only live smoke **11/11 green** (homepage, catalogue, search, recommendations, demand counts, privacy line).

---

## ▶ CURRENT FOCUS  (WIP = 1 — only one thing active at a time)

> **The anti-drift anchor.** At any moment exactly ONE item is active here. Nothing else gets
> *worked on* until this is `done` or moved to the Parking Lot. New ideas mid-task → **"park it"**
> (they go to the Parking Lot below), they do NOT replace this. Ask **"focus kya hai?"** any time
> and `/varsha` reads this box back to you.

| Field | Value |
|---|---|
| **Active now** | **Engagement→Demand loop** — milestone COMPLETE (a day early). `growth-lead` built+registered; cycle-1 ideate run (Taste Match top, A+B 3.82; 1 Gate-0 kill); clickable **Taste Match prototype** built (local `?taste-match`, not deployed, notify mocked); launch digest fired. **Waiting on founder:** play it + score 1-10 → calibrates the rubric (Layer C). _(13-Jun)_ |
| **Definition of done** | **First goal (14-Jun) — DONE 13-Jun:** ✅ agent+rubric+memory · ✅ routines+plists (paused) · ✅ first ideate cycle end-to-end · ✅ clickable prototype · ✅ Telegram digest fired. _Open: founder plays+scores; then schedule the routines (`GROWTH=1 ./install.sh`) + decide if Taste Match goes live (founder-gated)._ |
| **Started** | 13-Jun-2026 |

_When you start something: `/varsha` fills this box (one item), works only on it, and on finish moves it to its Horizon as ✅ + logs the Changelog._

---

## 🅿 PARKING LOT  (capture-don't-switch)

> Anything that pops up mid-task lands here as **one line** instead of derailing the Current Focus.
> Writing it down kills the "I must do it now" urge. `/varsha` drains this into the right Horizon
> during the end-of-session reconcile. (Empty = good; means nothing is being dropped on the floor.)

- **PR #42** (roadmap + redeploy docs) — pushed, awaiting merge to `main`.
- **Backup restore-drill** (H1 #1) — no-regret safety, do when bandwidth frees.
- **Cloudflare Access admin dashboard** (H1 #2) — parked, low urgency (demand still 0).
- Note: old "Quiz v2 shareable" (H1 #4) is now **subsumed** into the bigger Engagement→Demand loop above.

---

## How this roadmap is maintained (the standing convention)

**Whenever a round of planning is finished, `/varsha` updates THIS file** — not a scratch
plan that disappears. The flow:

1. Planning happens (a `/varsha` plan, an `ExitPlanMode` approval, or a decision the founder signs off).
2. `/varsha` writes the outcome into the right **Horizon** below: move items between
   `▢ planned → ◐ in-progress → ✅ done`, add new items, and append a one-line dated note to the **Changelog**.
   Set the **Current Focus** box to the ONE item being worked; drain the **Parking Lot** into Horizons at end of session.
3. The matching `~/.claude/.../memory/*.md` memory is updated/added, and `MEMORY.md` indexes it.
4. The ephemeral plan file (`~/.claude/plans/*.md`) is the *working draft*; **this file is the durable record.**

Status legend: `✅ done` · `◐ in-progress` · `▢ planned` · `⏸ parked` (intentionally deferred, not dropped).
Owner = the subagent that drives it (see the agent roster at the bottom).

---

## Horizon 0 — NOW: keep the live pilot healthy ✅ (live, maintain)

The Phase-0 pilot is LIVE and stable. Goal here is **maintain + gather demand**, not build.

| Item | Status | Notes |
|---|---|---|
| Waitlist + browse storefront | ✅ | Gen-Z storytelling homepage, Catalogue v2 (editorial cards, detail zoom, quick-add) |
| "Find your MaLLADE match" fruit quiz → demand capture | ✅ | `POST /api/catalog/notify` fans out to one `notify_signups` row per fruit + umbrella `quiz` row; idempotent on (topic, phone) |
| Honey "coming soon" (not buyable) | ✅ | Server-side: cart-service 400s honey at `POST /api/cart/items` |
| Privacy/consent line on the lead form | ✅ | Live in served bundle ("no spam, no sharing") |
| Edge: Cloudflare Full TLS → origin `:8443` (Origin Rule fixes 521) | ✅ | `:8443` locked to Cloudflare CIDRs via nft firewall |
| Nightly `catalogdb` backup → Backblaze B2 (02:30 cron) | ✅ | `deploy/04-backup-catalogdb.sh` |
| UptimeRobot monitoring | ✅ | — |
| Deploy tooling + quiz code git-safe (PR #41 merged) | ✅ | `deploy/`, `docker-compose.prod.yml` now tracked |
| Self-serve demand + redeploy docs | ✅ | `deploy/DEMAND-ACCESS.md`, `deploy/REDEPLOY.md` |

**Ongoing ops** (no end-date, just run them): read demand weekly (`deploy/DEMAND-ACCESS.md`),
redeploy via `deploy/REDEPLOY.md`, never run `03-public-smoke.sh` against prod, never `down -v`.

---

## Horizon 1 — NEXT: close the pilot loop ⏸ (parked, ready to start)

Four loose ends from the Phase-0 closure plan. Small, high-leverage, no compliance dependency.

| # | Item | Status | Owner | Exit criteria |
|---|---|---|---|---|
| 1 | **Backup restore-drill** | ⏸ | devops | Gunzip a B2 dump onto a scratch DB, confirm row counts match — proves the backup truly restores (not just uploads) |
| 2 | **Cloudflare Access on `admin.mallde.in`** + enable admin-app in prod | ⏸ | devops | Founder logs into the visual **Demand dashboard** from a browser (no SSH tunnel); admin-app stays off the public internet otherwise. Upgrade path for `DEMAND-ACCESS.md` Method C |
| 3 | **Phase 0.5 — normalize the demand schema** | ⏸ | ops-automation | Flyway migration: flat `notify_signups` → `people` / `addresses` / `interests` (zero data loss). Giant-grade shape before volume grows |
| 4 | **Richer quiz v2** (shareable "fruit personality") | ⏸ | fe-lead | Shareable result card → viral loop on the waitlist; design-choice protocol first |

**Trigger to start H1:** founder says go, or the waitlist crosses a size where the flat schema / tunnel-only dashboard starts to hurt.

---

## Horizon 2 — pilot → real commerce (turn on the money path)

The big leap: from "waitlist" to "take an order + payment." **Two tracks run in parallel** —
the compliance track is the *long pole* (calendar-bound, start early); the engineering track
is mostly already built and just needs turn-on + verification.

### 2A — Compliance track ⏸ (the gate — start this FIRST, it's calendar-time not code-time)
Owner: **compliance-finance** (+ **sourcing-supply** for GI/lab).

| Step | Status | Note |
|---|---|---|
| Entity — **Pvt Ltd** (food-liability shield; sole-prop only to unblock fast) | ⏸ | |
| PAN → **GST** | ⏸ | |
| **FSSAI Basic Registration** (seller + later FBA warehouse) | ⏸ | Honey listable first needs only FSSAI + lab test |
| **Razorpay KYC** + current bank account | ⏸ | Activation also gates on live privacy/terms/**refund** pages (refund must cover perishables) |
| **GI-use authorization** — per fruit, sourcing-dependent | ⏸ | NEVER label a fruit "GI" without authorization on file |
| **Honey adulteration lab test** (C4 / NMR at NABL lab) | ⏸ | Store cert ref in product `attributes` JSONB |
| Live **privacy / terms / refund** policy pages | ▢ | Razorpay activation blocker |

### 2B — Engineering track (mostly DONE under the hood — flip on + verify)
Owner: **/varsha** → backend / devops / fe-lead.

| Step | Status | Note |
|---|---|---|
| Frontend containerized + same-origin via gateway | ✅ | The one historical platform gap — closed |
| MaLLADE provenance seed + product-detail UI | ✅ | `V3__seed_mallade_provenance.sql`; provenance in `attributes` JSONB; GI badge gated on `gi.status=="authorized"` |
| **Razorpay payment provider** (bean + signature-verified webhook + refund-into-saga-compensation) | ▢ | Clean swap: add `RazorpayPaymentProvider implements PaymentProvider`, set `PAYMENT_PROVIDER=razorpay`, no saga change |
| **Managed Postgres** + real restore drill (repoint `DB_HOST`, drop `postgres:` service) | ▢ | Before real orders flow |
| Turn ON `order` / `inventory` / `payment` profiles in prod compose | ▢ | Currently profile-OFF in the pilot |
| **Flip the checkout gate ON** (login→checkout already wired; checkout intentionally OFF now) | ▢ | Guest browse/cart stays free; checkout needs a non-guest account |
| Seed **real inventory** for MaLLADE SKUs (`/api/inventory/admin/stock`) | ▢ | Catalog rows exist with NO stock — add stock to make a SKU buyable |
| **Honey listable first** (FSSAI + lab clear), add each fruit as its GI authorization lands | ▢ | De-risk staggering |

**Exit criteria for H2:** a real customer can buy honey (then fruits) on mallde.in, pay via
Razorpay UPI, and the order saga + refund path works end-to-end — all on legally compliant footing.

---

## Horizon 3 — GROW: the business engines (post-checkout) ⏸

Once the money path is live, the asset-light flywheel turns on. Largely **business-agent** work.

| Engine | Owner | What |
|---|---|---|
| **Sourcing & supply chain** | sourcing-supply | Muzaffarpur FPO/exporter for Shahi litchi, nomadic beekeepers for litchi-honey, co-packer near Bangalore, reefer/3PL SLAs, glass-jar packaging + labels |
| **Corporate gifting / B2B** (fastest profit lever) | corporate-sales | Diwali honey hampers, gourmet-store + apartment-RWA channels, outreach sequences, pipeline tracking |
| **Marketplace listings** | marketplace-manager | Amazon / Flipkart / JioMart / Blinkit / Zepto — listing SEO, ROAS, category management per SKU |
| **D2C marketing + storytelling** | fe-lead / coo-advisor | Extend the storytelling storefront; content; the waitlist → first-order conversion |
| **Unit economics + capital preservation** | compliance-finance | P&L, pricing math, break-even, worst-case rupee loss before scaling spend |

---

## Horizon 4 — SCALE: the 0→1M tier roadmap ⏸ (climb only on a real trigger)

The platform already carries heavy scale levers — **don't pre-build, climb only when demand/throughput demands it.** Already in the tree (mostly profile-OFF in the pilot):

- OpenSearch product search · hybrid (co-purchase + content) recommendations · gated 3-person video-calling
- Observability: OTel/Micrometer tracing on all 9 services + ELK/APM + Prometheus/Grafana
- Redis catalog caching · k6 load-test suite · MinIO object storage · Redis ATP oversell guard
- Admin panel + RBAC, no-hard-delete, inventory oversight

**Rule:** each tier (more SKUs → marketplace volume → q-commerce SLAs → multi-region) is unlocked
by a measured trigger, not a calendar date. Note the trigger; don't build ahead of it.

---

## Agent roster (who owns what)

```
/varsha (L0 root orchestrator) — detection, QA gate, doc-sync, memory, THIS roadmap
  ├── /frontend → fe-lead → fe-design / fe-build / fe-commerce / fe-quality   (storefront UI)
  ├── ops-automation     — internal tooling, dashboards, scrapers, schema/automation
  ├── devops/infra       — deploy, TLS, backups, hosting (via deploy/ runbooks)
  └── coo-advisor (business) →
        ├── compliance-finance  — entity, FSSAI, GST, lab tests, unit economics, legal
        ├── sourcing-supply     — FPOs, beekeepers, co-packers, logistics, packaging
        ├── corporate-sales     — B2B / corporate gifting / Diwali hampers
        ├── marketplace-manager — Amazon/Flipkart/Blinkit/Zepto listings + ROAS
        └── growth-lead         — engagement→demand game engine (rubric + own memory ~/mallde/growth/);
                                  builds go coo-advisor → /varsha → fe-lead/backend/devops (no mesh)
```

---

## Changelog (append one dated line per planning round)

- **2026-06-13** — Roadmap doc created. Phase-0 closure COMPLETE + deployed live (privacy line, git-safe deploy tooling, self-serve demand/redeploy docs, PR #41 merged). Live read-only smoke 11/11. H1 (4 items) parked & ready; H2 compliance track flagged as the long pole.
- **2026-06-13** — Added the **anti-drift system**: Current Focus box (WIP=1) + Parking Lot (capture-don't-switch). Founder phrases: **"park it"** → add to Parking Lot; **"focus kya hai?"** → read Current Focus back.
- **2026-06-13** — **growth-lead agent BUILT** (Engagement→Demand spoke under coo-advisor). A self-improving game engine: a versioned **rubric** (Octalysis + Hook Model + a founder-taste model) that Gate-0-mission-checks → judge-panel-scores ideas → prototypes the top one for the founder to play+score. Own memory at **`~/mallde/growth/`** (relocated out of `~/.claude/` — headless runner hard-blocks `.claude/` writes). Two paused headless routines (`mallde-growth-ideate` 07:00, `mallde-growth-pulse` 20:00; `GROWTH=1 ./install.sh` to schedule). **Change protocol = 3 lanes** (new game = rubric pipeline · rubric rule change = versioned vN+1 + founder sign-off · system improvement = Parking Lot → coo-advisor → /varsha). First ideate cycle run: **Taste Match** scored top (A+B 3.82), Build-Your-Dream-Box (3.56) + Mango Market (3.45) parked, Fruit Crush/Spin-to-win **killed at Gate 0** (no preference→demand link). Prototype build in progress (fe-lead, local, not deployed). All infra user-space/uncommitted.
