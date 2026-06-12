# QuickCart / MaLLADE — Hands-On User Guide

A learn-by-doing walkthrough of **how to actually use this application**, end to end. It is the
companion to the [README](../README.md): the README is the *reference* (every endpoint, every port,
every config knob); this guide is the *tour* — follow it top to bottom and you will have shopped as a
customer, run the store as an admin, placed a video call, and read the dashboards.

Every step is shown **two ways** where it helps:
- **🖱 In the UI** — what you click in the browser.
- **⌨ On the wire** — the same thing as a `curl` call, so you can see exactly what the app sends.

> The stack uses a **dev self-signed TLS cert**, so every `curl` against the gateway uses `-k` and the
> browser will ask you to "proceed" once. That's expected locally.

---

## Table of contents
- [0. Before you start](#0-before-you-start)
- [1. The customer journey (storefront)](#1-the-customer-journey-storefront)
- [2. The admin journey (staff console)](#2-the-admin-journey-staff-console)
- [3. Placing a gated video call](#3-placing-a-gated-video-call)
- [4. The control room (dashboards & observability)](#4-the-control-room-dashboards--observability)
- [5. Common-tasks cheat sheet](#5-common-tasks-cheat-sheet)
- [6. When something breaks](#6-when-something-breaks)

---

## 0. Before you start

Bring the whole stack up once (full detail in the README's [Quick start](../README.md#quick-start-run-the-whole-stack)):

```bash
./scripts/gen-secrets.sh          # one-time: writes a gitignored .env
docker compose up -d --build      # ~18 containers; first build takes a few minutes
curl -k https://localhost:8443/actuator/health   # → {"status":"UP"}
```

The stack boots **pre-seeded** (11 products + stock), so you can shop immediately — no setup.

### The addresses you'll use

| What | URL | Who it's for | Auth |
|---|---|---|---|
| **Storefront** (shop) | `https://localhost:8443/` | Customers | none to browse/cart (guest token minted silently); **sign-in required to place an order** |
| **API edge** (gateway) | `https://localhost:8443/api/...`, `/auth/...` | Apps / curl | Bearer token on protected calls |
| **Admin console** | `http://localhost:5174/` (via SSH tunnel) | Staff | nginx basic-auth **+** ADMIN login |
| **Grafana** | `http://localhost:3000/` | You (ops) | `admin` / `GRAFANA_PASSWORD` |
| **Prometheus** | `http://localhost:9090/` | You (ops) | none (local) |
| **Kibana** | `http://localhost:5601/` | You (ops) | none (local) |
| **MinIO console** | `http://localhost:9001/` | You (ops) | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` |

> **Mental model.** There is **one front door** — the gateway on `:8443`. The storefront SPA and the API
> are served from that *same origin* (no CORS to worry about). Everything else (Grafana/Kibana/etc.) are
> back-office consoles you open directly. The admin SPA is deliberately **loopback-only** — you reach it
> over an SSH tunnel, never from the public internet.

---

## 1. The customer journey (storefront)

This is the path a real shopper takes: land → browse/search → inspect a product → add to cart → sign in
(required to order) → check out (cash on delivery) → track the order.

### 1.1 Open the store

🖱 **In the UI:** open `https://localhost:8443/` and accept the dev-cert warning once. You'll see the
product grid (the MaLLADE honey + GI-tagged fruit catalog).

⌨ **On the wire:** the grid is just a public catalog call.
```bash
curl -sk "https://localhost:8443/api/catalog/products?size=200" | jq '.content[] | {sku, name, basePrice}'
```

### 1.2 Identity & sign-in — "do I have to log in?"

**Short answer: only to place an order.** You can browse, search, and fill a cart **without signing in** —
but **checkout requires a real account.** Here's how that works and where the login page actually is.

Under the hood, the gateway *does* require a token on every cart/order call — anonymous calls are
rejected. But the storefront gets one for you **silently**: on your first action it mints a **guest
token** (`POST /auth/guest`) and caches it in the browser's `localStorage`. A guest token is a valid
Bearer token, so browsing and cart-building work immediately — you never see a login wall *while
shopping*. (Reuse the same browser → same guest identity → same cart.)

**The one wall is checkout.** `POST /api/orders/checkout` **rejects a guest token with 403** ("Please
sign in to place an order") — placing an order requires a **real (non-guest) account**. In the cart, a
guest sees *"Sign in to place your order — your cart will be saved"* with a sign-in button in place of the
delivery form; signing in carries the cart over and lets the order through. (Signing in also upgrades a
browser-only guest identity into a **persistent account**, so your orders follow you to another device.)

🖱 **Where the login page is:** click **👤 Profile** in the header → the profile drawer opens → **Sign
in** (or hit the **Sign in to place your order** button in the cart). That opens the auth modal with four
options:

| Option | What it does |
|---|---|
| **Login** | returning email/phone + password account |
| **Register** | create a new email/phone + password account |
| **Phone OTP** | sign in with a 6-digit SMS code |
| **Continue with Google** | OAuth sign-in |

Whichever you pick mints a **real (non-guest) token** and stores it under the *same* key as the guest
token — so the rest of the app (cart, orders, profile) instantly treats you as that account, carrying
over the cart you were building.

⌨ **On the wire** — browsing needs no token, but the cart→checkout walkthrough below needs a non-guest
one, so **register an account** and keep its token in a shell variable (`/auth/register` auto-logs-in and
returns a token directly):
```bash
GW="https://localhost:8443"
TOKEN=$(curl -sk -X POST $GW/auth/register -H 'Content-Type: application/json' \
  -d '{"identifier":"demo'"$RANDOM"'@example.com","password":"DemoPass123","displayName":"Demo Shopper"}' \
  | jq -r .token)
echo "$TOKEN"        # an eyJ... usr-<uuid> JWT — non-guest, so it can check out
```

> The field is **`identifier`** (it accepts an email *or* a 10-digit Indian phone), not `email`; password
> must be ≥ 8 chars. A returning customer uses `POST /auth/login` with the same `{ identifier, password }`.
> Wrong creds and unknown users both return an identical generic 401 (so the API can't be used to
> enumerate who has an account). A `POST /auth/guest` token still works for browsing + cart, but **403s at
> checkout** — that's the gate.

### 1.3 Browse & filter

🖱 **In the UI:** scroll the grid; use the category/type filters.

⌨ **On the wire:** the listing is paginated (default page size 20 — pass `?size=200` to see everything in
one shot).
```bash
curl -sk "$GW/api/catalog/products?category=honey&size=50" | jq '.content | length'
```

### 1.4 Search

The store has real **full-text, typo-tolerant search** (OpenSearch under the hood) over name, SKU, category,
description and product attributes — relevance-ranked.

🖱 **In the UI:** type in the search box in the header (e.g. `honey`, or even a slight typo like `hony`).

⌨ **On the wire:**
```bash
curl -sk "$GW/api/catalog/products/search?q=honey" | jq '.content[] | {sku,name}'
```
> Search is **never cached**, so a product an admin just created is findable immediately. If OpenSearch is
> ever down, search silently degrades to a database scan rather than failing — you still get results.

### 1.5 Open a product — the provenance story

Click any card to open the **product-detail overlay**. For a MaLLADE item this is the whole point of the
brand: it shows the **provenance panel** — farm, origin, harvest batch, lab-test certificate, and GI status.

The compliance rule baked into the UI: the **"GI-tagged ✓" badge only appears when the GI status is
`authorized`**. Items that are merely `pending` (e.g. the Alphonso box) or `none` (the honeys, which instead
carry a lab-purity note) show plain text — the app will never display an *unearned* GI claim.

⌨ **On the wire** — fetch one product and look at its provenance:
```bash
PID=$(curl -sk "$GW/api/catalog/products?size=200" | jq '.content[] | select(.sku=="MAL-LITCHI-SHAHI-BOX") | .id')
curl -sk "$GW/api/catalog/products/$PID" | jq '.attributes.provenance'
```

### 1.6 "You may also like" — recommendations

The overlay also shows a recommendations row — a hybrid of *co-purchase* ("people who bought this also
bought…") with content-based and same-category fallbacks so it's never empty.

⌨ **On the wire:**
```bash
curl -sk "$GW/api/catalog/products/$PID/recommendations?size=8" | jq '.[] | .name'
```

### 1.7 Add to cart

🖱 **In the UI:** click **Add to cart** on a card or in the overlay; the cart slide-over opens.

⌨ **On the wire** — note `quantity` is a **signed delta** (`+1` to add, `-1` to decrement, line drops at 0):
```bash
AUTH=(-H "Authorization: Bearer $TOKEN")
curl -sk -X POST $GW/api/cart/items "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "{\"productId\":$PID,\"quantity\":1}" | jq '{itemCount,total}'
curl -sk $GW/api/cart "${AUTH[@]}" | jq '{itemCount,total}'    # view the cart
```

> A product needs **stock** to be buyable. The demo SKUs are pre-stocked; the MaLLADE rows are
> *catalog-only* by default — an admin seeds their stock (see [§2.5](#25-adjust-stock)) before they can be
> ordered.

### 1.8 Check out — cash on delivery

This is a **COD pilot**: you provide a delivery address and pay when the goods arrive — there's no online
payment step for the customer. Three things matter on the wire:
1. **A non-guest token is required** — a guest token → **403** ("Please sign in to place an order").
   `$AUTH` below carries the registered account from [§1.2](#12-identity--sign-in--do-i-have-to-log-in).
2. An **`Idempotency-Key` header is required** — resend the same key and you won't double-order.
3. The delivery fields (`customerName`, `customerPhone`, `deliveryAddress`, `pincode`, `city`, `state`)
   are required. Enter the 6-digit `pincode` and the form auto-fills `city`/`state` (editable).

🖱 **In the UI:** open the cart — if you're a guest you'll see **Sign in to place your order** instead of
the form; sign in (your cart carries over), then fill in name / phone / address / pincode (city + state
auto-fill) and place the order.

⌨ **On the wire:**
```bash
curl -sk -X POST $GW/api/orders/checkout "${AUTH[@]}" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "{\"currency\":\"INR\",\"customerName\":\"Demo Shopper\",\"customerPhone\":\"9876543210\",
       \"deliveryAddress\":\"12 MG Road, Bengaluru\",\"pincode\":\"560001\",
       \"city\":\"Bengaluru\",\"state\":\"Karnataka\",
       \"items\":[{\"productId\":$PID,\"sku\":\"MAL-LITCHI-SHAHI-BOX\",\"name\":\"Shahi Litchi Box\",
                   \"unitPrice\":899,\"quantity\":1}]}" | jq
# → HTTP 202, order in PENDING; the saga confirms it asynchronously
```

### 1.9 Track the order

Checkout returns **202 + a PENDING order**. Behind the scenes an **outbox saga** reserves stock, charges the
(mock) payment provider, and flips the order to **CONFIRMED** (or **FAILED**, releasing the hold). You just
poll the order.

🖱 **In the UI:** the order/confirmation view updates as the status resolves.

⌨ **On the wire:**
```bash
ORDER_ID=...   # the id from the checkout response
curl -sk $GW/api/orders/$ORDER_ID "${AUTH[@]}" | jq '{id,status}'   # PENDING → CONFIRMED
curl -sk $GW/api/orders "${AUTH[@]}" | jq '.[] | {id,status}'       # all my orders
```

That's the complete customer loop: **browse → search → inspect → cart → COD checkout → track**.

---

## 2. The admin journey (staff console)

The admin console (`admin-app/`) is a separate internal SPA for staff — the storefront is for customers, this
is for running the store. It is **loopback-only** and sits behind **two** locks: nginx HTTP basic-auth, *and*
an ADMIN-role login.

### 2.1 Reach the console

It binds to `127.0.0.1:5174` only, so you reach it over an SSH tunnel (on your own machine you can open it
directly):
```bash
ssh -L 5174:127.0.0.1:5174 <host>      # then open http://localhost:5174
```
The browser first prompts for **nginx basic-auth** — that's `ADMIN_USER` / `ADMIN_PASSWORD` from your `.env`.

### 2.2 Log in as an admin

The console only accepts a **`role=ADMIN`** JWT; any other token is rejected client-side, and — more
importantly — the **gateway re-verifies `role=ADMIN` on every `/api/**/admin/**` call**, which is the real
security boundary (the in-app role gating is just UI polish).

A token gets the ADMIN role when the account's email is on the **`ADMIN_EMAILS`** allowlist. To create a
working admin account from scratch, the order matters — **the role is baked in at registration**, so the
allowlist must be set *before* you register:

```bash
# 1. Put the email on the allowlist in .env, then restart auth-service so it picks it up:
#    ADMIN_EMAILS=admin@mallade.test
docker compose up -d auth-service

# 2. Register that email (now it mints a role=ADMIN token):
curl -sk -X POST https://localhost:8443/auth/register -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@mallade.test","password":"<choose-one>","displayName":"Store Admin"}'
```

🖱 Now sign in at `http://localhost:5174/login` with that email + password. In production an admin token
typically comes from **Google login** with an allowlisted email instead.

> The token is held **in memory** — a browser refresh logs you out and bounces to `/login`. That's an
> accepted trade-off for this round (no persisted session); just log back in.

### 2.3 The dashboard

After login you land on `/dashboard` — three cards: **total products**, **orders today**, and **awaiting
delivery**. It's your at-a-glance pulse of the store.

### 2.4 Manage products (create / edit / delete)

`/products` is a full CRUD table over the catalog admin API.

🖱 **In the UI:** the table lists every product; **Create** opens a form (SKU, name, type, price, …);
row actions **Edit** and **Delete**. A duplicate SKU is surfaced as a conflict rather than silently failing.

⌨ **The same on the wire** (needs an ADMIN token — capture it from login):
```bash
ADMTOK=$(curl -sk -X POST https://localhost:8443/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@mallade.test","password":"<the-password>"}' | jq -r .token)
ADM=(-H "Authorization: Bearer $ADMTOK")

# create
curl -sk -X POST https://localhost:8443/api/catalog/admin/products "${ADM[@]}" \
  -H 'Content-Type: application/json' \
  -d '{"sku":"MAL-HONEY-NEW-250","name":"Wildflower Honey 250g","productType":"PHYSICAL",
       "category":"honey","basePrice":299,"currency":"INR","active":true,"variants":[]}'
# update → PUT  /api/catalog/admin/products/{id}
# delete → DELETE /api/catalog/admin/products/{id}   (→ 204)
```

### 2.5 Adjust stock

MaLLADE catalog rows ship with **no stock**, so they can't be ordered until you seed inventory. There's no
stock UI page this round — use the admin API:
```bash
curl -sk -X POST https://localhost:8443/api/inventory/admin/stock "${ADM[@]}" \
  -H 'Content-Type: application/json' \
  -d '{"sku":"MAL-LITCHI-SHAHI-BOX","quantity":50}'
```
Now that SKU is buyable in the storefront.

### 2.6 Manage orders

`/orders` lists orders with their status; you can **mark a CONFIRMED order as delivered** — the COD pilot's
fulfilment step.

### 2.7 See the audit trail

Every admin write is **audited**. The services emit a structured log event on each change —
`admin.product.created` / `admin.product.updated` / `admin.product.deleted` (catalog) and
`admin.stock.adjusted` (inventory) — each carrying the request's `trace.id` and a **hashed** `user_id`
(never the raw identity) plus a PII-free payload (sku/name/price/qty).

🖱 **In Kibana** (`http://localhost:5601` → **Discover**): search for `event: "admin.product.created"` to
see who changed what, and pivot by `trace.id` to follow the whole request.

⌨ **Quick check from the host** (the structured line on stdout):
```bash
docker compose logs --since 30m catalog-service | grep -E 'admin\.product\.(created|updated|deleted)'
docker compose logs --since 30m inventory-service | grep 'admin.stock.adjusted'
```

---

## 3. Placing a gated video call

A logged-in customer can join a **3-person video call** (e.g. a guided tasting / product call). It's
deliberately gated, and the security design is worth understanding:

- Your **login JWT proves you're logged in but is never sent to the call socket.** Instead you request a
  **separate, short-lived "call grant"** signed with its own secret.
- A grant is issued only if you're **eligible and not in cooldown** (a 5-hour cooldown is claimed atomically
  when a grant is issued). Guests, ineligible users, and users in cooldown all get the *identical*
  `{ available:false }` — no reason and no countdown leaked, by design.

⌨ **The flow** (must be a non-guest token):
```bash
curl -sk -X POST $GW/api/videocall/eligibility "${AUTH[@]}" -H 'Content-Type: application/json' -d '{...}'
curl -sk -X POST $GW/api/videocall/grant "${AUTH[@]}"
# → { available:true, grant, roomId, exp }   (grant valid ~10 min, max 3 participants)
```
The browser then opens the call UI, which connects to the signaling service over WebSocket carrying the
grant; a 4th person trying to join the room gets `room-full`, and each socket is force-dropped when its grant
expires.

---

## 4. The control room (dashboards & observability)

Once the app is running, these consoles tell you *what it's doing*. Open them directly (they're not behind
the gateway):

| Console | URL | What it answers |
|---|---|---|
| **Grafana** | `http://localhost:3000` (`admin`/`GRAFANA_PASSWORD`) | "Is it healthy and fast?" Dashboards: **Infra** (JVM/GC/pools), **API-SLO** (latency/error rates with trace exemplars), **Business** (orders/GMV/saga), and the catalog **cache hit/miss** panel. |
| **Kibana** | `http://localhost:5601` | "What happened on this request?" **Discover** for logs and the **APM** waterfall — follow one journey by `trace.id` or hashed `user_id`. This is where the admin audit events land too. |
| **Prometheus** | `http://localhost:9090` | The raw metrics + alert rules (ServiceDown, error-rate, checkout p99, payment-fail). Try a query like `cache_gets_total`. |
| **MinIO** | `http://localhost:9001` | Browse stored product images (S3-compatible bucket). |

> **One trace, end to end.** Every request gets a `trace.id` that rides through all services and into both
> the logs and the APM spans. So when an order misbehaves, you grab its trace id in Kibana and watch the
> whole gateway → order → inventory → payment saga unfold in one waterfall — and the matching log lines
> carry the same id. That's the payoff of the observability pillar.

---

## 5. Common-tasks cheat sheet

| I want to… | Do this |
|---|---|
| Start everything | `docker compose up -d --build` |
| Confirm it's healthy | `curl -k https://localhost:8443/actuator/health` |
| Prove the whole journey works | `bash scripts/fullstack-smoke.sh` (expect all green on a warm stack) |
| Browse / cart without an account | `POST /auth/guest` → reuse the token (browse + cart only) |
| Search the catalog | `GET /api/catalog/products/search?q=...` |
| See a product's provenance | `GET /api/catalog/products/{id}` → `.attributes.provenance` |
| Get an account that can order | `POST /auth/register` `{identifier, password, displayName}` → token |
| Place an order | `POST /api/orders/checkout` with an `Idempotency-Key` header (**non-guest token** — guest → 403) |
| Track an order | `GET /api/orders/{id}` → poll `status` |
| Open the admin console | `ssh -L 5174:127.0.0.1:5174 <host>` → `http://localhost:5174` |
| Create/edit/delete a product | admin console `/products`, or the `/api/catalog/admin/products` API with an ADMIN token |
| Make a MaLLADE item buyable | `POST /api/inventory/admin/stock` `{sku, quantity}` (ADMIN) |
| Audit who changed what | Kibana → `event: "admin.product.*"` (or grep the service logs) |
| Watch health & latency | Grafana `http://localhost:3000` |
| Wipe and re-seed | `docker compose down -v && docker compose up -d` |

---

## 6. When something breaks

- **Cert warning / `curl` fails with SSL:** expected — it's a dev self-signed cert. Use `-k` with curl and
  "proceed" in the browser. (Production terminates real TLS at the edge.)
- **401 on a protected call:** you didn't send `Authorization: Bearer <token>`, or the token expired — get a
  fresh one. Browse/search/product/recommendations are public; cart/orders are not.
- **403 on an admin call:** your token isn't `role=ADMIN`. The email must be on `ADMIN_EMAILS` **before** the
  account was registered (the role is baked in at registration) — see [§2.2](#22-log-in-as-an-admin).
- **A MaLLADE product won't add to cart:** it has no stock yet — seed it ([§2.5](#25-adjust-stock)).
- **`no matches found` from your shell:** zsh tries to expand the `?` in a URL like
  `.../products?size=200` — **quote the URL** (`curl -sk "$GW/api/catalog/products?size=200"`).
- **Smoke fails right after `up`:** the stack is still booting (a cold-start race). Wait ~20s and re-run;
  a warm run is green.
- **Anything else:** see the README's [Troubleshooting](../README.md#troubleshooting) and
  [Known limitations](../README.md#known-limitations--out-of-scope) sections.

---

*This guide pairs with the [README](../README.md) (full reference) and
[docs/observability-strategy.md](observability-strategy.md) (how tracing/logging/metrics are wired).*
