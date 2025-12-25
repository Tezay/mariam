#!/bin/sh

# ========================================
# MARIAM - Production Entrypoint
# ========================================

# Arrêter le script en cas d'erreur
set -e

echo "🚀 Starting MARIAM Backend (Production)..."

# 1. Appliquer les migrations de base de données
echo "🔄 Applying database migrations..."
flask db upgrade

# 2. Démarrer Gunicorn
echo "✅ Starting Gunicorn server..."
exec gunicorn -w 4 -b 0.0.0.0:5000 --access-logfile - run:app
