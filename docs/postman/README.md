# Postman collection — quick-ecommerce backend

Manual-testing collection for the MaLLADE backend. Every request goes through the **TLS gateway on
`:8443`** (or `https://mallde.in` in prod) — the same path the storefront uses. No service ports are hit
directly except the doc-only order-service admin folder.

| File | What it is |
|---|---|
| `quick-ecommerce.postman_collection.json` | All backend endpoints, grouped by service — **13 folders, ~50 requests**. |
| `quick-ecommerce.postman_environment.json` | The variables (`baseUrl`, token slots, sample ids). Import it too and select it. |

---

## 1. Import into Postman

1. Postman → **Import** (top-left, or `Cmd+O`).
2. Drag **both** JSON files in → **Import**.
3. Top-right environment dropdown → select **"quick-ecommerce — Local (:8443)"**.

The collection is useless without the environment selected — that's where the tokens and `baseUrl` live.

---

## 2. The variables (what each one is, who sets it)

All variables live in the environment file and are referenced in requests as `{{name}}`. You set the
first few manually; the rest are **auto-filled by test scripts** when you run the auth requests.

| Variable | You set it? | What it is | Default |
|---|---|---|---|
| `baseUrl` | ✅ **yes** | The gateway URL every request targets. Local = `https://localhost:8443`, prod = `https://mallde.in`. | `https://localhost:8443` |
| `guestToken` | auto | Guest JWT. Filled by **Auth → Guest token**. Lets you browse + use the cart, but **not** checkout. | empty |
| `userToken` | auto | Real-account JWT. Filled by **Auth → Register / Login / OTP verify / Google**. Needed for checkout, orders, taste profile, videocall. | empty |
| `adminToken` | auto | ADMIN-role JWT. Filled by **Auth → Login (as ADMIN)**. Needed for every `…/admin/…` request. | empty |
| `idempotencyKey` | auto | Per-send unique key for checkout. The Checkout request's **pre-request script** regenerates it each time so retries don't false-409. You never touch this. | empty |
| `productId` | ✅ optional | A product id used by product/cart/order/recs requests. Change to a real id from **List products**. Must be a **fruit** (not honey) for cart/checkout. | `1` |
| `sku` | ✅ optional | A SKU string used by inventory + checkout line items. Match it to your `productId`. | `FRT-001` |
| `orderId` | auto | Filled by **Orders → Checkout** (saved from the response). Used by get-order, payment-status, saga steps. | empty |
| `callGrant` | auto | Short-lived (10-min) video-call grant. Filled by **Videocall → Grant**. Travels in the Socket.IO handshake, not a header. | empty |
| `topic` | ✅ optional | Notify topic for the count endpoint (`honey`, `fruit-xi:BRA`, …). | `honey` |
| `otpPhone` | ✅ optional | Phone used by the OTP request/verify pair. | `+919999999999` |

> **Collection vs environment variables:** the collection ships with the same defaults baked in, so it
> works even if you forget to select the environment — but the **environment** is what the test scripts
> write tokens into and what you should edit. Always run with the environment selected.

---

## 3. Running against LOCAL (`https://localhost:8443`)

Use this when the stack is up on your machine (`docker compose up` with the gateway running).

