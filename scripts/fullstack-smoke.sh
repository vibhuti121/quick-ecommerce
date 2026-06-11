#!/usr/bin/env bash
# Full-stack acceptance smoke — everything through the gateway (the real edge), proving:
#   routing (gateway -> each service) · auth (guest JWT -> X-User-Id injection) ·
#   public catalog browse (no token) · the checkout saga end-to-end ·
#   notify-me launch-interest capture (public POST, idempotent, admin-gated read) ·
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
# Decode a base64url JWT segment (re-pad, map URL alphabet) — used to read the token's sub claim.
b64url_decode() {
  local s="$1" m
  m=$(( ${#s} % 4 ))
  [ "$m" -eq 2 ] && s="${s}=="
  [ "$m" -eq 3 ] && s="${s}="
  printf '%s' "$s" | tr '_-' '/+' | openssl base64 -d -A 2>/dev/null
}

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
# A NON-guest login JWT for an arbitrary user id. The videocall grant gate rejects guest-* subjects, so
# its happy path needs a "real" logged-in user. role=USER (no admin powers). Same HS256 + JWT_SECRET trust
# path as mint_admin_jwt (see that note). $1 = subject (the user id baked into sub, also drives the email).
mint_user_jwt() {
  local sub="$1" hdr pl now exp sig
  now=$(date +%s); exp=$((now + 3600))
  hdr=$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)
  pl=$(printf '%s' "{\"sub\":\"$sub\",\"email\":\"$sub@local\",\"displayName\":\"Smoke VC User\",\"role\":\"USER\",\"iat\":$now,\"exp\":$exp}" | b64url)
  sig=$(printf '%s' "$hdr.$pl" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)
  printf '%s.%s.%s' "$hdr" "$pl" "$sig"
}
# Decode one base64url JWT segment (e.g. the grant payload) to raw JSON: restore +/ then pad to a multiple
# of 4 before base64-decoding. Lets the smoke inspect the grant's claims (aud/exp/roomId/maxParticipants).
b64url_decode() {
  local s="$1" m
  m=$(( ${#s} % 4 ))
  [ "$m" -eq 2 ] && s="${s}=="
  [ "$m" -eq 3 ] && s="${s}="
  printf '%s' "$s" | tr '_-' '/+' | openssl base64 -d -A 2>/dev/null
}

echo "Using SKU=$SKU"

echo
echo "== 0. edge health =="
assert_eq "UP" "$(curl -fs $GW/actuator/health | grep -o '\"status\":\"UP\"' | head -1 | cut -d'"' -f4)" "gateway health UP"

echo
echo "== 0b. storefront served at the edge (B1) =="
# GET / falls through the catch-all (Path=/**, order:1) to the frontend nginx container. Proves the
# SPA ships same-origin AND that the catch-all did NOT shadow /actuator (UP above) or /api (steps below).
ROOT=$(curl -fs -w '\n%{http_code}' "$GW/")
assert_eq "200" "$(tail -1 <<<"$ROOT")" "GET / serves the storefront -> 200"
grep -q '<div id="root"' <<<"$ROOT" && ok "response is the SPA shell (#root)" || bad "response is the SPA shell (#root)"

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
# size=200 (same as the storefront's getProducts): the default page is 20, so once the catalog holds
# >20 products (richer seed + accumulated test SKUs on a persistent volume) the just-created SKU lands
# on a later page and a default-page grep false-negatives.
curl -fs "$GW/api/catalog/products?size=200" | grep -q "$SKU" && ok "seeded product visible in public browse" || bad "seeded product visible in public browse"

echo
echo "== 4b. MaLLADE provenance seeded (B3 — proves V3 migration ran at startup) =="
# The V3 Flyway seed adds MAL-* products carrying attributes.provenance. The build gate never runs
# Flyway, so this is the ONLY check that the migration applied AND that provenance round-trips through
# the catalog API + Redis cache. (size=200 so the seeded rows aren't past the default page.)
MAL=$(curl -fs "$GW/api/catalog/products?size=200")
echo "$MAL" | grep -q "MAL-HONEY-COORG-500" && ok "MaLLADE product MAL-HONEY-COORG-500 present (V3 seed applied)" || bad "MaLLADE product MAL-HONEY-COORG-500 present (V3 seed applied)"
echo "$MAL" | grep -q '"provenance"' && ok "product carries attributes.provenance" || bad "product carries attributes.provenance"
echo "$MAL" | grep -q 'Coorg (Kodagu), Karnataka' && ok "provenance.origin round-trips through the API" || bad "provenance.origin round-trips through the API"
echo "$MAL" | grep -q '"status":"authorized"' && ok "GI-authorized example present (badge-eligible)" || bad "GI-authorized example present (badge-eligible)"

echo
echo "== 4c. notify-me launch-interest capture (public POST + admin-gated read; Flyway V4) =="
# The storefront "🔔 Notify me" popups POST here; rows land in catalog's notify_signups table (Flyway
# V4 — build-gate-blind, so this is the ONLY check the migration applied) and the founder reads them via
# the admin GET. Public write, admin-only read. Idempotent on (topic, phone): a re-submit returns the
# same row, mirroring the client's localStorage dedupe. Unique-ish valid 10-digit Indian mobile per run
# (leading 9 satisfies the [6-9] server @Pattern) so reruns don't accumulate distinct rows.
NPHONE="9$(printf '%09d' $((RANDOM * RANDOM % 1000000000)))"
NRESP=$(curl -fs -w '\n%{http_code}' -X POST $GW/api/catalog/notify -H 'Content-Type: application/json' \
  -d "{\"topic\":\"honey\",\"phone\":\"$NPHONE\"}")
NCODE=$(tail -1 <<<"$NRESP"); NBODY=$(sed '$d' <<<"$NRESP")
assert_eq "201" "$NCODE" "POST /api/catalog/notify without token -> 201 (public, in PUBLIC_PATHS)"
NID=$(jnum "$NBODY" id)
[ -n "$NID" ] && ok "notify signup persisted (id=$NID sku-free)" || bad "notify signup persisted"
# Idempotency: same (topic, phone) -> same id, no second row. POST is not auto-retried at the gateway
# (only GETs are), so absorb a transient blip on the rapid second call ourselves (same pattern as the
# idempotent-checkout step below). A real duplicate would surface as a DIFFERENT id and still fail.
NID2=""
for i in $(seq 1 10); do
  NRR=$(curl -s -w '\n%{http_code}' -X POST $GW/api/catalog/notify -H 'Content-Type: application/json' \
    -d "{\"topic\":\"honey\",\"phone\":\"$NPHONE\"}")
  if [ "$(tail -1 <<<"$NRR")" = "201" ]; then
    NID2=$(jnum "$(sed '$d' <<<"$NRR")" id)
    [ -n "$NID2" ] && break
  fi
  sleep 1
done
assert_eq "$NID" "$NID2" "re-POST same (topic,phone) -> same id (idempotent, no dup row)"
# Validation: a junk phone is rejected by the server @Pattern (defence in depth on a public endpoint).
assert_eq "400" "$(curl -fs -o /dev/null -w '%{http_code}' -X POST $GW/api/catalog/notify \
  -H 'Content-Type: application/json' -d '{"topic":"honey","phone":"12345"}')" "POST invalid phone -> 400 (validation)"
# Admin read is gated by BOTH the gateway ADMIN_PATHS prefix and the in-service AdminRoleFilter.
assert_eq "401" "$(curl -fs -o /dev/null -w '%{http_code}' $GW/api/catalog/admin/notify)" \
  "GET /api/catalog/admin/notify without token -> 401"
NADM=$(curl -fs -w '\n%{http_code}' $GW/api/catalog/admin/notify "${ADMIN[@]}")
assert_eq "200" "$(tail -1 <<<"$NADM")" "GET admin/notify with ADMIN token -> 200"
sed '$d' <<<"$NADM" | grep -q "$NPHONE" && ok "admin list contains the signup (phone $NPHONE)" || bad "admin list contains the signup"

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
# size=200: q=Smoke matches every accumulated "Smoke Widget" from prior local runs; the default
# page (20) is the oldest docs, so the just-created (high-id) SKU is paginated out on a dirty
# volume (false negative). Fresh CI has one match so this is moot there — same fix as browse.
SRCH_OK=""
for i in $(seq 1 10); do
  curl -fs "$GW/api/catalog/products/search?q=Smoke&size=200" | grep -q "$SKU" && { SRCH_OK=1; break; }
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
echo "== 8e. our own sign-in (email/phone + password, and phone OTP) =="
# auth-service is the only thing that knows HOW a user logged in; everything downstream trusts the JWT.
# These new front doors (POST /auth/register, /auth/login, /auth/otp/*) all end in the SAME mint as the
# guest/Google paths. Security posture proven here: self-registered ids are namespaced usr-<uuid> (non-
# guest), wrong creds + unknown identifier give the SAME generic 401 (anti-enumeration), a dup register
# 409s, and the OTP request is neutral. The OTP happy path can only mint a token when the backend runs
# with OTP_DEV_ECHO=true (it echoes the code) — otherwise we assert the neutral envelope + generic reject
# only, so this block stays green regardless of that flag.
# Dotted TLD: the backend identifier guard requires ^...@...\..+$ (a real email shape), so @local 400s.
AEMAIL="smoke-$$-${RANDOM}@smoke.local"
APASS="SmokePass$$word"
APHONE=$(printf '9%09d' $(( (RANDOM*RANDOM) % 1000000000 )))   # 10-digit, starts 9 -> passes ^\+?[0-9]{8,15}$

# register -> 201 + token; token sub is namespaced usr- (a real, non-guest account) with role USER.
REG=$(curl -fs -w '\n%{http_code}' -X POST $GW/auth/register -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"$AEMAIL\",\"password\":\"$APASS\",\"displayName\":\"Smoke Auth\"}")
assert_eq "201" "$(tail -1 <<<"$REG")" "POST /auth/register -> 201"
REG_TOK=$(jget "$(sed '$d' <<<"$REG")" token)
[ -n "$REG_TOK" ] && ok "register issued a token" || bad "register issued a token"
REG_SUB=$(jget "$(b64url_decode "$(cut -d. -f2 <<<"$REG_TOK")")" sub)
case "$REG_SUB" in usr-*) ok "register sub is namespaced usr- (non-guest): $REG_SUB";; *) bad "register sub usr- (got: $REG_SUB)";; esac

# duplicate register -> 409 (registration intentionally reveals existence; login does NOT).
# NB: capture the body (-w + tail), do NOT use `curl -f -o /dev/null` on these error-path asserts.
# With --fail+discard, curl tears down the TLS connection the instant it sees the 4xx status line,
# before the gateway finishes streaming the (tiny) error body; reactor-netty then logs a failed
# write and HttpWebHandlerAdapter completes the exchange 500, so -w reports a spurious 500. Reading
# the body keeps the connection open through the full response — the endpoint itself returns 409.
DUP=$(curl -sk -w '\n%{http_code}' -X POST $GW/auth/register -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"$AEMAIL\",\"password\":\"$APASS\"}")
assert_eq "409" "$(tail -1 <<<"$DUP")" "re-register same identifier -> 409"

# login right creds -> 200 + token.
LOG=$(curl -fs -w '\n%{http_code}' -X POST $GW/auth/login -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"$AEMAIL\",\"password\":\"$APASS\"}")
assert_eq "200" "$(tail -1 <<<"$LOG")" "POST /auth/login correct creds -> 200"
[ -n "$(jget "$(sed '$d' <<<"$LOG")" token)" ] && ok "login issued a token" || bad "login issued a token"

# Anti-enumeration: wrong password AND unknown identifier must both yield the SAME generic 401.
# Capture the body (see the dup-register note above) — `curl -f -o /dev/null` on a 4xx spuriously
# reports 500 by closing the connection mid-error-body.
WRONGPW=$(curl -sk -w '\n%{http_code}' -X POST $GW/auth/login -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"$AEMAIL\",\"password\":\"definitely-wrong\"}")
WRONGPW=$(tail -1 <<<"$WRONGPW")
UNKNOWN=$(curl -sk -w '\n%{http_code}' -X POST $GW/auth/login -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"nobody-$$-${RANDOM}@smoke.local\",\"password\":\"$APASS\"}")
UNKNOWN=$(tail -1 <<<"$UNKNOWN")
assert_eq "401" "$WRONGPW" "login wrong password -> 401"
assert_eq "$WRONGPW" "$UNKNOWN" "unknown identifier returns SAME status as wrong password (no enumeration)"

# OTP request is neutral {sent:true}. If dev-echo is on, complete the happy path to a non-guest token.
OTP_REQ=$(curl -fs -X POST $GW/auth/otp/request -H 'Content-Type: application/json' -d "{\"phone\":\"$APHONE\"}")
echo "$OTP_REQ" | grep -q '"sent":true' && ok "POST /auth/otp/request -> {sent:true} (neutral)" || bad "otp/request neutral (got: $OTP_REQ)"
DEVCODE=$(jget "$OTP_REQ" devCode)
# wrong code -> generic 401 (NO_CODE/MISMATCH collapse; never an oracle).
OVW=$(curl -sk -w '\n%{http_code}' -X POST $GW/auth/otp/verify -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$APHONE\",\"code\":\"000000\"}")
assert_eq "401" "$(tail -1 <<<"$OVW")" "otp/verify wrong code -> 401 (generic)"
if [ -n "$DEVCODE" ]; then
  OTP_V=$(curl -fs -w '\n%{http_code}' -X POST $GW/auth/otp/verify -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$APHONE\",\"code\":\"$DEVCODE\"}")
  assert_eq "200" "$(tail -1 <<<"$OTP_V")" "otp/verify correct dev-echo code -> 200"
  OTP_SUB=$(jget "$(b64url_decode "$(cut -d. -f2 <<<"$(jget "$(sed '$d' <<<"$OTP_V")" token)")")" sub)
  case "$OTP_SUB" in usr-*) ok "otp login sub is namespaced usr- (non-guest): $OTP_SUB";; *) bad "otp sub usr- (got: $OTP_SUB)";; esac
else
  echo "  SKIP: OTP happy-path verify (OTP_DEV_ECHO not enabled — no code to read)"
fi

echo
echo "== 8d. videocall grant gate (login + eligibility + silent 5h cooldown; two-token model) =="
# The gated video-call pillar: a logged-in customer who has shown interest (Tally) gets a SHORT-LIVED,
# ROOM-BOUND call GRANT — a SEPARATE token from the login JWT, signed with VIDEOCALL_GRANT_SECRET — and
# that grant (not the login token) is the only thing that admits a socket. This block proves the server-
# side gate end-to-end through the edge: guest-rejection, eligibility-required, grant minting + claims,
# and the SILENT 5h cooldown. It is build-gate-blind (videocall-service boots Flyway V1 + needs Redis,
# [[migration-not-run-by-build-gate]]) so it can ONLY be proven here at runtime.
# Out of band (need a real socket.io client, not curl): the WS handshake through wss://:8443, max-3
# room-full, and the exp kill-timer — covered by the standalone security smoke, not this curl script.
# A UNIQUE per-run user id so the 5h cooldown set on the first grant never blocks a re-run (mirrors the
# unique-SKU idempotency pattern above). Its grant is single-use here; we never connect a socket with it.
VC_USER="smoke-vc-$$-${RANDOM}"
VC_TOK=$(mint_user_jwt "$VC_USER")
VCAUTH=(-H "Authorization: Bearer $VC_TOK")
VB="$GW/api/videocall"
# Poll grant-before-eligibility: doubles as the videocall-service readiness gate (it cold-starts like the
# other JPA services) AND asserts the gate's default-deny — a logged-in but NOT-yet-eligible user gets the
# neutral {"available":false} (no reason, no countdown), indistinguishable from cooldown/no-capacity.
VC_PRE=""
for i in $(seq 1 30); do
  VC_PRE=$(curl -s -X POST $VB/grant "${VCAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
  echo "$VC_PRE" | grep -q '"available"' && break
  sleep 2
done
echo "$VC_PRE" | grep -q '"available":false' && ok "grant before eligibility -> {available:false} (default-deny)" || bad "grant before eligibility -> available:false (got: $VC_PRE)"
echo "$VC_PRE" | grep -q '"grant"' && bad "no-eligibility response MUST NOT leak a grant" || ok "no-eligibility response carries no grant (silent)"

# Record Tally eligibility for this user (idempotent upsert keyed on user id). 201 on first create.
VC_ELIG=$(curl -fs -w '\n%{http_code}' -X POST $VB/eligibility "${VCAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
VC_ELIG_CODE=$(tail -1 <<<"$VC_ELIG"); VC_ELIG_BODY=$(sed '$d' <<<"$VC_ELIG")
assert_eq "201" "$VC_ELIG_CODE" "POST /videocall/eligibility -> 201 (interest recorded)"
echo "$VC_ELIG_BODY" | grep -q '"eligible":true' && ok "eligibility response says eligible:true" || bad "eligibility response says eligible:true (got: $VC_ELIG_BODY)"

# Now eligible + no cooldown yet -> a grant is issued. Inspect its claims (the two-token security model).
VC_G=$(curl -fs -X POST $VB/grant "${VCAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
echo "$VC_G" | grep -q '"available":true' && ok "grant after eligibility -> {available:true}" || bad "grant after eligibility -> available:true (got: $VC_G)"
VGRANT=$(jget "$VC_G" grant)
VROOM=$(jget "$VC_G" roomId)
[ -n "$VGRANT" ] && ok "grant token present in response" || bad "grant token present in response"
[ -n "$VROOM" ] && ok "grant carries a roomId ($VROOM)" || bad "grant carries a roomId"
# Decode the grant payload and assert the security-relevant claims: single-purpose audience, room binding,
# max-3, and the 10-minute hard cap baked into exp (exp-iat == 600). These are what make it un-replayable.
VC_PL=$(b64url_decode "$(cut -d. -f2 <<<"$VGRANT")")
assert_eq "videocall-grant" "$(jget "$VC_PL" aud)" "grant aud == videocall-grant (single-purpose)"
assert_eq "3" "$(jnum "$VC_PL" maxParticipants)" "grant maxParticipants == 3"
assert_eq "$VROOM" "$(jget "$VC_PL" roomId)" "grant payload roomId matches the response roomId (room-bound)"
VC_IAT=$(jnum "$VC_PL" iat); VC_EXP=$(jnum "$VC_PL" exp)
assert_eq "600" "$(( VC_EXP - VC_IAT ))" "grant lifetime exp-iat == 600s (10-min hard cap)"

# Silent 5h cooldown: an immediate second grant for the SAME user returns the neutral {available:false}
# with no grant and no reason — the user is blocked but "will not know" (cooldown is indistinguishable
# from not-eligible / no-capacity by design). The cooldown was claimed atomically at the first issuance.
VC_CD=$(curl -fs -X POST $VB/grant "${VCAUTH[@]}" -H 'Content-Type: application/json' -d '{}')
echo "$VC_CD" | grep -q '"available":false' && ok "immediate re-grant -> {available:false} (silent 5h cooldown)" || bad "immediate re-grant -> available:false (got: $VC_CD)"
echo "$VC_CD" | grep -q '"grant"' && bad "cooldown response MUST NOT leak a grant" || ok "cooldown response carries no grant + no reason (silent)"

# Guests are rejected outright. Reuse the step-1 guest token (sub = guest-… ) -> neutral {available:false}.
VC_GUEST=$(curl -fs -X POST $VB/grant "${AUTH[@]}" -H 'Content-Type: application/json' -d '{}')
echo "$VC_GUEST" | grep -q '"available":false' && ok "guest grant -> {available:false} (guests not allowed)" || bad "guest grant -> available:false (got: $VC_GUEST)"

# Admin eligibility roster: gateway ADMIN_PATHS + in-service guard. No token -> 401; ADMIN token -> 200
# and the list contains this run's eligible user (proves the eligibility row persisted).
assert_eq "401" "$(curl -fs -o /dev/null -w '%{http_code}' $VB/admin/eligibility)" "GET /videocall/admin/eligibility without token -> 401"
VC_ADM=$(curl -fs -w '\n%{http_code}' $VB/admin/eligibility "${ADMIN[@]}")
assert_eq "200" "$(tail -1 <<<"$VC_ADM")" "GET admin/eligibility with ADMIN token -> 200"
sed '$d' <<<"$VC_ADM" | grep -q "$VC_USER" && ok "admin roster contains the eligible user ($VC_USER)" || bad "admin roster contains the eligible user"

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
  curl -fs "$GW/api/catalog/products?size=200" 2>/dev/null | grep -q "$SKU" && { CAT_OK=1; break; }
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
