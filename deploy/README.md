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

## Mise à jour (déploiement d'une nouvelle version)

Les migrations Alembic s'exécutent **automatiquement** au démarrage du conteneur
backend (`entrypoint.prod.sh`). Certaines migrations sont destructives — **toujours
sauvegarder la base avant de déployer** :

```bash
# 1. Backup de la base (obligatoire avant tout déploiement)
docker compose exec db pg_dump -U mariam -Fc mariam_db > backup_$(date +%Y%m%d_%H%M%S).dump

# 2. Déploiement
git pull && ./scripts/run.sh

# 3. En cas de problème : restauration
# docker compose exec -T db pg_restore -U mariam -d mariam_db --clean < backup_XXXX.dump
```

> ⚠️ **v0.13** : la migration `bfb39474c140` supprime tous les items de menu
> existants (passage au catalogue de plats, sans conversion de données) et exige
> les nouvelles variables `.env` : `REDIS_URL`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`
> (voir `.env.example`). Le backend refuse désormais de démarrer sans elles.

## Documentation

- [INSTALL.md](docs/INSTALL.md) - Guide d'installation complet
- [OPERATIONS.md](docs/OPERATIONS.md) - Commandes de maintenance
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Documentation technique
