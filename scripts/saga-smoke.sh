#!/usr/bin/env bash
# Full checkout-saga smoke test: order-service (outbox + poller saga) driving
# inventory-service (reserve/commit/release) and payment-service (mock charge),
# each on its own Postgres, all on one docker network. Exercises:
#   A. happy path        -> PENDING -> poller -> CONFIRMED, stock consumed, payment SUCCESS
#   B. idempotent retry  -> same Idempotency-Key returns same order, no double charge
#   C. payment decline   -> .66 mock hook -> order FAILED, inventory released
#   D. oversell          -> reserve 4xx -> order FAILED, no stock movement
set -uo pipefail

NET=saga-net
INV_IMG=inventory-service:smoke
PAY_IMG=payment-service:smoke
ORD_IMG=quick-ecommerce/order-service:dev
PASS=0; FAIL=0

ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
# assert_eq <expected> <actual> <msg>
assert_eq() { [ "$1" = "$2" ] && ok "$3 (=$2)" || bad "$3 (expected '$1' got '$2')"; }

cleanup() {
  echo "== cleanup =="
  docker rm -f saga-inv saga-pay saga-ord saga-invdb saga-paydb saga-orderdb >/dev/null 2>&1
  docker network rm $NET >/dev/null 2>&1
}
trap cleanup EXIT
cleanup  # clean any leftovers from a prior run

echo "== network + databases =="
docker network create $NET >/dev/null
for db in invdb:inventorydb paydb:paymentdb orderdb:orderdb; do
  name="saga-${db%%:*}"; dbname="${db##*:}"
  docker run -d --name "$name" --network $NET \
    -e POSTGRES_DB="$dbname" -e POSTGRES_PASSWORD=postgres postgres:16-alpine >/dev/null
done

echo "== waiting for postgres =="
for name in saga-invdb saga-paydb saga-orderdb; do
  for i in $(seq 1 30); do
    docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 1
  done
done

echo "== services =="
docker run -d --name saga-inv --network $NET -p 8092:8092 \
  -e DB_HOST=saga-invdb -e DB_NAME=inventorydb $INV_IMG >/dev/null
docker run -d --name saga-pay --network $NET -p 8093:8093 \
  -e DB_HOST=saga-paydb -e DB_NAME=paymentdb $PAY_IMG >/dev/null
docker run -d --name saga-ord --network $NET -p 8094:8094 \
  -e DB_HOST=saga-orderdb -e DB_NAME=orderdb \
  -e INVENTORY_SERVICE_URL=http://saga-inv:8092 \
  -e PAYMENT_SERVICE_URL=http://saga-pay:8093 \
  -e OUTBOX_POLL_INTERVAL_MS=1000 $ORD_IMG >/dev/null

echo "== waiting for health =="
for p in 8092:saga-inv 8093:saga-pay 8094:saga-ord; do
  port="${p%%:*}"; svc="${p##*:}"
  up=""
  for i in $(seq 1 60); do
    if curl -fs "http://localhost:$port/actuator/health" 2>/dev/null | grep -q '"status":"UP"'; then up=1; break; fi
    sleep 1
  done
  [ -n "$up" ] && echo "  $svc UP" || { echo "  $svc NEVER CAME UP — logs:"; docker logs "$svc" 2>&1 | tail -40; exit 1; }
done

INV=http://localhost:8092/api/inventory
PAY=http://localhost:8093/api/payments
ORD=http://localhost:8094/api/orders

echo "== seed stock =="
for s in "WIDGET-A:50" "WIDGET-C:50" "WIDGET-D:5"; do
  curl -fs -X POST "$INV/admin/stock" -H 'Content-Type: application/json' \
    -d "{\"sku\":\"${s%%:*}\",\"quantity\":${s##*:}}" >/dev/null \
    && echo "  seeded ${s%%:*}=${s##*:}" || echo "  seed FAILED ${s%%:*}"
done

# poll_status <orderId> <target> -> echoes final status (gives up after ~15s)
poll_status() {
  local oid="$1" target="$2" st=""
  for i in $(seq 1 15); do
    st=$(curl -fs "$ORD/$oid" | sed -n 's/.*"status":"\([A-Z]*\)".*/\1/p')
    [ "$st" = "$target" ] && break
    [ "$st" = "FAILED" ] || [ "$st" = "CONFIRMED" ] && break
    sleep 1
  done
  echo "$st"
}

echo
echo "== TEST A: happy path =="
RA=$(curl -fs -w '\n%{http_code}' -X POST "$ORD/checkout" \
  -H 'Content-Type: application/json' -H 'X-User-Id: user-1' -H 'Idempotency-Key: key-A' \
  -d '{"currency":"INR","customerName":"Saga Tester","customerPhone":"9990000001","deliveryAddress":"1 Test Lane, Bengaluru","items":[{"productId":1,"sku":"WIDGET-A","name":"Widget A","unitPrice":100.00,"quantity":2}]}')
