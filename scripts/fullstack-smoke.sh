#!/usr/bin/env bash
# Full-stack acceptance smoke — everything through the gateway (the real edge), proving:
#   routing (gateway -> each service) · auth (guest JWT -> X-User-Id injection) ·
#   public catalog browse (no token) · the checkout saga end-to-end ·
#   and DATA SURVIVES A FULL RESTART (compose down -> up, order still there).
#
# Re-runnable: each run uses a unique SKU so it never collides with prior runs' catalog rows.
# Usage: GATEWAY_PORT=8443 bash scripts/fullstack-smoke.sh
# The edge is HTTPS with a dev self-signed cert (Pillar 4), so all curls go through a -k wrapper below.
set -uo pipefail

GW="https://localhost:${GATEWAY_PORT:-8443}"
# TLS terminates at the gateway with a self-signed dev cert; accept it for every call in this script.
curl() { command curl -k "$@"; }
SKU="SMOKE-$$-${RANDOM}"          # unique per run -> script is idempotent across repeated runs
IDEM="idem-$SKU"                  # checkout idempotency key, also unique per run (else a re-run replays the old order)
PASS=0; FAIL=0
ok()  { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
assert_eq() { [ "$1" = "$2" ] && ok "$3 (=$2)" || bad "$3 (expected '$1' got '$2')"; }
jget() { sed -n "s/.*\"$2\":\"\\([^\"]*\\)\".*/\\1/p" <<<"$1"; }      # string field
jnum() { sed -n "s/.*\"$2\":\\([0-9]*\\).*/\\1/p" <<<"$1"; }          # numeric field

# --- admin JWT (test harness only) -------------------------------------------
# Phase-3 Pillar-1 RBAC gates /api/*/admin/** on the ADMIN role. The only PRODUCTION
# path to an admin token is Google OAuth with an email in ADMIN_EMAILS — not scriptable.
# For an end-to-end smoke we mint a short-lived HS256 token signed with the SAME secret
# the auth-service uses (read from .env), carrying role=ADMIN. /auth/validate trusts the
# role claim, so the gateway treats it as admin and the seed steps succeed. This does NOT
# weaken prod: the secret never leaves the host and OAuth still governs real users; it
# just lets the smoke do what a logged-in admin would (seed catalog + stock).
ENV_FILE="$(dirname "$0")/../.env"
JWT_SECRET="${JWT_SECRET:-}"
[ -z "$JWT_SECRET" ] && [ -f "$ENV_FILE" ] && JWT_SECRET="$(grep -E '^JWT_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
mint_admin_jwt() {
  local hdr pl now exp sig
  now=$(date +%s); exp=$((now + 3600))
  hdr=$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)
  pl=$(printf '%s' "{\"sub\":\"smoke-admin\",\"email\":\"smoke-admin@local\",\"displayName\":\"Smoke Admin\",\"role\":\"ADMIN\",\"iat\":$now,\"exp\":$exp}" | b64url)
  sig=$(printf '%s' "$hdr.$pl" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)
  printf '%s.%s.%s' "$hdr" "$pl" "$sig"
}

echo "Using SKU=$SKU"

echo
echo "== 0. edge health =="
assert_eq "UP" "$(curl -fs $GW/actuator/health | grep -o '\"status\":\"UP\"' | head -1 | cut -d'"' -f4)" "gateway health UP"

echo
echo "== 1. guest auth (issues JWT) =="
TOK=$(jget "$(curl -fs -X POST $GW/auth/guest -H 'Content-Type: application/json' -d '{"name":"Smoke Shopper"}')" token)
[ -n "$TOK" ] && ok "guest token issued" || bad "guest token issued"
AUTH=(-H "Authorization: Bearer $TOK")

# Admin token for the seed steps (catalog + inventory admin endpoints). Guests cannot seed
# under Pillar-1 RBAC; an admin would. See the mint_admin_jwt note above.
[ -z "$JWT_SECRET" ] && echo "  WARN: JWT_SECRET not found (run ./scripts/gen-secrets.sh) — admin seed steps will 403"
ADMIN_TOK=$(mint_admin_jwt)
ADMIN=(-H "Authorization: Bearer $ADMIN_TOK")

echo
echo "== 2. protected route rejects anonymous =="
assert_eq "401" "$(curl -fs -o /dev/null -w '%{http_code}' $GW/api/orders)" "GET /api/orders without token -> 401"

echo
echo "== 3. seed catalog (admin, needs token) =="
PROD=$(curl -fs -X POST $GW/api/catalog/admin/products "${ADMIN[@]}" -H 'Content-Type: application/json' \
  -d "{\"sku\":\"$SKU\",\"name\":\"Smoke Widget\",\"productType\":\"PHYSICAL\",\"basePrice\":199.00,\"currency\":\"INR\"}")
