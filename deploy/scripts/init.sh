#!/bin/bash

# ========================================
# MARIAM - Script d'initialisation
# ========================================
# Ce script:
# 1. Crée le restaurant par défaut
# 2. Génère un lien d'activation pour le premier admin
#
# Exécuter APRÈS le premier démarrage de l'application.
# Usage: ./scripts/init.sh

set -e

cd "$(dirname "$0")/.."

echo "🍽️  MARIAM - Initialisation"
echo "================================"
echo ""

# Vérifier que les containers tournent
if ! docker compose ps | grep -q "mariam_backend_prod"; then
    echo "❌ Erreur: L'application ne semble pas démarrée."
    echo "👉 Lancez d'abord: ./scripts/run.sh"
    exit 1
fi

# 1. Créer le restaurant par défaut
echo "📍 Création du restaurant par défaut..."
docker compose exec -T backend flask init-restaurant || {
    echo "ℹ️  Le restaurant existe peut-être déjà (ignoré)"
}

echo ""

# 2. Générer le lien d'activation
echo "🔑 Génération du lien d'activation administrateur..."
echo ""
docker compose exec -T backend flask create-activation-link

echo ""
echo "================================"
echo "✅ Initialisation terminée !"
echo ""
echo "📋 Prochaines étapes :"
echo "   1. Copiez le lien d'activation ci-dessus"
echo "   2. Ouvrez-le dans votre navigateur"
echo "   3. Créez votre mot de passe (12+ caractères, majuscule, minuscule, chiffre, symbole)"
echo "   4. Scannez le QR code MFA avec Google/Microsoft Authenticator"
echo "   5. Entrez le code à 6 chiffres pour activer votre compte"
echo ""