CODE_A=$(echo "$RA" | tail -1); BODY_A=$(echo "$RA" | sed '$d')
assert_eq "202" "$CODE_A" "checkout returns 202 ACCEPTED"
OID_A=$(echo "$BODY_A" | sed -n 's/.*"orderId":"\([^"]*\)".*/\1/p')
echo "  orderId=$OID_A"
ST_A=$(poll_status "$OID_A" CONFIRMED)
assert_eq "CONFIRMED" "$ST_A" "order reaches CONFIRMED via poller"
PAY_A=$(curl -fs "$PAY/$OID_A" | sed -n 's/.*"status":"\([A-Z]*\)".*/\1/p')
assert_eq "SUCCESS" "$PAY_A" "payment captured SUCCESS"
STK_A=$(curl -fs "$INV/stock/WIDGET-A")
echo "  stock WIDGET-A: $STK_A"
AVAIL_A=$(echo "$STK_A" | sed -n 's/.*"availableQty":\([0-9]*\).*/\1/p')
assert_eq "48" "$AVAIL_A" "stock consumed 2 of 50 -> available 48"

echo
echo "== TEST B: idempotent retry (same key-A) =="
RB=$(curl -fs -X POST "$ORD/checkout" \
  -H 'Content-Type: application/json' -H 'X-User-Id: user-1' -H 'Idempotency-Key: key-A' \
  -d '{"currency":"INR","customerName":"Saga Tester","customerPhone":"9990000001","deliveryAddress":"1 Test Lane, Bengaluru","items":[{"productId":1,"sku":"WIDGET-A","name":"Widget A","unitPrice":100.00,"quantity":2}]}')
OID_B=$(echo "$RB" | sed -n 's/.*"orderId":"\([^"]*\)".*/\1/p')
assert_eq "$OID_A" "$OID_B" "same Idempotency-Key returns the same order"
sleep 2
STK_B=$(curl -fs "$INV/stock/WIDGET-A")
AVAIL_B=$(echo "$STK_B" | sed -n 's/.*"availableQty":\([0-9]*\).*/\1/p')
assert_eq "48" "$AVAIL_B" "no double-charge / no extra stock movement (still 48)"

echo
echo "== TEST C: payment decline (.66 hook) =="
RC=$(curl -fs -X POST "$ORD/checkout" \
  -H 'Content-Type: application/json' -H 'X-User-Id: user-2' -H 'Idempotency-Key: key-C' \
  -d '{"currency":"INR","customerName":"Saga Tester","customerPhone":"9990000001","deliveryAddress":"1 Test Lane, Bengaluru","items":[{"productId":3,"sku":"WIDGET-C","name":"Widget C","unitPrice":100.66,"quantity":1}]}')
OID_C=$(echo "$RC" | sed -n 's/.*"orderId":"\([^"]*\)".*/\1/p')
echo "  orderId=$OID_C (total 100.66 -> mock decline)"
ST_C=$(poll_status "$OID_C" FAILED)
assert_eq "FAILED" "$ST_C" "order FAILED on payment decline"
PAY_C=$(curl -fs "$PAY/$OID_C" | sed -n 's/.*"status":"\([A-Z]*\)".*/\1/p')
assert_eq "FAILED" "$PAY_C" "payment recorded FAILED"
STK_C=$(curl -fs "$INV/stock/WIDGET-C")
echo "  stock WIDGET-C: $STK_C"
AVAIL_C=$(echo "$STK_C" | sed -n 's/.*"availableQty":\([0-9]*\).*/\1/p')
RESV_C=$(echo "$STK_C" | sed -n 's/.*"reservedQty":\([0-9]*\).*/\1/p')
assert_eq "50" "$AVAIL_C" "inventory released -> available back to 50"
assert_eq "0" "$RESV_C" "no lingering hold -> reserved 0"

echo
echo "== TEST D: oversell (qty 100 > stock 5) =="
RD=$(curl -fs -X POST "$ORD/checkout" \
  -H 'Content-Type: application/json' -H 'X-User-Id: user-3' -H 'Idempotency-Key: key-D' \
  -d '{"currency":"INR","customerName":"Saga Tester","customerPhone":"9990000001","deliveryAddress":"1 Test Lane, Bengaluru","items":[{"productId":4,"sku":"WIDGET-D","name":"Widget D","unitPrice":10.00,"quantity":100}]}')
OID_D=$(echo "$RD" | sed -n 's/.*"orderId":"\([^"]*\)".*/\1/p')
echo "  orderId=$OID_D"
ST_D=$(poll_status "$OID_D" FAILED)
assert_eq "FAILED" "$ST_D" "order FAILED on insufficient stock"
STK_D=$(curl -fs "$INV/stock/WIDGET-D")
echo "  stock WIDGET-D: $STK_D"
AVAIL_D=$(echo "$STK_D" | sed -n 's/.*"availableQty":\([0-9]*\).*/\1/p')
assert_eq "5" "$AVAIL_D" "no stock movement on oversell (still 5)"

echo
echo "================ RESULT: $PASS passed, $FAIL failed ================"
[ "$FAIL" -eq 0 ]
