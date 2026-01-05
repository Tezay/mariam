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

# 2. Configuration des variables d'environnement : .env

# 3. Démarrage
./scripts/run.sh

# 4. Initialisation (premier démarrage uniquement)
./scripts/init.sh
```

L'application sera sur http://localhost (port 80).

> **Note** : Si le port 80 est occupé, modifiez `PORT=8080` dans `.env`

## Documentation

- [INSTALL.md](docs/INSTALL.md) - Guide d'installation complet
- [OPERATIONS.md](docs/OPERATIONS.md) - Commandes de maintenance
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Documentation technique
