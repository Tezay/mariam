# Production deployment

Everything needed to run Mariam in production.

## Structure

```
deploy/
├── compose.yaml          # Service orchestration
├── .env.example          # Environment variable template
├── nginx/
│   └── nginx.conf        # Reverse proxy configuration
└── scripts/
    ├── install.sh        # Initial setup
    ├── run.sh            # Start and stop
    └── init.sh           # First admin and restaurant
```

Documentation lives at the repository root, under `docs/`.

## Quick start

```bash
./scripts/install.sh   # 1. setup
                       # 2. fill in .env
./scripts/run.sh       # 3. start
./scripts/init.sh      # 4. first start only
```

The application listens on `http://localhost`, port 80. Set `PORT=8080` in `.env` if it is taken.

## Updating

Alembic migrations run automatically when the backend container starts, and some are destructive.
**Always back up the database before deploying.**

```bash
# 1. Back up, every time
docker compose exec db pg_dump -U mariam -Fc mariam_db > backup_$(date +%Y%m%d_%H%M%S).dump

# 2. Deploy
git pull && ./scripts/run.sh

# 3. If it goes wrong
# docker compose exec -T db pg_restore -U mariam -d mariam_db --clean < backup_XXXX.dump
```

**v0.13**: migration `bfb39474c140` deletes every existing menu item, moving to the dish catalogue
without converting data, and requires `REDIS_URL`, `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` in
`.env`. The backend refuses to start without them.

## Documentation

- [INSTALL.md](../docs/INSTALL.md), installation
- [OPERATIONS.md](../docs/OPERATIONS.md), maintenance commands
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md), technical reference
