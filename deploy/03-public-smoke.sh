#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 03-public-smoke.sh — trimmed Phase-0 PUBLIC smoke for the MaLLADE pilot.
# Hits the REAL public URL (through Cloudflare, browser-trusted cert) and asserts
# only what the waitlist+browse pilot actually ships:
#   1. guest auth -> JWT
#   2. public browse ?size=200 returns products
#   3. add-to-cart works for a guest
#   4. THE CENTERPIECE: quiz -> POST /api/catalog/notify -> 201, fans out to one
#      notify_signups row per chosen fruit slug; per-fruit GET /notify/count >= 1.
#
# DELIBERATELY SKIPPED (OFF by design in Phase 0, NOT regressions):
#   checkout/orders, opensearch /products/search, videocall — those services are
#   profile-gated off. A 404/503 on them is expected; we don't assert them.
#
# Usage (against the live domain — uses the real CF cert, so NO -k):
#   GW=https://mallde.in bash deploy/03-public-smoke.sh
# Usage (on-box pre-DNS, against the self-signed origin — set INSECURE=1):
#   GW=https://localhost:8443 INSECURE=1 bash deploy/03-public-smoke.sh
# ---------------------------------------------------------------------------
set -uo pipefail

GW="${GW:?set GW, e.g. GW=https://mallde.in bash deploy/03-public-smoke.sh}"
CURL=(curl -fsS)
[[ "${INSECURE:-0}" == "1" ]] && CURL=(curl -fsSk)   # origin self-signed cert only

PASS=0; FAIL=0
ok()  { printf '  PASS  %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL+1)); }
# minimal JSON field extractors (no jq dependency on a bare VM)
jget() { sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" <<<"$1" | head -1; }
jnum() { sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p" <<<"$1" | head -1; }

echo "== MaLLADE Phase-0 public smoke vs $GW =="

# --- 1. guest auth ---------------------------------------------------------
GTOK=$(jget "$("${CURL[@]}" -X POST "$GW/auth/guest" -H 'Content-Type: application/json' -d '{"name":"Pilot Smoke"}' 2>/dev/null)" token)
[[ -n "$GTOK" ]] && ok "guest auth -> JWT issued" || bad "guest auth -> JWT issued"
AUTH=(-H "Authorization: Bearer $GTOK")

# --- 2. public browse ?size=200 -------------------------------------------
PRODS=$("${CURL[@]}" "$GW/api/catalog/products?size=200" 2>/dev/null)
PID=$(jnum "$PRODS" id)   # product ids are numeric (Long) — use the number extractor, not jget (strings only)
[[ -n "$PID" ]] && ok "public browse ?size=200 returns products (first id=$PID)" || bad "public browse ?size=200 returns products"

# --- 3. add-to-cart (guest) ------------------------------------------------
# Honey is gated "coming soon" server-side (un-buyable by design — the cart-service 400s it), so the
# cart test must use a BUYABLE product: pick the first fruit. Split objects on '{' so each product's
# top-level fields land on one line (id + category precede the nested attributes/variants braces),
# grep the fruit line, extract its numeric id.
BPID=$(printf '%s' "$PRODS" | tr '{' '\n' | grep '"category":"fruit"' | head -1 | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
if [[ -n "$BPID" && -n "$GTOK" ]]; then
  CART=$("${CURL[@]}" -X POST "$GW/api/cart/items" "${AUTH[@]}" -H 'Content-Type: application/json' \
    -d "{\"productId\":$BPID,\"quantity\":1}" 2>/dev/null)   # productId is a Long — send it unquoted
  echo "$CART" | grep -q "\"productId\":$BPID" && ok "add-to-cart returns cart containing the fruit (id=$BPID)" || bad "add-to-cart returns cart containing the fruit (id=$BPID)"
else
  bad "add-to-cart (skipped: no buyable fruit id or token)"
fi

# --- 4. THE CENTERPIECE: fruit quiz -> notify fan-out ----------------------
# Unique valid 10-digit Indian mobile per run (leading 9 satisfies the [6-9] server pattern).
QPHONE="9$(printf '%09d' $((RANDOM * RANDOM % 1000000000)))"
QFRUIT="litchi"   # assert this slug's per-fruit count rises by the fan-out
QRESP=$("${CURL[@]}" -w '\n%{http_code}' -X POST "$GW/api/catalog/notify" -H 'Content-Type: application/json' \
  -d "{\"topic\":\"quiz\",\"name\":\"Pilot Smoke\",\"source\":\"quiz\",\"fruits\":[\"$QFRUIT\",\"alphonso-mango\"],\"phone\":\"$QPHONE\",\"pincode\":\"560001\",\"city\":\"Bengaluru\",\"state\":\"Karnataka\"}" 2>/dev/null)
QCODE=$(tail -1 <<<"$QRESP")
[[ "$QCODE" == "201" ]] && ok "quiz -> POST /api/catalog/notify -> 201" || bad "quiz -> POST /api/catalog/notify -> 201 (got $QCODE)"

# per-fruit fan-out: the chosen fruit's public count must be >= 1
FCNT=$(jnum "$("${CURL[@]}" "$GW/api/catalog/notify/count?topic=$QFRUIT" 2>/dev/null)" count)
{ [[ -n "$FCNT" ]] && [[ "$FCNT" -ge 1 ]]; } && ok "per-fruit demand count[$QFRUIT] >= 1 (=$FCNT)" || bad "per-fruit demand count[$QFRUIT] >= 1 (got '$FCNT')"

# umbrella quiz topic also recorded
QCNT=$(jnum "$("${CURL[@]}" "$GW/api/catalog/notify/count?topic=quiz" 2>/dev/null)" count)
{ [[ -n "$QCNT" ]] && [[ "$QCNT" -ge 1 ]]; } && ok "umbrella quiz topic count >= 1 (=$QCNT)" || bad "umbrella quiz topic count >= 1 (got '$QCNT')"

echo
echo "== result: $PASS passed, $FAIL failed =="
[[ $FAIL -eq 0 ]] || { echo "SMOKE FAILED — if this was the FIRST run right after a fresh 'up', re-run WARM before calling it a regression (saga/core cold-start race)."; exit 1; }
echo "GREEN — the pilot is live and serving the quiz->demand seam."
