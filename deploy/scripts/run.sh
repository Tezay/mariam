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
    up|start)
        echo "🚀 Démarrage de MARIAM (production)..."
        docker compose up -d --build
        echo ""
        echo "✅ Application démarrée !"
        echo ""
        echo "📍 Accès :"
        echo "   - Application : http://localhost (ou IP de votre serveur)"
        echo "   - Santé API   : http://localhost/api/health"
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
        echo "🔄 Redémarrage de MARIAM..."
        docker compose down
        docker compose up -d --build
        echo "✅ Application redémarrée"
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
