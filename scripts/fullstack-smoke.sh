#!/usr/bin/env bash
# Full-stack acceptance smoke — everything through the gateway (the real edge), proving:
#   routing (gateway -> each service) · auth (guest JWT -> X-User-Id injection) ·
#   public catalog browse (no token) · the checkout saga end-to-end ·
#   and DATA SURVIVES A FULL RESTART (compose down -> up, order still there).
#
# Re-runnable: each run uses a unique SKU so it never collides with prior runs' catalog rows.
# Usage: GATEWAY_PORT=8088 bash scripts/fullstack-smoke.sh
set -uo pipefail

GW="http://localhost:${GATEWAY_PORT:-8080}"
SKU="SMOKE-$$-${RANDOM}"          # unique per run -> script is idempotent across repeated runs
IDEM="idem-$SKU"                  # checkout idempotency key, also unique per run (else a re-run replays the old order)
PASS=0; FAIL=0
ok()  { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
assert_eq() { [ "$1" = "$2" ] && ok "$3 (=$2)" || bad "$3 (expected '$1' got '$2')"; }
jget() { sed -n "s/.*\"$2\":\"\\([^\"]*\\)\".*/\\1/p" <<<"$1"; }      # string field
jnum() { sed -n "s/.*\"$2\":\\([0-9]*\\).*/\\1/p" <<<"$1"; }          # numeric field
echo "Using SKU=$SKU"

echo
echo "== 0. edge health =="
assert_eq "UP" "$(curl -fs $GW/actuator/health | grep -o '\"status\":\"UP\"' | head -1 | cut -d'"' -f4)" "gateway health UP"

echo
echo "== 1. guest auth (issues JWT) =="
TOK=$(jget "$(curl -fs -X POST $GW/auth/guest -H 'Content-Type: application/json' -d '{"name":"Smoke Shopper"}')" token)
[ -n "$TOK" ] && ok "guest token issued" || bad "guest token issued"
AUTH=(-H "Authorization: Bearer $TOK")

echo
echo "== 2. protected route rejects anonymous =="
assert_eq "401" "$(curl -fs -o /dev/null -w '%{http_code}' $GW/api/orders)" "GET /api/orders without token -> 401"

echo
echo "== 3. seed catalog (admin, needs token) =="
PROD=$(curl -fs -X POST $GW/api/catalog/admin/products "${AUTH[@]}" -H 'Content-Type: application/json' \
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
curl -fs -X POST $GW/api/inventory/admin/stock "${AUTH[@]}" -H 'Content-Type: application/json' \
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
  -d "{\"currency\":\"INR\",\"items\":[{\"productId\":$PID,\"sku\":\"$SKU\",\"name\":\"Smoke Widget\",\"unitPrice\":199.00,\"quantity\":2}]}")
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
    -d "{\"currency\":\"INR\",\"items\":[{\"productId\":$PID,\"sku\":\"$SKU\",\"name\":\"Smoke Widget\",\"unitPrice\":199.00,\"quantity\":2}]}")
  RC=$(tail -1 <<<"$RESP")
  if [ "$RC" = "202" ]; then
    OID2=$(sed '$d' <<<"$RESP" | grep -o '"orderId":"[^"]*"' | head -1 | cut -d'"' -f4)
    [ -n "$OID2" ] && break
  fi
  sleep 1
done
assert_eq "$OID" "$OID2" "same Idempotency-Key -> same order (no double charge)"

echo
echo "== 9. PERSISTENCE: full stack down -> up, data survives =="
echo "  bringing stack down (keeping volumes)..."
docker compose down >/dev/null 2>&1
echo "  bringing stack back up..."
GATEWAY_PORT="${GATEWAY_PORT:-8080}" docker compose up -d >/dev/null 2>&1
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
curl -fs $GW/api/catalog/products | grep -q "$SKU" && ok "catalog product survived restart" || bad "catalog product survived restart"
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
