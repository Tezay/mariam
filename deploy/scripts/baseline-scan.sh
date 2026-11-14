#!/bin/sh
# Passive scan of a deployed instance: baseline-scan.sh BASE_URL
#
# SMOKE_HEADERS_FILE names request headers, one per line, sent to BASE_URL and to no other host.
# CI logs are public, so the output names rules, never URLs: set REPORT_DIR for the full report.
# ZAP_NETWORK names the Docker network ZAP joins (bridge).
set -eu

base=${1:?usage: baseline-scan.sh BASE_URL}
base=${base%/}
zap=$(cd "$(dirname "$0")/../zap" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
chmod 755 "$work"
cp "$zap/baseline.conf" "$work/"

scope=$(printf '%s' "$base" | sed 's/[][\\.*^$?+(){}|]/\\&/g')
i=0
: > "$work/headers.prop"
if [ -n "${SMOKE_HEADERS_FILE:-}" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        [ -n "$line" ] || continue
        rule="replacer.full_list($i)"
        {
            echo "$rule.description=header $i"
            echo "$rule.enabled=true"
            echo "$rule.url=^$scope(/.*)?\$"
            echo "$rule.matchtype=REQ_HEADER"
            echo "$rule.matchstr=${line%%:*}"
            echo "$rule.regex=false"
            value=${line#*:}
            echo "$rule.replacement=${value# }"
        } >> "$work/headers.prop"
        i=$((i + 1))
    done < "$SMOKE_HEADERS_FILE"
fi
chmod 644 "$work"/*

# Pages that differ by a parameter value alone (?date=) are visited once: each one costs the API
# several calls, and the scan would otherwise spend its rate limit.
set -- -t "$base" -c baseline.conf -m 1 -I -s \
    -z "-silent -configfile /zap/wrk/headers.prop -config spider.handleParameters=IGNORE_VALUE"
mounts="-v $work:/zap/wrk:ro"
if [ -n "${REPORT_DIR:-}" ]; then
    mkdir -p "$REPORT_DIR" "$work/report"
    mounts="$mounts -v $(cd "$REPORT_DIR" && pwd):/zap/wrk/report"
    set -- "$@" -r report/baseline.html
fi

image=$(docker build -q "$zap")
status=0
# shellcheck disable=SC2086 # one mount option per word
docker run --rm --network "${ZAP_NETWORK:-bridge}" $mounts "$image" zap-baseline.py "$@" \
    > "$work/output" 2>&1 || status=$?
grep -E '^(FAIL|WARN)-NEW: ' "$work/output" || cat "$work/output"
exit "$status"
