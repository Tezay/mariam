#!/bin/sh
# Checks a deployed instance: smoke-test.sh BASE_URL [VERSION]
#
# Waits until /health reports VERSION (any version if omitted) and /health/ready
# answers ready, then checks that a page and the API answer for this host.
# SMOKE_HEADERS_FILE names a file of request headers, one per line, for an
# instance behind an access control. SMOKE_TIMEOUT is in seconds (600).
set -eu

base=${1:?usage: smoke-test.sh BASE_URL [VERSION]}
base=${base%/}
want=${2:-}
timeout=${SMOKE_TIMEOUT:-600}
host=$(echo "$base" | sed -E 's#^[a-z]+://##; s#[/:].*$##')

get() {
    if [ -n "${SMOKE_HEADERS_FILE:-}" ]; then
        curl -sS --max-time 10 -H "@$SMOKE_HEADERS_FILE" "$@"
    else
        curl -sS --max-time 10 "$@"
    fi
}

deadline=$(($(date +%s) + timeout))
while :; do
    running=$(get "$base/health" 2>/dev/null | jq -r '.version // empty' 2>/dev/null || true)
    ready=$(get "$base/health/ready" 2>/dev/null | jq -r '.status // empty' 2>/dev/null || true)
    if [ -n "$running" ] && { [ -z "$want" ] || [ "$running" = "$want" ]; } && [ "$ready" = ready ]; then
        break
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
        echo "Not ready after ${timeout}s: version '${running:-none}', expected '${want:-any}'; readiness '${ready:-none}'." >&2
        exit 1
    fi
    sleep 10
done
echo "ok - $base runs ${running} and is ready"

page=$(get -o /dev/null -w '%{http_code} %{content_type}' "$base/")
case $page in
    "200 text/html"*) echo "ok - the home page answers" ;;
    *) echo "The home page answered: $page" >&2; exit 1 ;;
esac

domain=$(get -o /dev/null -w '%{http_code}' "$base/v1/domains/$host")
if [ "$domain" != 200 ]; then
    echo "The API gave no organization for $host: $domain" >&2
    exit 1
fi
echo "ok - the API serves an organization for $host"
