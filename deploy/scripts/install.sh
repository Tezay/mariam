#!/bin/bash

# ========================================
# MARIAM - Script d'installation
# ========================================
# Ce script prépare l'environnement de production :
# 1. Vérifie les prérequis
# 2. Crée le fichier .env depuis le template
# 3. Configure les permissions
#
# Usage: ./scripts/install.sh

set -e

cd "$(dirname "$0")/.."

echo "🍽️  MARIAM - Installation Production"
echo "======================================"
echo ""

# Vérification de Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé."
    echo "👉 Installez Docker : https://docs.docker.com/engine/install/"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose n'est pas disponible."
    echo "👉 Installez Docker Compose V2 : https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker et Docker Compose détectés"

# Création du fichier .env
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Fichier .env créé depuis .env.example"
    echo ""
    echo "⚠️  IMPORTANT : Éditez le fichier deploy/.env pour configurer vos secrets !"
    echo ""
    echo "   Générez des clés aléatoires avec :"
    echo "   openssl rand -hex 32"
    echo ""
else
    echo "ℹ️  Fichier .env existe déjà (non modifié)"
fi

# Permissions des scripts
chmod +x scripts/*.sh
echo "✅ Permissions des scripts mises à jour"

echo ""
echo "======================================"
echo "✅ Installation terminée !"
echo ""
echo "📋 Prochaines étapes :"
echo ""
echo "   1. Configurez vos secrets :"
echo "      vim deploy/.env"
echo ""
echo "   2. Démarrez l'application :"
echo "      ./deploy/scripts/run.sh"
echo ""
echo "   3. Initialisez le premier admin :"
echo "      ./deploy/scripts/init.sh"
echo ""
