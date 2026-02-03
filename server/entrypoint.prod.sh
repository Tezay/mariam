#!/bin/sh

# ========================================
# MARIAM - Production Entrypoint
# ========================================

# Arrêter le script en cas d'erreur
set -e

echo "🚀 Starting MARIAM Backend (Production)..."

# ========================================
# 1. Attendre que la base de données soit accessible
# ========================================
echo "⏳ Waiting for database connection..."
MAX_RETRIES=30
RETRY_COUNT=0

until flask db current 2>/dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "❌ Database connection failed after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "   Database not ready, retrying in 2 seconds... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "✅ Database connection established"

# ========================================
# 2. Appliquer les migrations de base de données
# ========================================
echo "🔄 Applying database migrations..."
python /app/scripts/run_migrations.py

# ========================================
# 3. Initialisation des données (idempotent)
# ========================================
echo "📦 Initializing default data..."

# Créer le restaurant par défaut (vérifie s'il existe déjà)
flask init-restaurant

# Créer le lien d'activation admin (vérifie si un admin existe déjà)
flask create-activation-link || echo "ℹ️  Admin already exists, skipping activation link"

# ========================================
# 4. Démarrer Gunicorn
# ========================================
echo "✅ Starting Gunicorn server..."
exec gunicorn -w 2 -b 0.0.0.0:5000 --access-logfile - run:app
