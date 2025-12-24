# MARIAM - Production Deployment

Ce dossier contient tout le nécessaire pour déployer MARIAM en production.

## Structure

```
deploy/
├── docker-compose.yml    # Orchestration des services
├── .env.example          # Template des variables d'environnement
├── nginx/
│   └── nginx.conf        # Configuration du reverse proxy
├── scripts/
│   ├── install.sh        # Installation initiale
│   ├── run.sh            # Démarrage/arrêt de l'application
│   └── init.sh           # Initialisation (1er admin + restaurant)
└── docs/
    ├── INSTALL.md        # Guide d'installation
    ├── OPERATIONS.md     # Opérations et maintenance
    └── ARCHITECTURE.md   # Documentation technique
```

## Démarrage rapide

```bash
# 1. Installation
./scripts/install.sh

# 2. Configuration des secrets
vim .env

# 3. Démarrage
./scripts/run.sh

# 4. Initialisation (premier démarrage uniquement)
./scripts/init.sh
```

## Test en local (Mac)

Pour tester la version production sur votre Mac :

```bash
cd deploy

# Installation
./scripts/install.sh

# Éditer .env avec des valeurs de test
# (utiliser openssl rand -hex 32 pour les secrets)
vim .env

# Démarrer
./scripts/run.sh

# Attendre ~30s que tout soit prêt
./scripts/run.sh status

# Initialiser le premier admin
./scripts/init.sh
```

L'application sera sur http://localhost (port 80).

> **Note** : Si le port 80 est occupé, modifiez `PORT=8080` dans `.env`

## Documentation

- [INSTALL.md](docs/INSTALL.md) - Guide d'installation complet
- [OPERATIONS.md](docs/OPERATIONS.md) - Commandes de maintenance
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Documentation technique