PID=$(jnum "$PROD" id)
echo "  created product id=$PID sku=$SKU"
[ -n "$PID" ] && ok "product created via gateway" || bad "product created via gateway"

echo
echo "== 4. anonymous catalog browse (PUBLIC, no token) =="
assert_eq "200" "$(curl -fs -o /dev/null -w '%{http_code}' $GW/api/catalog/products)" "GET /api/catalog/products without token -> 200"
curl -fs "$GW/api/catalog/products" | grep -q "$SKU" && ok "seeded product visible in public browse" || bad "seeded product visible in public browse"

echo
echo "== 5. seed inventory stock (admin, token) =="
curl -fs -X POST $GW/api/inventory/admin/stock "${ADMIN[@]}" -H 'Content-Type: application/json' \
  -d "{\"sku\":\"$SKU\",\"quantity\":20}" >/dev/null && ok "stock seeded $SKU=20" || bad "stock seeded"

echo
echo "== 6. cart (per-user, keyed on X-User-Id from token; snapshots from catalog) =="
CART=$(curl -fs -X POST $GW/api/cart/items "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "{\"productId\":$PID,\"quantity\":2}")
echo "  cart: $CART"
echo "$CART" | grep -q "\"$PID\"" && ok "item added to user cart" || bad "item added to user cart"

echo
echo "== 7. checkout saga (token + Idempotency-Key) =="
CO=$(curl -fs -w '\n%{http_code}' -X POST $GW/api/orders/checkout "${AUTH[@]}" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: '"$IDEM"'' \
  -d "{\"currency\":\"INR\",\"customerName\":\"Smoke Tester\",\"customerPhone\":\"9990000002\",\"deliveryAddress\":\"1 Test Lane, Bengaluru\",\"items\":[{\"productId\":$PID,\"sku\":\"$SKU\",\"name\":\"Smoke Widget\",\"unitPrice\":199.00,\"quantity\":2}]}")
CODE=$(tail -1 <<<"$CO"); BODY=$(sed '$d' <<<"$CO")
assert_eq "202" "$CODE" "checkout -> 202 ACCEPTED"
OID=$(jget "$BODY" orderId)
echo "  orderId=$OID"

echo "  polling for CONFIRMED..."
ST=""
for i in $(seq 1 20); do
  ST=$(jget "$(curl -fs $GW/api/orders/$OID "${AUTH[@]}")" status)
  [ "$ST" = "CONFIRMED" ] || [ "$ST" = "FAILED" ] && break
  sleep 1
done
assert_eq "CONFIRMED" "$ST" "order reaches CONFIRMED via saga"
assert_eq "SUCCESS" "$(jget "$(curl -fs $GW/api/payments/$OID "${AUTH[@]}")" status)" "payment SUCCESS (via gateway)"
assert_eq "18" "$(jnum "$(curl -fs $GW/api/inventory/stock/$SKU "${AUTH[@]}")" availableQty)" "stock consumed 2 of 20 -> 18"

echo
echo "== 8. idempotent checkout (same key) =="
# POST is not auto-retried at the gateway (only GETs are), so absorb a transient blip here ourselves.
# grep-based extraction so an unexpected error body never breaks parsing.
OID2=""
for i in $(seq 1 10); do
  RESP=$(curl -s -w '\n%{http_code}' -X POST $GW/api/orders/checkout "${AUTH[@]}" -H 'Content-Type: application/json' \
    -H "Idempotency-Key: $IDEM" \
    -d "{\"currency\":\"INR\",\"customerName\":\"Smoke Tester\",\"customerPhone\":\"9990000002\",\"deliveryAddress\":\"1 Test Lane, Bengaluru\",\"items\":[{\"productId\":$PID,\"sku\":\"$SKU\",\"name\":\"Smoke Widget\",\"unitPrice\":199.00,\"quantity\":2}]}")
  RC=$(tail -1 <<<"$RESP")
  if [ "$RC" = "202" ]; then
    OID2=$(sed '$d' <<<"$RESP" | grep -o '"orderId":"[^"]*"' | head -1 | cut -d'"' -f4)
    [ -n "$OID2" ] && break
  fi
  sleep 1
done
assert_eq "$OID" "$OID2" "same Idempotency-Key -> same order (no double charge)"

echo
echo "== 8b. search (OpenSearch secondary index; falls back to Postgres ILIKE if down) =="
# Public, like browse — no token (the /api/catalog/products prefix is in AuthFilter PUBLIC_PATHS).
assert_eq "200" "$(curl -fs -o /dev/null -w '%{http_code}' "$GW/api/catalog/products/search?q=shirt")" "GET /products/search without token -> 200"
# Backfill indexed the Flyway seed: a generic term hits the seeded catalog (proves startup backfill ran).
curl -fs "$GW/api/catalog/products/search?q=shirt" | grep -q "Cotton Round-Neck T-Shirt" \
  && ok "search finds backfilled seed (q=shirt)" || bad "search finds backfilled seed (q=shirt)"
# Fuzziness/typo tolerance (AUTO): a misspelling still matches. NOTE: only OpenSearch is fuzzy — the
# Postgres ILIKE fallback is substring-only, so this asserts the OpenSearch path specifically.
curl -fs "$GW/api/catalog/products/search?q=shrt" | grep -q "Cotton Round-Neck T-Shirt" \
  && ok "search is typo-tolerant (q=shrt -> shirt)" || bad "search is typo-tolerant (q=shrt -> shirt)"
# Dual-write + cache-bypass: the per-run SKU created in step 3 is findable. Poll to absorb the
# OpenSearch refresh interval (~1s) — search is deliberately NOT cached, so no eviction lag.
SRCH_OK=""
for i in $(seq 1 10); do
  curl -fs "$GW/api/catalog/products/search?q=Smoke" | grep -q "$SKU" && { SRCH_OK=1; break; }
  sleep 1
done
[ -n "$SRCH_OK" ] && ok "just-created SKU findable via search (dual-write, q=Smoke)" || bad "just-created SKU findable via search (dual-write, q=Smoke)"

echo
echo "== 8c. recommendations (hybrid: co-purchase first, content-based fills, category fallback) =="
# Co-purchase needs a PAIR bought together in CONFIRMED orders. Use TWO FRESH products A2+B2 (same
# category, distinct from the step-7 widget) so this block's stock consumption never perturbs step 9's
# inventory-survives-restart assertion. Place TWO orders each containing A2 AND B2; A2's recs must then
# surface B2 (behavioral signal). This pillar is build-gate-blind (Flyway index + a live order-service,
# [[migration-not-run-by-build-gate]]) — it can ONLY be proven here at runtime.
SKU_A2="$SKU-RA"; SKU_B2="$SKU-RB"
PROD_A2=$(curl -fs -X POST $GW/api/catalog/admin/products "${ADMIN[@]}" -H 'Content-Type: application/json' \
  -d "{\"sku\":\"$SKU_A2\",\"name\":\"Smoke Rec Anchor\",\"description\":\"smoke recommendation anchor gadget\",\"productType\":\"PHYSICAL\",\"category\":\"SmokeRec\",\"basePrice\":299.00,\"currency\":\"INR\"}")
PROD_B2=$(curl -fs -X POST $GW/api/catalog/admin/products "${ADMIN[@]}" -H 'Content-Type: application/json' \
  -d "{\"sku\":\"$SKU_B2\",\"name\":\"Smoke Rec Companion\",\"description\":\"smoke recommendation companion gadget\",\"productType\":\"PHYSICAL\",\"category\":\"SmokeRec\",\"basePrice\":149.00,\"currency\":\"INR\"}")
PID_A2=$(jnum "$PROD_A2" id); PID_B2=$(jnum "$PROD_B2" id)
echo "  rec anchor A2 id=$PID_A2 sku=$SKU_A2 | companion B2 id=$PID_B2 sku=$SKU_B2"
{ [ -n "$PID_A2" ] && [ -n "$PID_B2" ]; } && ok "rec products A2+B2 created" || bad "rec products A2+B2 created"
curl -fs -X POST $GW/api/inventory/admin/stock "${ADMIN[@]}" -H 'Content-Type: application/json' -d "{\"sku\":\"$SKU_A2\",\"quantity\":20}" >/dev/null
curl -fs -X POST $GW/api/inventory/admin/stock "${ADMIN[@]}" -H 'Content-Type: application/json' -d "{\"sku\":\"$SKU_B2\",\"quantity\":20}" >/dev/null \
  && ok "stock seeded A2+B2" || bad "stock seeded A2+B2"

# Two CONFIRMED orders, each = {A2,B2}. Distinct idempotency keys so both actually persist.
place_pair_order() { # $1 = idempotency key
  local co code body oid st
  co=$(curl -fs -w '\n%{http_code}' -X POST $GW/api/orders/checkout "${AUTH[@]}" \
    -H 'Content-Type: application/json' -H "Idempotency-Key: $1" \
    -d "{\"currency\":\"INR\",\"customerName\":\"Smoke Tester\",\"customerPhone\":\"9990000002\",\"deliveryAddress\":\"1 Test Lane, Bengaluru\",\"items\":[{\"productId\":$PID_A2,\"sku\":\"$SKU_A2\",\"name\":\"Smoke Rec Anchor\",\"unitPrice\":299.00,\"quantity\":1},{\"productId\":$PID_B2,\"sku\":\"$SKU_B2\",\"name\":\"Smoke Rec Companion\",\"unitPrice\":149.00,\"quantity\":1}]}")
  code=$(tail -1 <<<"$co"); body=$(sed '$d' <<<"$co")
  [ "$code" = "202" ] || { echo "    checkout $1 -> $code"; return 1; }
  oid=$(jget "$body" orderId)
  for i in $(seq 1 25); do
    st=$(jget "$(curl -fs $GW/api/orders/$oid "${AUTH[@]}")" status)
    { [ "$st" = "CONFIRMED" ] || [ "$st" = "FAILED" ]; } && break
    sleep 1
  done
  echo "    order $oid -> $st"
  [ "$st" = "CONFIRMED" ]
}
place_pair_order "$IDEM-cp1" && place_pair_order "$IDEM-cp2" \
  && ok "two CONFIRMED orders containing A2+B2 (co-purchase pair)" || bad "two CONFIRMED A2+B2 orders"

# Recs are public (the /api/catalog/products prefix is in AuthFilter PUBLIC_PATHS) and best-effort.
assert_eq "200" "$(curl -fs -o /dev/null -w '%{http_code}' "$GW/api/catalog/products/$PID_A2/recommendations")" \
  "GET /products/{A2}/recommendations without token -> 200 (public)"
# Co-purchase reads order_items synchronously (native SQL) — no eventual-consistency lag.
RECS=$(curl -fs "$GW/api/catalog/products/$PID_A2/recommendations")
echo "$RECS" | grep -q "\"id\":$PID_B2," && ok "recs include co-purchase partner B2 (id=$PID_B2)" || bad "recs include co-purchase partner B2"
echo "$RECS" | grep -q "\"id\":$PID_A2," && bad "recs MUST NOT include the anchor A2 itself" || ok "recs exclude anchor A2 (id=$PID_A2)"
# Degradation: with order-service stopped the co-purchase signal vanishes but the endpoint must NOT 503
# (content-based / same-category fallback carries it). Restart after so step 9's restart test is clean.
echo "  stopping order-service (degradation check)..."
docker compose stop order-service >/dev/null 2>&1
assert_eq "200" "$(curl -fs -o /dev/null -w '%{http_code}' "$GW/api/catalog/products/$PID_A2/recommendations")" \
  "recs still 200 with order-service DOWN (degrade, never 503)"
echo "  restarting order-service..."
docker compose start order-service >/dev/null 2>&1

echo
echo "== 9. PERSISTENCE: full stack down -> up, data survives =="
echo "  bringing stack down (keeping volumes)..."
docker compose down >/dev/null 2>&1
echo "  bringing stack back up..."
GATEWAY_PORT="${GATEWAY_PORT:-8443}" docker compose up -d >/dev/null 2>&1
echo "  waiting for gateway..."
for i in $(seq 1 60); do
  curl -fs $GW/actuator/health 2>/dev/null | grep -q '"status":"UP"' && break
  sleep 2
done
# Gateway-UP does NOT mean the downstream services have finished booting — they come up seconds later.
# Get a fresh token (and prove auth-service is back), then poll the actual endpoints until ready.
TOK2=""
for i in $(seq 1 30); do
  TOK2=$(jget "$(curl -s -X POST $GW/auth/guest -H 'Content-Type: application/json' -d '{"name":"Smoke Shopper"}')" token)
  [ -n "$TOK2" ] && break
  sleep 2
done
AUTH2=(-H "Authorization: Bearer $TOK2")
ST_AFTER=""
for i in $(seq 1 30); do
  ST_AFTER=$(jget "$(curl -s $GW/api/orders/$OID "${AUTH2[@]}")" status)
  [ -n "$ST_AFTER" ] && break
  sleep 2
done
assert_eq "CONFIRMED" "$ST_AFTER" "order $OID still CONFIRMED after restart"
# catalog-service is a separate JPA service that can still be cold-starting (~24s) after gateway-UP,
# so poll for readiness like the order/inventory checks do — a single shot here is a false-negative race.
CAT_OK=""
for i in $(seq 1 30); do
  curl -fs $GW/api/catalog/products 2>/dev/null | grep -q "$SKU" && { CAT_OK=1; break; }
  sleep 2
done
[ -n "$CAT_OK" ] && ok "catalog product survived restart" || bad "catalog product survived restart"
STK_AFTER=""
for i in $(seq 1 30); do
  STK_AFTER=$(jnum "$(curl -s $GW/api/inventory/stock/$SKU "${AUTH2[@]}")" availableQty)
  [ -n "$STK_AFTER" ] && break
  sleep 2
done
assert_eq "18" "$STK_AFTER" "inventory level survived restart (18)"

echo
echo "================ RESULT: $PASS passed, $FAIL failed ================"
[ "$FAIL" -eq 0 ]
