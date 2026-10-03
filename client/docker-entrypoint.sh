#!/bin/sh
# ========================================
# MARIAM Frontend - Docker Entrypoint
# ========================================
# Injects runtime environment variables into config.js before starting nginx.

set -e

CONFIG_FILE="/usr/share/nginx/html/config.js"

# Replace placeholders with environment variables
# Default to /api if API_URL is not set (for docker-compose with nginx proxy)
API_URL="${API_URL:-/v1}"
APP_VERSION="${APP_VERSION:-dev}"
CANONICAL_HOST="${CANONICAL_HOST:-}"
UMAMI_WEBSITE_ID="${UMAMI_WEBSITE_ID:-}"
SENTRY_DSN="${SENTRY_DSN:-}"
SENTRY_ENVIRONMENT="${SENTRY_ENVIRONMENT:-production}"

echo "🔧 Injecting runtime configuration..."
echo "   API_URL: $API_URL"
echo "   UMAMI_WEBSITE_ID: $UMAMI_WEBSITE_ID"

# Generate the config file
cat > "$CONFIG_FILE" << EOF
// Runtime configuration - generated at container startup
window.__RUNTIME_CONFIG__ = {
  API_URL: "$API_URL",
  APP_VERSION: "$APP_VERSION",
  CANONICAL_HOST: "$CANONICAL_HOST",
  UMAMI_WEBSITE_ID: "$UMAMI_WEBSITE_ID",
  SENTRY_DSN: "$SENTRY_DSN",
  SENTRY_ENVIRONMENT: "$SENTRY_ENVIRONMENT"
};
EOF

echo "✅ Configuration injected successfully"

# Report-only until the violations seen in the browser console are cleared.
# A relative API_URL is the same origin; an absolute one is a host the browser must reach.
API_ORIGIN=$(printf '%s' "$API_URL" | sed -n 's#^\(https\{0,1\}://[^/]*\).*#\1#p')
SENTRY_ORIGIN=$(printf '%s' "$SENTRY_DSN" | sed -n 's#^\(https\{0,1\}://\)[^@]*@\([^/]*\).*#\1\2#p')
# Umami's host is also hardcoded in src/main.tsx.
UMAMI_ORIGIN="https://analytics.mariam.app"
CONNECT_SRC=$(echo "'self' $API_ORIGIN $UMAMI_ORIGIN $SENTRY_ORIGIN" | tr -s ' ' | sed 's/ $//')

cat > /etc/nginx/snippets/csp.conf << EOF
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' $UMAMI_ORIGIN; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src $CONNECT_SRC; worker-src 'self'; manifest-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" always;
EOF

# Start nginx
exec nginx -g 'daemon off;'
