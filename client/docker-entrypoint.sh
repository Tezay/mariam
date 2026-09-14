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
  CANONICAL_HOST: "$CANONICAL_HOST",
  UMAMI_WEBSITE_ID: "$UMAMI_WEBSITE_ID",
  SENTRY_DSN: "$SENTRY_DSN",
  SENTRY_ENVIRONMENT: "$SENTRY_ENVIRONMENT"
};
EOF

echo "✅ Configuration injected successfully"

# Start nginx
exec nginx -g 'daemon off;'
