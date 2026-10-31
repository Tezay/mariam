#!/bin/sh
# Backup, verify and restore with this folder's image, against throwaway
# services. Needs Docker.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
image=mariam-backup:round-trip
run_id=mariam-backup-test-$$
identity=$(mktemp)

cleanup() {
    docker rm -f "$run_id-db" "$run_id-s3" "$run_id-off" >/dev/null 2>&1 || true
    docker network rm "$run_id" >/dev/null 2>&1 || true
    rm -f "$identity"
}
trap cleanup EXIT

step() { echo "--- $*"; }

backup_image() {
    docker run --rm --network "$run_id" \
        -e PGHOST="$run_id-db" -e PGUSER=postgres -e PGPASSWORD=secret -e PGDATABASE=source \
        -e BACKUP_S3_ENDPOINT="http://$run_id-s3:9000" \
        -e BACKUP_S3_ACCESS_KEY=test -e BACKUP_S3_SECRET_KEY=test-secret -e BACKUP_S3_BUCKET=backups \
        "$@"
}

sql() { docker exec -i "$run_id-db" psql -U postgres -AtX -v ON_ERROR_STOP=1 "$@"; }

step "build"
docker build -q -t "$image" "$here" >/dev/null

step "without a bucket, the service stays up and backs nothing up"
docker run -d --name "$run_id-off" "$image" >/dev/null
sleep 3
if [ "$(docker inspect -f '{{.State.Running}}' "$run_id-off")" != true ] \
    || ! docker logs "$run_id-off" 2>&1 | grep -q 'backups are off'; then
    echo "Without a bucket, the service stopped or did not say backups are off"
    exit 1
fi

step "start a database and an S3 server"
docker network create "$run_id" >/dev/null
docker run -d --name "$run_id-db" --network "$run_id" -e POSTGRES_PASSWORD=secret postgres:17-alpine >/dev/null
docker run -d --name "$run_id-s3" --network "$run_id" --entrypoint sh "$image" \
    -c 'mkdir -p /tmp/s3/backups && exec rclone serve s3 --auth-key test,test-secret --addr :9000 /tmp/s3' >/dev/null
# The image answers pg_isready on a temporary server while it initialises.
until docker logs "$run_id-db" 2>&1 | grep -q 'init process complete'; do sleep 1; done
until docker exec "$run_id-db" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sql -c 'CREATE DATABASE source' -c 'CREATE DATABASE restored' >/dev/null
sql -d source >/dev/null <<'SQL'
CREATE TABLE alembic_version (version_num varchar(32) PRIMARY KEY);
INSERT INTO alembic_version VALUES ('round-trip');
CREATE TABLE marker (note text);
INSERT INTO marker VALUES ('survived the round trip');
SQL

step "back up"
docker run --rm --entrypoint age-keygen "$image" >"$identity" 2>/dev/null
recipient=$(sed -n 's/^# public key: //p' "$identity")
backup_image -e BACKUP_AGE_RECIPIENT="$recipient" "$image" once

step "the upload is encrypted"
header=$(docker exec "$run_id-s3" sh -c 'head -c 21 /tmp/s3/backups/daily/*.dump.age')
[ "$header" = age-encryption.org/v1 ] || { echo "The upload is not an age file: $header"; exit 1; }

step "verify"
backup_image -i "$image" verify latest <"$identity"

step "restore into another database"
backup_image -i -e PGDATABASE=restored "$image" restore latest <"$identity"
[ "$(sql -d restored -c 'SELECT note FROM marker')" = 'survived the round trip' ] \
    || { echo "The restored database lacks the marker row"; exit 1; }

echo "Round trip passed."