1. `baseUrl` = `https://localhost:8443` (the default — leave it).
2. **Turn OFF SSL verification** — the local gateway uses a **self-signed cert**, so Postman will refuse
   the connection otherwise:
   - Postman → **Settings** (`Cmd+,`) → **General** → toggle **"SSL certificate verification" OFF**.
   - (This is a global toggle. Turn it back on when you're done testing prod-grade APIs elsewhere.)
3. Make sure the gateway is actually up: run **Gateway / Health → Gateway health** → expect `{"status":"UP"}`.
4. Mint a token (see §5), then run anything.

If health 503s or the connection hangs, the stack isn't up or the gateway isn't ready yet (cold start
takes ~30–60s; saga services take longer).

---

## 4. Running against PROD (`https://mallde.in`)

Use this to smoke the **live** site. Be careful — this is real production data.

1. Change `baseUrl` → `https://mallde.in` (edit the environment value, or duplicate the environment as
   "Prod" first so you don't lose the local one).
2. **Leave SSL verification ON** — mallde.in has a real Cloudflare cert, no toggle needed.
3. Health check: **Gateway / Health → Gateway health** → `{"status":"UP"}`.

**⚠️ Prod safety rules — read before sending writes:**
- **Do NOT spam `Catalog — Notify → Notify signup`.** It writes a **real demand-signal row** (the founder's
  launch-interest table). One test row is fine; bulk sends corrupt the demand data the business reads.
- **Checkout creates a real order.** On the live COD pilot a real order kicks off the saga + admin flow.
  Use a throwaway test account and clean up after, or don't run it against prod at all.
- **Admin writes are real** — disabling a product, restocking, image upload all mutate the live catalogue.
- Stick to **GET** requests on prod unless you specifically intend a live write.

---

## 5. The token flow (do this once per session)

Requests reference `{{guestToken}}` / `{{userToken}}` / `{{adminToken}}` via Bearer auth. They're empty
until you mint them — and the auth requests **auto-save** the JWT for you (a test script writes it into the
environment), so there's no copy/paste.

| Run this request | Fills | Unlocks |
|---|---|---|
| **Auth → Guest token** | `guestToken` | Browse, search, cart (guest). **Not** checkout. |
| **Auth → Register** *or* **Auth → Login** | `userToken` | Checkout, my-orders, taste profile, videocall. |
| **Auth → Login (as ADMIN)** | `adminToken` | All `…/admin/…` requests (catalog/inventory/videocall admin). |

- **Login field is `identifier`, not `email`** — it accepts an email *or* a phone. (Common mistake.)
- For the **admin** login, use your `admin@mallade.test` account with the **authdb BCrypt password**
  (the one stamped into the DB — *not* the nginx basic-auth password and *not* `.env ADMIN_PASSWORD`).
- Guest tokens are `guest-*` and are **403'd at checkout, taste profile, and videocall** by design — if a
  request 403s, you probably have a guest token where a real `userToken` is needed.

A typical buyer end-to-end run:
```
Auth → Login                      (fills userToken)
Catalog — Browse → List products  (find a fruit productId, set {{productId}} + {{sku}})
Cart → Add / update cart item     (quantity is a signed delta: +1 adds)
Cart → Get cart                   (confirm line + total)
Orders → Checkout                 (auto Idempotency-Key; saves {{orderId}})
Orders → Get order by id          (watch status progress through the saga)
Payments → Payment status         (MOCK/COD result)
```

---

## 6. The folders (what's inside)

| Folder | Endpoints |
|---|---|
| **Auth** | guest, register, login, login-as-admin, OTP request/verify, Google sign-in, me, update display name |
| **Catalog — Browse & Search** | list products, get by id, search, recommendations |
| **Catalog — Notify** | notify signup (launch interest), notify count |
| **Catalog — Fruit XI** | teams, compose fan box, autofill XI |
| **Catalog — Taste Profile** | get / upsert / merge (account-only, guest 403) |
| **Catalog — Admin** | product CRUD, bulk enable/disable, image upload, all-notify, demand aggregate |
| **Cart** | get cart, add/update (signed-delta), remove line, clear |
| **Orders** | checkout, get order, my orders |
| **Inventory** | stock for SKU, admin stock, admin restock, `[internal]` ATP + saga reserve/commit/release |
| **Payments** | `[internal]` charge, payment status |
| **Videocall** | eligibility, grant (saves callGrant), admin roster |
| **Gateway / Health** | gateway health, fallback route |
| **Admin (order-service — NOT gateway-routed)** | `[doc only]` all-orders + mark-delivered (admin-app internal), `[internal]` co-purchase data |

Requests labelled **`[internal]`** are service-to-service saga steps — included for debugging, not normal
client flows. Requests labelled **`[doc only]`** point at `order-service :8094`, which has **no host port**
and is **not gateway-routed** — they document the contract but won't respond through `baseUrl`.

---

## 7. Contract gotchas (already wired into the requests)

These are the traps that 400/403 a naive call — the collection already handles them, but know why:

- **`identifier` not `email`** on register/login.
- **Honey 400s** at `POST /api/cart/items` (`category==='honey'`, "coming soon") — use a **fruit** `productId`.
- **Checkout needs a non-guest JWT** (guest-* → 403) **and** an **`Idempotency-Key` header** (missing → 400;
  the Checkout request auto-generates one).
- **Cart quantity is a signed delta** — `+1` adds, `-1` removes, `<=0` removes the line (it's not an absolute set).
- **Admin endpoints are doubly gated** — gateway RBAC **and** an in-service `AdminRoleFilter`. A normal
  `userToken` gets 403; you need `adminToken`.
- **Taste profile / videocall reject guests** (403) — account-only surfaces.
- **OTP request always returns `{sent:true}`** regardless of phone validity (anti-enumeration) — that's not a bug.

---

## 8. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Connection refused / SSL error on localhost | SSL verification still on, or stack down. Turn off SSL verification (§3); check Gateway health. |
| `401 Unauthorized` | Token empty or expired. Re-run the matching Auth request to refill it. |
| `403 Forbidden` on checkout/taste/videocall | You're using `guestToken`; switch the request's Bearer to `{{userToken}}`, or run Login. |
| `403` on an `/admin/` request | Using `userToken` instead of `adminToken`; run **Login (as ADMIN)**. |
| `400` on checkout | Missing `Idempotency-Key` (re-send — the pre-request script adds it) or a missing required body field. |
| `400` adding to cart | You picked a **honey** product; use a fruit `productId`. |
| `503` on first calls after `compose up` | Cold-start race — services still booting (saga services ~60s). Wait and retry. |
| Product/SKU not found | `productId`/`sku` defaults (`1`/`FRT-001`) may not exist in your DB; grab real ones from **List products**. |

---

Regenerate this collection if the API surface changes — re-run the endpoint sweep via
`/varsha → codebase-explorer` and update the JSON.
