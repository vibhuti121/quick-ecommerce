# Postman collection — quick-ecommerce backend

Import these two into Postman to test the MaLLADE backend through the TLS gateway.

| File | What it is |
|---|---|
| `quick-ecommerce.postman_collection.json` | All backend endpoints, grouped by service (13 folders, ~50 requests). |
| `quick-ecommerce.postman_environment.json` | Variables (`baseUrl`, token slots, sample ids). Select it top-right after import. |

## Quick start
1. **Import** both files (Postman → Import → drag both in). Select the environment.
2. Set `baseUrl` — `https://localhost:8443` (local) or `https://mallde.in` (prod).
3. **Local only:** turn OFF SSL verification (Settings → General) — the local gateway uses a self-signed cert. mallde.in has a real Cloudflare cert.
4. **Mint a token** (auto-saved by test scripts, no copy/paste):
   - `Auth → Guest token` → fills `guestToken` (browse + cart, not checkout).
   - `Auth → Register` / `Auth → Login` → fills `userToken` (real account; needed for checkout/orders/taste/videocall).
   - `Auth → Login (as ADMIN)` → fills `adminToken` (admin folders). Use your `admin@mallade.test` authdb password.
5. Run any request — auth headers reference the saved tokens automatically.

## Things that bite (already handled in the requests)
- Login/Register field is **`identifier`** (email OR phone), not `email`.
- **Honey 400s** at `POST /api/cart/items` ("coming soon") — use a `category:fruit` `productId`.
- **Checkout** needs a **non-guest** JWT (guest-* → 403) **and** an `Idempotency-Key` header (missing → 400; the Checkout request auto-generates one in its pre-request script).
- Admin endpoints are doubly gated (gateway RBAC + in-service `AdminRoleFilter`).
- `order-service /admin/orders/**` are **not** gateway-routed (admin-app internal only) — included under the last folder as doc-only.
- Requests labelled `[internal]` are service-to-service saga steps (inventory reservations, payment charge, co-purchase) — included for debugging, not normal client flows.

Regenerate by re-running the endpoint sweep via `/varsha → codebase-explorer` if the API surface changes.
