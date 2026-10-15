#!/bin/sh
# Routing and client address of this folder's image, against throwaway upstreams
# that answer their name and the X-Real-IP they received. Needs Docker.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
image=mariam-proxy:test
base=nginx:1.30-alpine
run_id=mariam-proxy-test-$$

cleanup() {
    docker rm -f "$run_id-backend" "$run_id-frontend" "$run_id-client" "$run_id-proxy" >/dev/null 2>&1 || true
    docker network rm "$run_id" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

upstream() {
    docker run -d --name "$run_id-$1" --network "$run_id" --network-alias "$1" "$base" \
        sh -c "printf 'server { listen $2; location / { return 200 \"$1 \$http_x_real_ip\"; } }' >/etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'" >/dev/null
}

proxy() {
    docker rm -f "$run_id-proxy" >/dev/null 2>&1 || true
    docker run -d --name "$run_id-proxy" --network "$run_id" --network-alias proxy "$@" "$image" >/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        ask /health >/dev/null 2>&1 && return
        sleep 1
    done
    fail "the proxy did not start"
}

ask() {
    path=$1
    shift
    docker exec "$run_id-client" curl -sf "$@" "http://proxy$path"
}

expect() {
    description=$1 expected=$2
    shift 2
    answer=$(ask "$@") || answer="(no answer)"
    [ "$answer" = "$expected" ] || fail "$description: expected '$expected', got '$answer'"
    echo "ok - $description"
}

docker build -q -t "$image" "$here" >/dev/null
docker network create "$run_id" >/dev/null
upstream backend 5000
upstream frontend 3000
docker run -d --name "$run_id-client" --network "$run_id" "$base" sleep 600 >/dev/null
# Docker networks sit in the private ranges the proxy trusts by default.
client_ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$run_id-client")

proxy
expect "/v1 reaches the API" "backend $client_ip" /v1/menus
expect "/health reaches the API" "backend $client_ip" /health
expect "/health/ready reaches the API" "backend $client_ip" /health/ready
expect "/healthz stays with the pages" "frontend $client_ip" /healthz
expect "pages reach the frontend" "frontend $client_ip" /
expect "a trusted peer passes the visitor on" "backend 203.0.113.7" /v1/menus \
    -H 'X-Forwarded-For: 203.0.113.7'
expect "entries a client adds to the chain are skipped" "backend 203.0.113.7" /v1/menus \
    -H 'X-Forwarded-For: 198.51.100.1, 203.0.113.7, 10.0.0.5'
expect "a forged X-Real-IP is replaced" "backend $client_ip" /v1/menus \
    -H 'X-Real-IP: 198.51.100.1'

proxy -e TRUSTED_PROXIES=192.0.2.0/24
expect "an untrusted peer cannot name the visitor" "backend $client_ip" /v1/menus \
    -H 'X-Forwarded-For: 203.0.113.7'

proxy -e REAL_IP_HEADER=X-Client-IP
expect "the configured header wins" "backend 203.0.113.9" /v1/menus \
    -H 'X-Client-IP: 203.0.113.9' -H 'X-Forwarded-For: 198.51.100.1'

if docker run --rm -e 'REAL_IP_HEADER=X-Real-IP; deny all' "$image" nginx -t >/dev/null 2>&1; then
    fail "an invalid header name was accepted"
fi
echo "ok - an invalid header name stops the proxy"

echo "Proxy checks passed."
