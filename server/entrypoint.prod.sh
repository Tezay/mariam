#!/bin/sh

set -e

echo "Starting MARIAM Backend (Production)..."

echo "Waiting for database connection..."
MAX_RETRIES=30
RETRY_COUNT=0

# Without the app, so that a configuration error shows at the migrations, not here.
until python -c 'import os, psycopg2; psycopg2.connect(os.environ["DATABASE_URL"]).close()' 2>/tmp/db-wait.err; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    cat /tmp/db-wait.err
    echo "Database connection failed after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "   Database not ready, retrying in 2 seconds... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "Database connection established"

echo "Applying database migrations..."
python -m app.scripts.run_migrations

echo "Initializing default data..."

flask init-restaurant

flask create-activation-link || echo "Admin already exists, skipping activation link"

if [ -n "$RESET_PASSWORD_EMAIL" ]; then
    echo "Password reset requested for: $RESET_PASSWORD_EMAIL"
    # Non-fatal under `set -e`: a typo in the variable must not stop the boot.
    flask user reset-password "$RESET_PASSWORD_EMAIL" \
        || echo "No reset link issued, see the error above"
fi

echo "Starting Gunicorn server..."
exec gunicorn \
  --worker-class gthread \
  --workers "${GUNICORN_WORKERS:-3}" \
  --threads "${GUNICORN_THREADS:-4}" \
  --timeout "${GUNICORN_TIMEOUT:-60}" \
  --graceful-timeout 30 \
  --max-requests 1000 \
  --max-requests-jitter 100 \
  --access-logfile - \
  -b 0.0.0.0:5000 \
  run:app
