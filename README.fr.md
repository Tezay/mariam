# Mariam

Gestion des menus pour la restauration universitaire.

[![Quality Gates](https://img.shields.io/github/actions/workflow/status/Tezay/mariam/quality.yml?branch=main&label=quality%20gates)](https://github.com/Tezay/mariam/actions/workflows/quality.yml)
[![Release](https://img.shields.io/github/v/release/Tezay/mariam?include_prereleases)](https://github.com/Tezay/mariam/releases)
[![License](https://img.shields.io/badge/license-Source%20Available-blue)](LICENSE.md)
[![mariam.app](https://img.shields.io/badge/mariam.app-informational)](https://mariam.app)

[English](README.md) | **Français**

[![Tableau de bord Mariam](docs/assets/dashboard.webp)](https://mariam.app)

## Présentation

Mariam permet aux équipes de restauration de préparer et de publier les menus du jour, et aux
étudiants de les consulter sur leur téléphone ou sur les écrans du restaurant, sans compte.

L'application est multi-tenant : une organisation détient autant de sites qu'elle veut, chacun avec
son tableau de bord, sa page publique et ses données. Les superviseurs disposent d'un tableau de
bord distinct couvrant tous les sites dont ils ont la charge. Les mêmes vues d'analyse servent les
deux rôles, avec un périmètre résolu par le rôle.

## Fonctionnalités

**Pour les gestionnaires**

- Calendrier unifié, vues jour, semaine, mois et année
- Catalogue de plats avec images, labels alimentaires, certifications et statistiques d'usage
- Import et export CSV, aller-retour fidèle
- Publication en un clic, par jour ou par semaine
- Événements, fermetures exceptionnelles et mot du chef
- Alertes en temps réel, résumé hebdomadaire par e-mail, préférences par utilisateur

**Pour les étudiants**

- Menu pensé pour le mobile, sans compte
- Mode plein écran pour les écrans du restaurant
- Labels alimentaires et certifications officielles sur chaque plat
- Vote de satisfaction à trois niveaux, anonyme et résistant à la fraude

**Pour les superviseurs**

- Vue d'ensemble multi-sites : publication, fréquentation, satisfaction, classement des sites
- Détail par site sur les mêmes vues
- Catalogue de plats, comptes et journal d'audit à l'échelle de l'organisation

## Stack

| Couche | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind, shadcn/ui, Recharts, TanStack Query |
| Backend | Flask 3, flask-smorest, SQLAlchemy 2, Alembic, Gunicorn |
| Données | PostgreSQL 15, Redis 8, stockage objet compatible S3 |
| Infrastructure | Docker Compose, Nginx, GitHub Actions |

## Démarrage rapide

```bash
git clone https://github.com/Tezay/mariam
cd mariam
docker compose up -d --build
```

Frontend sur `https://localhost:5173`, API sur `http://localhost:5000`, OpenAPI sur `/api/v1/docs`.
Voir [docs/INSTALL.md](docs/INSTALL.md) pour la production.

## Documentation

| Document | Contenu |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Conception du système, multi-tenant, modèle de données |
| [docs/INSTALL.md](docs/INSTALL.md) | Installation et configuration en production |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Déploiement, sauvegardes, supervision, provisionnement |
| [docs/API.md](docs/API.md) | Référence REST |
| [docs/TESTING.md](docs/TESTING.md) | Suites de tests et exécution |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Environnement de développement et conventions |
| [SECURITY.md](SECURITY.md) | Signalement de vulnérabilité |
| [CHANGELOG.md](CHANGELOG.md) | Historique des versions |

## Organisation du dépôt

```
client/   Frontend React
server/   Backend Flask, migrations, tests
deploy/   Compose de production, Nginx, scripts
docs/     Documentation technique
```

## Licence

Code source consultable, mais pas open source : voir [LICENSE.md](LICENSE.md). L'usage non
commercial est accordé selon ces termes ; l'usage commercial fait l'objet d'un accord distinct,
voir [COMMERCIAL_LICENSE_TEMPLATE.md](COMMERCIAL_LICENSE_TEMPLATE.md).
