#!/bin/sh
# Nothing is ever deleted from the bucket: retention belongs to its lifecycle
# rules, so the key this service holds needs no right but writing.
set -eu

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

ROW_COUNTS="SELECT table_name, (xpath('/row/n/text()', query_to_xml(
  format('SELECT count(*) AS n FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"

log() { echo "[backup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }
fail() { log "ERROR: $*"; exit 1; }

usage() {
    cat <<'EOF'
Usage: mariam-backup [COMMAND]
  run                    back up every day at BACKUP_TIME (default)
  once                   back up now
  verify [NAME|latest]   restore a backup into a scratch database and count its rows
  restore [NAME|latest]  restore a backup into the database PG* point at
verify and restore read the age identity on standard input.
EOF
}

require() {
    for name in "$@"; do
        [ -n "$(printenv "$name")" ] || fail "$name is not set"
    done
}

use_storage() {
    require BACKUP_S3_ENDPOINT BACKUP_S3_ACCESS_KEY BACKUP_S3_SECRET_KEY BACKUP_S3_BUCKET
    # No config file: the remote is described by the variables below.
    export RCLONE_CONFIG=
    export RCLONE_CONFIG_STORE_TYPE=s3
    export RCLONE_CONFIG_STORE_PROVIDER=Other
    export RCLONE_CONFIG_STORE_ENDPOINT="$BACKUP_S3_ENDPOINT"
    export RCLONE_CONFIG_STORE_REGION="${BACKUP_S3_REGION:-}"
    export RCLONE_CONFIG_STORE_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY"
    export RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY"
    REMOTE="store:$BACKUP_S3_BUCKET/daily"
}

check_backup_settings() {
    require PGHOST PGUSER PGDATABASE BACKUP_AGE_RECIPIENT
    case $BACKUP_AGE_RECIPIENT in
        age1*) ;;
        *) fail "BACKUP_AGE_RECIPIENT is not an age public key" ;;
    esac
    BACKUP_TIME=${BACKUP_TIME:-03:00}
    case $BACKUP_TIME in
        [01][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9]) ;;
        *) fail "BACKUP_TIME must read HH:MM" ;;
    esac
}

# Restores $1 into a server that lives and dies in this container, then runs $2.
# Each step checks its own status: errexit does not reach a function called
# from a condition.
in_scratch_database() {
    rm -rf "$WORK/scratch"
    status=0
    (
        unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
        initdb -D "$WORK/scratch" -U postgres --auth=trust --no-locale -E UTF8 >"$WORK/scratch.log" 2>&1 \
            || { cat "$WORK/scratch.log" >&2; exit 1; }
        pg_ctl -D "$WORK/scratch" -l "$WORK/scratch.log" -w -s start -o \
            "-c listen_addresses='' -c unix_socket_directories=$WORK -c shared_buffers=16MB -c fsync=off" \
            || { cat "$WORK/scratch.log" >&2; exit 1; }
        trap 'pg_ctl -D "$WORK/scratch" -m immediate -w -s stop >/dev/null 2>&1' EXIT
        createdb -h "$WORK" -U postgres scratch || exit 1
        pg_restore -h "$WORK" -U postgres -d scratch --no-owner --exit-on-error "$1" || exit 1
        psql -h "$WORK" -U postgres -d scratch -AtX -v ON_ERROR_STOP=1 -c "$2"
    ) || status=$?
    rm -rf "$WORK/scratch"
    return "$status"
}

backup() {
    name="mariam-$(date -u '+%Y%m%dT%H%M%SZ').dump.age"
    log "dumping $PGDATABASE"
    pg_dump -Fc -f "$WORK/dump" || return 1
    versions=$(in_scratch_database "$WORK/dump" 'SELECT count(*) FROM alembic_version') || versions=
    [ "$versions" = 1 ] || { log "ERROR: the dump does not restore to a migrated schema"; return 1; }
    age -r "$BACKUP_AGE_RECIPIENT" -o "$WORK/dump.age" "$WORK/dump" || return 1
    # A bucket with a default retention requires Content-MD5, which rclone only
    # sends on multipart uploads.
    rclone copyto --no-check-dest --s3-no-check-bucket --s3-no-head --s3-upload-cutoff 0 \
        "$WORK/dump.age" "$REMOTE/$name" || return 1
    log "uploaded $name"
    if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
        wget -q -O /dev/null -T 10 "$BACKUP_HEARTBEAT_URL" || log "the heartbeat could not be sent"
    fi
}

# Leaves the decrypted backup at $WORK/dump. The identity comes on standard
# input, so it never sits in the environment or on a mount.
fetch() {
    [ ! -t 0 ] || fail "pass the age identity on standard input"
    (umask 077 && cat >"$WORK/identity")
    grep -q '^AGE-SECRET-KEY-' "$WORK/identity" || fail "standard input holds no age identity"
    name=$1
    if [ "$name" = latest ]; then
        name=$(rclone lsf --files-only --include '*.dump.age' "$REMOTE" | sort | tail -n 1)
        [ -n "$name" ] || fail "no backup in $REMOTE"
    fi
    log "downloading $name"
    rclone copyto "$REMOTE/$name" "$WORK/dump.age" || fail "the download failed"
    age -d -i "$WORK/identity" -o "$WORK/dump" "$WORK/dump.age" || fail "the decryption failed"
    rm -f "$WORK/identity"
}

run() {
    log "version ${APP_VERSION:-dev}, backing up every day at $BACKUP_TIME"
    last=
    while :; do
        if [ "$(date +%H:%M)" = "$BACKUP_TIME" ] && [ "$(date +%F)" != "$last" ]; then
            last=$(date +%F)
            backup || log "ERROR: backup failed, next attempt tomorrow at $BACKUP_TIME"
            rm -f "$WORK/dump" "$WORK/dump.age"
        fi
        sleep 30
    done
}

command=${1:-run}
[ $# -eq 0 ] || shift
case $command in
    run)
        use_storage
        check_backup_settings
        run
        ;;
    once)
        use_storage
        check_backup_settings
        backup || fail "backup failed"
        ;;
    verify)
        use_storage
        fetch "${1:-latest}"
        log "restoring into a scratch database"
        in_scratch_database "$WORK/dump" "$ROW_COUNTS" || fail "the backup does not restore"
        log "the backup restores"
        ;;
    restore)
        require PGHOST PGUSER PGDATABASE
        use_storage
        fetch "${1:-latest}"
        log "restoring into $PGDATABASE on $PGHOST"
        pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error \
            -d "$PGDATABASE" "$WORK/dump" || fail "the restore failed, the database is unchanged"
        log "restored"
        ;;
    *)
        usage >&2
        exit 2
        ;;
esac
