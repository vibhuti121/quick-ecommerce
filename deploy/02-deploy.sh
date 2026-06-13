#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 02-deploy.sh — bring up (or update) the MaLLADE Phase-0 core stack.
# Run from the repo root ON THE VM. Idempotent.
#
#   bash deploy/02-deploy.sh            # build + up the core 8
#   FORCE_SECRETS=1 bash deploy/02-deploy.sh   # rotate secrets (needs down -v, see note)
#
# Pilot = 8 core services only (gateway, frontend, auth, catalog, cart, postgres,
# redis, minio). Non-core stay OFF via docker-compose.prod.yml profiles.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

DOMAIN="${MALLADE_DOMAIN:?set MALLADE_DOMAIN, e.g. MALLADE_DOMAIN=mallde.in bash deploy/02-deploy.sh}"

# ---- 1. Secrets ------------------------------------------------------------
# gen-secrets.sh creates .env with fresh random values if absent (no-op if present).
# NEVER commit .env. The dev .env from your laptop must NOT be reused in prod —
# generate fresh on the box.
if [[ ! -f .env ]]; then
  echo "== no .env on this box — generating fresh prod secrets =="
  ./scripts/gen-secrets.sh
fi

# ---- 2. Prod env knobs -----------------------------------------------------
# The browser loads the SPA same-origin through the gateway at https://<domain>,
# so the gateway's ALLOWED_ORIGIN (CORS) must be the real https origin, not the
# dev :5173. (CORS only engages if anything ever calls cross-origin; align it
# anyway so it's correct.) GATEWAY_PORT stays 8443 (CF connects there).
upsert_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" .env && rm -f .env.bak
  else
    printf '%s=%s\n' "$key" "$val" >> .env
  fi
}
upsert_env ALLOWED_ORIGIN "https://${DOMAIN}"
upsert_env GATEWAY_PORT 8443
# Cloudflare is a trusted proxy in front of the gateway. CF sets CF-Connecting-IP /
# X-Forwarded-For; trusting it lets per-IP rate-limiting see the real client, not
# the CF edge IP (otherwise all traffic shares one bucket and gets 429'd together).
upsert_env RATE_LIMIT_TRUST_FORWARDED_FOR true
chmod 600 .env

# ---- 3. Build + up the core 8 ---------------------------------------------
echo "== building + starting the core 8 (profiles gate the other 17 OFF) =="
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo
echo "== waiting for the gateway edge to be healthy (cold start ~30-60s) =="
for i in $(seq 1 60); do
  if curl -ks https://localhost:8443/actuator/health 2>/dev/null | grep -q '"status":"UP"'; then
    echo "gateway UP after ~$((i*3))s"; break
  fi
  sleep 3
done

echo
echo "== running services =="
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
echo
echo "== deploy complete =="
echo "Local edge health: $(curl -ks https://localhost:8443/actuator/health || echo UNREACHABLE)"
echo "Next: point Cloudflare DNS at this box (see deploy/CLOUDFLARE.md), then:"
echo "  GW=https://${DOMAIN} bash deploy/03-public-smoke.sh"
