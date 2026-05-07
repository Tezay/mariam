.PHONY: dev test lint format db-migrate db-upgrade db-downgrade db-seed db-demo logs

dev:
	docker compose up -d --build

test:
	docker compose exec backend uv run pytest
	cd client && bun run test

lint:
	docker compose exec backend uv run ruff check app/
	cd client && bun run lint && bun run format:check

format:
	cd client && bun run format

db-migrate:
	docker compose exec backend flask db migrate -m "$(MSG)"

db-upgrade:
	docker compose exec backend flask db upgrade

db-downgrade:
	docker compose exec backend flask db downgrade -1

db-seed:
	docker compose exec backend flask seed

db-demo:
	docker compose exec backend flask seed-demo

logs:
	docker compose logs -f backend
