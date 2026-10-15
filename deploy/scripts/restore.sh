#!/bin/bash
# Replaces the database with an encrypted backup. The server's own key can only
# write: bring the restore key and the age identity, which never stay on the server.
#
#   RESTORE_S3_ACCESS_KEY=... RESTORE_S3_SECRET_KEY=... ./scripts/restore.sh IDENTITY_FILE [NAME|latest]
set -euo pipefail

: "${1:?Usage: restore.sh IDENTITY_FILE [NAME|latest]}"
backup=${2:-latest}
: "${RESTORE_S3_ACCESS_KEY:?Set RESTORE_S3_ACCESS_KEY to a key that can read the backup bucket}"
: "${RESTORE_S3_SECRET_KEY:?Set RESTORE_S3_SECRET_KEY to a key that can read the backup bucket}"
[ -r "$1" ] || { echo "Cannot read $1" >&2; exit 1; }
identity="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"

cd "$(dirname "$0")/.."

echo "This replaces the database with the backup '$backup'."
read -r -p "Type RESTORE to continue: " answer
[ "$answer" = RESTORE ] || { echo "Aborted."; exit 1; }

# A failed restore leaves the database unchanged, so the services restart either way.
docker compose stop backend scheduler
trap 'docker compose start backend scheduler' EXIT

docker compose run --rm --no-deps -T \
    -e BACKUP_S3_ACCESS_KEY="$RESTORE_S3_ACCESS_KEY" \
    -e BACKUP_S3_SECRET_KEY="$RESTORE_S3_SECRET_KEY" \
    backup restore "$backup" <"$identity"
