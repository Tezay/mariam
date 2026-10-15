# Production deployment

## Structure

```
deploy/
├── compose.yaml          # The whole stack, from published images
├── .env.example          # Environment template
├── backup/               # Backup image: dump, check, encrypt, upload
├── nginx/                # Proxy image: /v1 to the API, the rest to the pages
└── scripts/
    └── restore.sh        # Replace the database with a backup
```

Documentation lives at the repository root, under `docs/`.

## Quick start

```bash
git checkout vX.Y.Z           # the release MARIAM_TAG names
cp .env.example .env          # then fill it in
docker compose pull
docker compose up -d
docker compose exec backend flask create-activation-link
```

No port is published. Behind a platform, route the hosts to the `proxy` service, port 80. On a
server of its own, publish it in `compose.override.yaml`, which compose reads next to
`compose.yaml`:

```yaml
services:
  proxy:
    ports:
      - "80:80"
```

TLS ends in front of the proxy: see "TLS" in [OPERATIONS.md](../docs/OPERATIONS.md).

## Updating

Alembic migrations run automatically when the backend container starts, and some are destructive.
**Always back up the database before deploying.**

```bash
# 1. Back up, every time
docker compose run --rm backup once

# 2. Deploy: check out the release, set MARIAM_TAG in .env to it
git fetch --tags && git checkout vX.Y.Z
docker compose pull && docker compose up -d

# 3. If it goes wrong
# RESTORE_S3_ACCESS_KEY=... RESTORE_S3_SECRET_KEY=... ./scripts/restore.sh ~/mariam-backup-identity.txt
```

Setting up the backups: see "Automated off-site backups" in [OPERATIONS.md](../docs/OPERATIONS.md).

**v0.13**: migration `bfb39474c140` deletes every existing menu item, moving to the dish catalogue
without converting data, and requires `REDIS_URL`, `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` in
`.env`. The backend refuses to start without them.

## Documentation

- [INSTALL.md](../docs/INSTALL.md), installation
- [OPERATIONS.md](../docs/OPERATIONS.md), maintenance commands
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md), technical reference
