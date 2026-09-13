# Contributing

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 4.x or later
- [Bun](https://bun.sh/) 1.x or later
- Git 2.x or later

## Development setup

```bash
git clone https://github.com/Tezay/mariam
cd mariam
docker compose up -d --build
curl http://localhost:5000/health
```

| Service | Address | Credentials |
|---|---|---|
| Frontend | https://localhost:5173 | |
| Backend API | http://localhost:5000 · docs at `/api/v1/docs` | |
| MinIO console | http://localhost:9001 | `mariam_minio` / `mariam_minio_secret` |
| PostgreSQL | localhost:5432 | `mariam` / `mariam_secret` / `mariam_db` |

## Repository layout

```
server/   Flask 3 backend (uv, pyproject.toml, Alembic)
client/   React 18 + Vite + Tailwind + shadcn/ui (Bun)
deploy/   Production Docker Compose and Nginx
docs/     Technical documentation
```

## Branches

```
feature/short-name     new functionality
fix/short-name         bug fix
chore/short-name       maintenance (dependencies, CI, configuration)
```

Never commit to `main` directly.

## Commits

Conventional Commits, `type(scope): short description`.

| Type | Use |
|---|---|
| `feat` | New functionality |
| `fix` | Bug fix |
| `chore` | Maintenance, dependencies, CI |
| `docs` | Documentation only |
| `refactor` | Behaviour-preserving restructuring |
| `test` | Tests added or changed |

```
feat(menu): add weekly menu PDF export
fix(auth): correct refresh token timeout
chore(deps): update Flask to 3.1.3
```

## Tests

```bash
docker compose exec backend uv run pytest
cd client && bun run test
```

See [docs/TESTING.md](docs/TESTING.md) for the full picture.

## Lint

```bash
docker compose exec backend uv run ruff check app/
cd client && bun run lint && bun run format:check
```

## Migrations

Any SQLAlchemy model change requires an Alembic migration. Review the generated file before
applying it, and make sure `downgrade()` is the exact inverse of `upgrade()`.

```bash
docker compose exec backend flask db migrate -m "short description"
docker compose exec backend flask db upgrade
```

## Pull requests

1. Branch from `main`
2. Implement the change
3. Make sure tests and lint pass
4. Update `CHANGELOG.md` under `[Unreleased]` (Keep a Changelog format)
5. Open a pull request against `main`
6. Address review comments before merging

`.github/pull_request_template.md` lists what is checked before merge.
