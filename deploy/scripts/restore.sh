#!/bin/bash
# ========================================
# MARIAM - Database restore from S3 backup
# ========================================
# Restores the Postgres database from a dump stored in the backup bucket.
# Runs inside a one-off `backup` container so it reuses its tools (pg_restore,
# mc) and environment (PG*, BACKUP_S3_*).
#
# Usage:
#   ./scripts/restore.sh              # restore the latest dump
#   ./scripts/restore.sh mariam-YYYYMMDD-HHMMSS.dump   # restore a specific dump
#
# ⚠️  DESTRUCTIVE: overwrites the current database.
set -euo pipefail

cd "$(dirname "$0")/.."
DUMP="${1:-latest}"

echo "⚠️  This will OVERWRITE the current database with backup: ${DUMP}"
read -r -p "Type 'RESTORE' to continue: " confirm
[ "$confirm" = "RESTORE" ] || { echo "Aborted."; exit 1; }

docker compose run --rm --no-deps -e RESTORE_DUMP="$DUMP" --entrypoint sh backup -c '
  set -eu
  mc alias set backup "$BACKUP_S3_ENDPOINT" "$BACKUP_S3_ACCESS_KEY" "$BACKUP_S3_SECRET_KEY" >/dev/null
  DEST="backup/${BACKUP_S3_BUCKET}/daily"
  if [ "$RESTORE_DUMP" = "latest" ]; then
    NAME=$(mc ls "$DEST/" | awk "{print \$NF}" | sort | tail -n1)
  else
    NAME="$RESTORE_DUMP"
  fi
  [ -n "$NAME" ] || { echo "No dump found in $DEST"; exit 1; }
  echo "Downloading $NAME ..."
  mc cp "$DEST/$NAME" /tmp/restore.dump
  echo "Restoring into $PGDATABASE ..."
  pg_restore --clean --if-exists --no-owner -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" /tmp/restore.dump
  echo "✅ Restore complete."
'
