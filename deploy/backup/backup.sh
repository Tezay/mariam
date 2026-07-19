#!/bin/sh
# Periodic Postgres backup to an S3 bucket (Scaleway).
#
# Runs pg_dump in custom format, uploads the dump to the backup bucket, prunes
# dumps older than the retention window, then sleeps until the next run. A failed
# cycle is logged but does not stop the loop.
#
# Required env: PGHOST PGUSER PGPASSWORD PGDATABASE
#               BACKUP_S3_ENDPOINT BACKUP_S3_ACCESS_KEY BACKUP_S3_SECRET_KEY BACKUP_S3_BUCKET
# Optional env: BACKUP_INTERVAL_SECONDS (default 86400) BACKUP_RETENTION_DAYS (default 30)
set -u

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
DEST="backup/${BACKUP_S3_BUCKET}/daily"

log() { echo "[backup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }

if ! mc alias set backup "$BACKUP_S3_ENDPOINT" "$BACKUP_S3_ACCESS_KEY" "$BACKUP_S3_SECRET_KEY" >/dev/null 2>&1; then
    log "ERROR: could not configure S3 alias — check BACKUP_S3_* variables"
fi

run_backup() {
    ts=$(date -u '+%Y%m%d-%H%M%S')
    file="/tmp/mariam-${ts}.dump"
    log "starting pg_dump of ${PGDATABASE}"
    if ! pg_dump -Fc -h "$PGHOST" -U "$PGUSER" "$PGDATABASE" >"$file"; then
        log "ERROR: pg_dump failed"
        rm -f "$file"
        return 1
    fi
    if ! mc cp "$file" "${DEST}/mariam-${ts}.dump" >/dev/null; then
        log "ERROR: upload failed for mariam-${ts}.dump"
        rm -f "$file"
        return 1
    fi
    rm -f "$file"
    log "uploaded mariam-${ts}.dump"
    # Retention: drop dumps older than the window.
    mc rm --recursive --force --older-than "${RETENTION}d" "${DEST}/" >/dev/null 2>&1 || true
    log "pruned dumps older than ${RETENTION}d"
}

log "backup service started (interval=${INTERVAL}s, retention=${RETENTION}d)"
while true; do
    run_backup || log "backup cycle failed — will retry next interval"
    sleep "$INTERVAL"
done
