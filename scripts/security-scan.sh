#!/usr/bin/env bash
# Pillar 3 — supply-chain security scan (Trivy, fully dockerized; NO host install needed).
#
# Covers BOTH halves of "dependency + image" scanning:
#   1. filesystem  -> Maven dependency CVEs (every pom.xml), Dockerfile/compose misconfig,
#                     and leaked secrets — the fast, pre-build, source-level check.
#   2. images      -> our 7 built service images + the 5 backing images: OS packages PLUS the
#                     bundled Spring Boot fat-jar libraries (Trivy reads BOOT-INF/lib).
# The image scan is the AUTHORITATIVE view of application dependencies (it sees the exact jars
# that ship), so it overlaps the fs dep scan by design; fs is the cheap shift-left pass.
#
# Usage:
#   bash scripts/security-scan.sh                 # scan, print HIGH+CRITICAL, exit 1 on any CRITICAL
#   SEVERITY=CRITICAL bash scripts/security-scan.sh   # narrow what's printed
#   FAIL_ON=HIGH,CRITICAL bash scripts/security-scan.sh   # stricter gate
#   FAIL_ON= bash scripts/security-scan.sh        # report-only, never fail (triage mode)
#
# Why Trivy: one tool for deps + images + IaC + secrets, single binary, local-first — matches
# this repo's dockerized ethos. OWASP Dependency-Check is the heavier CI-grade alternative for the
# dependency half (full NVD mirror, slow, needs an NVD API key); Trivy's DB covers the same CVEs.
set -uo pipefail
cd "$(dirname "$0")/.."

TRIVY_IMAGE="aquasec/trivy:${TRIVY_VERSION:-latest}"  # override TRIVY_VERSION to pin for reproducibility
SEVERITY="${SEVERITY:-HIGH,CRITICAL}"   # what gets PRINTED
FAIL_ON="${FAIL_ON-CRITICAL}"           # what FAILS the gate (empty = never fail). Default: CRITICAL only,
                                        # so base-image HIGHs inform without making the gate perma-red.
CACHE_VOL="trivy-cache"                 # named volume so the vuln DB isn't re-downloaded each run
SKIP_DIRS="**/target,**/node_modules,**/dist,**/build"

# Our images (must be built locally: `docker compose build`). Backing images Trivy pulls if absent.
SERVICE_IMAGES=(
  quick-ecommerce-gateway:latest
  quick-ecommerce-auth-service:latest
  quick-ecommerce-catalog-service:latest
  quick-ecommerce-cart-service:latest
  quick-ecommerce-inventory-service:latest
  quick-ecommerce-payment-service:latest
  quick-ecommerce-order-service:latest
)
BACKING_IMAGES=(
  postgres:16-alpine
  redis:7-alpine
  minio/minio:latest
  prom/prometheus:latest
  grafana/grafana:latest
)

command -v docker >/dev/null || { echo "docker is required"; exit 2; }
docker volume create "$CACHE_VOL" >/dev/null

# Trivy runs containerised: docker.sock so `image` can read locally-built images; cache volume for
# the DB; repo mounted read-only at /repo for the fs scan.
trivy() {
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$CACHE_VOL:/root/.cache/trivy" \
    -v "$PWD:/repo:ro" -w /repo \
    "$TRIVY_IMAGE" "$@"
}

FAILURES=()   # labels that tripped the FAIL_ON gate

# gate(): cached re-scan at FAIL_ON severity; records a failure if anything is found.
# Trivy returns the same non-zero code for "found a finding" and "crashed", so we capture output
# and check for FATAL first — a scan that couldn't complete must NOT be silently read as a CRITICAL.
gate() {  # $1=mode $2=target $3=label  (remaining: extra trivy args)
  local mode="$1" target="$2" label="$3"; shift 3
  [ -z "$FAIL_ON" ] && return 0
  local out rc
  out=$(trivy "$mode" --severity "$FAIL_ON" --exit-code 1 -q --no-progress "$@" "$target" 2>&1); rc=$?
  if grep -q "FATAL" <<<"$out"; then
    echo "  ⚠ scan ERROR for $label (NOT a finding): $(grep FATAL <<<"$out" | head -1 | sed -E 's/.*FATAL[[:space:]]*//' | cut -c1-90)"
    FAILURES+=("$label(scan-error)")
  elif [ "$rc" -eq 0 ]; then
    return 0          # exit 0 = nothing at FAIL_ON severity
  else
    echo "  ⛔ $FAIL_ON-severity finding(s) in $label"
    FAILURES+=("$label")
  fi
}

hr() { printf '────────────────────────────────────────────────────────\n'; }

echo "Trivy security scan — print: $SEVERITY | gate: ${FAIL_ON:-<none>}"
echo "(first run downloads the vuln DB into the '$CACHE_VOL' volume; later runs are fast)"

# ── 1. filesystem: Maven deps + Dockerfile/compose misconfig + leaked secrets ────────────────
echo; hr; echo "▶ FILESYSTEM  deps (pom.xml) · misconfig (Dockerfile/compose) · secrets"; hr
# --offline-scan: don't let Trivy's Java analyzer reach out to resolve remote parent POMs. In a
# constrained/read-only container that network call's context gets canceled and crashes the whole
# walk ("semaphore acquire: context canceled"). Dep CVEs still resolve from the local DB; the IMAGE
# scan below is the authoritative dependency view anyway (it reads the actual shipped jars).
trivy fs --scanners vuln,misconfig,secret --severity "$SEVERITY" --no-progress --offline-scan \
  --skip-dirs "$SKIP_DIRS" --skip-files ".env" .
gate fs . "filesystem" --scanners vuln,misconfig,secret --offline-scan --skip-dirs "$SKIP_DIRS" --skip-files ".env"

# ── 2. images: our services (OS + fat-jar libs) ──────────────────────────────────────────────
for img in "${SERVICE_IMAGES[@]}"; do
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    echo; echo "  ⚠ image $img not built locally — run 'docker compose build'; skipping"
    continue
  fi
  echo; hr; echo "▶ IMAGE (service)  $img"; hr
  trivy image --scanners vuln --severity "$SEVERITY" --no-progress "$img"
  gate image "$img" "service:${img%%:*}" --scanners vuln
done

# ── 3. images: backing services (pulled if absent) ───────────────────────────────────────────
for img in "${BACKING_IMAGES[@]}"; do
  echo; hr; echo "▶ IMAGE (backing)  $img"; hr
  trivy image --scanners vuln --severity "$SEVERITY" --no-progress "$img"
  gate image "$img" "backing:$img" --scanners vuln
done

# ── summary / gate ───────────────────────────────────────────────────────────────────────────
echo; hr
if [ -z "$FAIL_ON" ]; then
  echo "RESULT: report-only mode (FAIL_ON empty) — not gating."
  exit 0
elif [ "${#FAILURES[@]}" -eq 0 ]; then
  echo "RESULT: PASS — no $FAIL_ON-severity findings across deps + images."
  exit 0
else
  echo "RESULT: FAIL — $FAIL_ON-severity findings in: ${FAILURES[*]}"
  echo "Triage: add justified, dated entries to .trivyignore, or upgrade the offending dependency/base image."
  exit 1
fi
