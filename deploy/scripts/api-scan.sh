#!/bin/sh
# Active scan of the API from its OpenAPI description: api-scan.sh API_URL
#
# Only against a throwaway instance seeded with flask seed-demo: the scan writes through every
# route it can reach. CI logs are public, so the output names rules, never URLs: set REPORT_DIR
# for the full report. ZAP_NETWORK names the Docker network ZAP joins (host).
set -eu

api=${1:?usage: api-scan.sh API_URL}
api=${api%/}
zap=$(cd "$(dirname "$0")/../zap" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
chmod 755 "$work"
cp "$zap/api.conf" "$work/"
chmod 644 "$work"/*

options=-silent
i=0
for pair in org=demo site=demo "date=$(date +%F)" "year=$(date +%Y)"; do
    field="formhandler.fields.field($i)"
    options="$options -config $field.fieldId=${pair%%=*} -config $field.value=${pair#*=}"
    options="$options -config $field.enabled=true"
    i=$((i + 1))
done

set -- -t "$api/v1/openapi.json" -f openapi -c api.conf -I -s -z "$options"
mounts="-v $work:/zap/wrk:ro"
if [ -n "${REPORT_DIR:-}" ]; then
    mkdir -p "$REPORT_DIR" "$work/report"
    mounts="$mounts -v $(cd "$REPORT_DIR" && pwd):/zap/wrk/report"
    set -- "$@" -r report/api.html
fi

image=$(docker build -q "$zap")
status=0
# shellcheck disable=SC2086 # one mount option per word
docker run --rm --network "${ZAP_NETWORK:-host}" $mounts "$image" zap-api-scan.py "$@" \
    > "$work/output" 2>&1 || status=$?
grep -E '^(FAIL|WARN)-NEW: ' "$work/output" || cat "$work/output"
exit "$status"
