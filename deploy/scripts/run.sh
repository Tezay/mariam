#!/bin/bash

# ========================================
# MARIAM - Script de déploiement
# ========================================
# Gère le cycle de vie de l'application en production.
#
# Usage:
#   ./scripts/run.sh          # Démarre l'application
#   ./scripts/run.sh up       # (alias)
#   ./scripts/run.sh down     # Arrête l'application
#   ./scripts/run.sh logs     # Affiche les logs en temps réel
#   ./scripts/run.sh restart  # Redémarre l'application
#   ./scripts/run.sh status   # Affiche l'état des containers

set -e

cd "$(dirname "$0")/.."

# Vérification du fichier .env
if [ ! -f .env ]; then
    echo "❌ Erreur: Fichier .env manquant."
    echo "👉 Exécutez d'abord : ./scripts/install.sh"
    exit 1
fi

COMMAND=${1:-up}

case "$COMMAND" in
    up|start|deploy)
        # Pull the tagged images from GHCR, build the local backup image, then
        # recreate changed containers in place (no full down = near-zero downtime).
        # Pin/rollback a release by setting MARIAM_TAG in .env (e.g. MARIAM_TAG=0.15.0).
        echo "🚀 Déploiement de MARIAM (production, tag=${MARIAM_TAG:-latest})..."
        docker compose pull db backend frontend
        docker compose build backup
        docker compose up -d
        echo ""
        echo "✅ Application déployée !"
        echo ""
        echo "📍 Accès :"
        echo "   - Application : http://localhost (ou IP de votre serveur)"
        echo "   - Santé API   : http://localhost/health"
        echo ""
        echo "💡 Si c'est le premier démarrage, exécutez :"
        echo "   ./scripts/init.sh"
        ;;

    down|stop)
        echo "🛑 Arrêt de MARIAM..."
        docker compose down
        echo "✅ Application arrêtée"
        ;;

    restart)
        echo "🔄 Redéploiement de MARIAM (sans coupure complète)..."
        docker compose pull db backend frontend
        docker compose build backup
        docker compose up -d
        echo "✅ Redéployé"
        ;;
        
    logs)
        docker compose logs -f --tail=100
        ;;
        
    status)
        echo "📊 État des services MARIAM :"
        echo ""
        docker compose ps
        ;;
        
    *)
        echo "MARIAM - Script de déploiement"
        echo ""
        echo "Usage: ./scripts/run.sh [COMMANDE]"
        echo ""
        echo "Commandes disponibles :"
        echo "  up, start   Démarre l'application (défaut)"
        echo "  down, stop  Arrête l'application"
        echo "  restart     Redémarre l'application"
        echo "  logs        Affiche les logs en temps réel"
        echo "  status      Affiche l'état des containers"
        ;;
esac
