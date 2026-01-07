#!/bin/sh
# ========================================
# MARIAM Frontend - Docker Entrypoint
# ========================================
# Injects runtime environment variables into config.js before starting nginx.

set -e

CONFIG_FILE="/usr/share/nginx/html/config.js"

# Replace placeholders with environment variables
# Default to /api if API_URL is not set (for docker-compose with nginx proxy)
API_URL="${API_URL:-/api}"

echo "🔧 Injecting runtime configuration..."
echo "   API_URL: $API_URL"

# Generate the config file
cat > "$CONFIG_FILE" << EOF
// Runtime configuration - generated at container startup
window.__RUNTIME_CONFIG__ = {
  API_URL: "$API_URL"
};
EOF

echo "✅ Configuration injected successfully"

# Start nginx
exec nginx -g 'daemon off;'
