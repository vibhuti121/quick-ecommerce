#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 05-install-cron.sh — install the nightly catalogdb backup as a cron job.
# Runs the backup at 02:30 server time daily. Idempotent (replaces its own line).
#
#   BACKUP_REMOTE=gdrive:mallade-backups bash deploy/05-install-cron.sh
#
# BACKUP_REMOTE is baked into the cron line so the nightly run pushes off-box.
# Configure the rclone remote ONCE first:  rclone config
# ---------------------------------------------------------------------------
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
LOG="$HOME/mallade-backups/backup.log"

MARK="# mallade-catalogdb-backup"
LINE="30 2 * * * cd $REPO && BACKUP_REMOTE='$BACKUP_REMOTE' bash deploy/04-backup-catalogdb.sh >> $LOG 2>&1 $MARK"

mkdir -p "$HOME/mallade-backups"
# strip any prior line we own, then append the fresh one
( crontab -l 2>/dev/null | grep -v "$MARK" || true; echo "$LINE" ) | crontab -

echo "Installed nightly backup cron (02:30 daily):"
crontab -l | grep "$MARK"
[[ -n "$BACKUP_REMOTE" ]] || echo "WARNING: BACKUP_REMOTE empty — backups will be LOCAL ONLY. Re-run with it set."
echo "Logs -> $LOG"
