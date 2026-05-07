# Guide de contribution

## Prérequis

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 4.x
- [Bun](https://bun.sh/) ≥ 1.x
- Git ≥ 2.x

## Démarrage en développement

```bash
# Cloner le repo
git clone https://github.com/Tezay/mariam
cd mariam

# Démarrer tous les services
docker compose up -d --build

# Vérifier que tout tourne
curl http://localhost:5000/health
```

Services disponibles :
- Frontend : https://localhost:5173
- Backend API : http://localhost:5000 · docs : /api/v1/docs
- MinIO console : http://localhost:9001 (mariam_minio / mariam_minio_secret)
- PostgreSQL : localhost:5432 (mariam / mariam_secret / mariam_db)

## Structure du repo

```
server/   → Flask 3 backend (uv, pyproject.toml, Alembic)
client/   → React 18 + Vite + Tailwind + shadcn/ui (Bun)
deploy/   → Docker Compose prod + Nginx
docs/     → Documentation technique
```

## Convention de branches

```
feature/nom-court     # nouvelle fonctionnalité
fix/nom-court         # correction de bug
chore/nom-court       # tâche technique (deps, CI, config)
```

Ne jamais commit directement sur `main`.

## Commits : Conventional Commits

Format : `type(scope): description courte`

| Type | Usage |
|------|-------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `chore` | Maintenance, dépendances, CI |
| `docs` | Documentation uniquement |
| `refactor` | Refactoring sans changement de comportement |
| `test` | Ajout ou modification de tests |

Exemples :
```
feat(menu): ajouter l'export PDF du menu hebdomadaire
fix(auth): corriger le timeout du refresh token
chore(deps): mettre à jour Flask vers 3.1.0
```

## Lancer les tests

Voir [docs/TESTING.md](docs/TESTING.md) pour la documentation complète.

```bash
# Backend
docker compose exec backend uv run pytest

# Frontend
cd client && bun run test
```

## Lancer le lint

```bash
# Backend
docker compose exec backend uv run ruff check app/

# Frontend
cd client && bun run lint && bun run format:check
```

## Migrations Alembic

Tout changement de modèle SQLAlchemy nécessite une migration :

```bash
docker compose exec backend flask db migrate -m "description courte"
# Vérifier le fichier généré dans server/migrations/versions/
docker compose exec backend flask db upgrade
```

## Processus de Pull Request

1. Créer une branche depuis `main` (`feature/…` ou `fix/…`)
2. Implémenter les changements
3. S'assurer que les tests et le lint passent
4. Mettre à jour `CHANGELOG.md` (format Keep a Changelog)
5. Ouvrir une PR vers `main`
6. Résoudre les commentaires de review avant de merger

Le template de PR (`.github/pull_request_template.md`) liste les points à vérifier avant merge.