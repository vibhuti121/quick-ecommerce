#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 04-backup-catalogdb.sh — nightly pg_dump of catalogdb (the notify_signups are
# the ONLY precious data in the pilot — name/phone/email/pincode + chosen fruits).
# Dumps from INSIDE the postgres container (no host psql needed), gzips, keeps
# 14 local days, and (if rclone is configured) pushes off-box.
#
#   bash deploy/04-backup-catalogdb.sh            # run once now
#   # install the nightly cron with deploy/05-install-cron.sh
#
# Off-box target: set BACKUP_REMOTE to an rclone remote:path (e.g. gdrive:mallade-backups).
# Configure rclone once with `rclone config` (Google Drive / S3 / B2 all work, free tiers fine).
# If BACKUP_REMOTE is unset, the dump stays local-only (better than nothing, but
# a dead VM loses it — wire up rclone before launch).
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

BACKUP_DIR="${BACKUP_DIR:-$HOME/mallade-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
PG_SVC="postgres"
# catalog DB name + user come from docker-compose.yml (init-multiple-dbs seeds catalogdb).
DB_NAME="${CATALOG_DB:-catalogdb}"
DB_USER="${POSTGRES_USER:-postgres}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/catalogdb-$STAMP.sql.gz"

CID=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q "$PG_SVC")
[[ -n "$CID" ]] || { echo "postgres container not running — aborting backup"; exit 1; }

echo "== pg_dump $DB_NAME -> $OUT =="
docker exec "$CID" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges \
  | gzip > "$OUT"
SIZE=$(du -h "$OUT" | cut -f1)
echo "wrote $OUT ($SIZE)"

# sanity: a real dump of a seeded DB is never trivially tiny
MINBYTES=200
[[ "$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")" -gt "$MINBYTES" ]] || { echo "dump suspiciously small — check DB connectivity"; exit 1; }

# rotate local copies
find "$BACKUP_DIR" -name 'catalogdb-*.sql.gz' -type f -mtime +"$KEEP_DAYS" -delete
echo "rotated local backups older than $KEEP_DAYS days"

# off-box push
if [[ -n "$BACKUP_REMOTE" ]]; then
  if command -v rclone >/dev/null 2>&1; then
    echo "== pushing off-box: $BACKUP_REMOTE =="
    rclone copy "$OUT" "$BACKUP_REMOTE" --no-traverse
    echo "off-box copy done"
  else
    echo "WARNING: BACKUP_REMOTE set but rclone not installed — backup is LOCAL ONLY"
  fi
else
  echo "NOTE: BACKUP_REMOTE unset — backup is LOCAL ONLY. Set it before launch (rclone remote)."
fi
echo "== backup complete =="
