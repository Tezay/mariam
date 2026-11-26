# Installation

## Requirements

- Docker with Compose v2, and Git
- An S3-compatible bucket for media, whose objects are publicly readable, and another for backups
- TLS terminated in front of the server: a platform's proxy, a tunnel or a CDN

## Steps

### 1. Check out a release

```bash
git clone https://github.com/Tezay/mariam.git
cd mariam/deploy
git checkout vX.Y.Z
cp .env.example .env
```

### 2. Fill in `.env`

`.env.example` documents every variable. Compose refuses to start while a required one is empty, and
names it. Generate random values with `openssl rand -hex 32`.

- `MARIAM_TAG` is the release checked out above.
- `DASHBOARD_URL` and `PUBLIC_URL` stay empty for one host. To give the dashboard a host of its own, set
  both, route both hosts to the proxy, and list both in `FRONTEND_URL`, the dashboard first.
- `SIGNED_IN_HINT_DOMAIN`, a parent domain of the dashboard, lets a site of that domain see that a
  session is open, through a cookie that holds no data and proves nothing. Empty sets none.
- `WEBAUTHN_ORIGIN` is the dashboard's address. `WEBAUTHN_RP_ID` is its host or a parent domain: a
  passkey is sealed to the value used when it was registered. Another installation under the same
  domain (demo, staging) takes its own host, so a device never mixes the passkeys of two databases.
- `MFA_ENCRYPTION_KEY` encrypts the stored TOTP secrets; see [OPERATIONS.md](OPERATIONS.md) to
  generate it, and keep a copy offline.
- `S3_PUBLIC_URL` is the public address of the media bucket: images are served from it directly.
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` come from `npx web-push generate-vapid-keys`. Changing
  the pair later forces every user to subscribe again. `VAPID_CONTACT_EMAIL` goes with them.
- The `BACKUP_*` variables: see "Automated off-site backups" in [OPERATIONS.md](OPERATIONS.md).
- Email is optional: without `SMTP_HOST`, every send is a logged no-op.

### 3. Route traffic to the proxy

No port is published. Behind a platform, route the hosts to the `proxy` service, port 80. On a
server of its own, publish it in `compose.override.yaml`:

```yaml
services:
  proxy:
    ports:
      - "80:80"
```

### 4. Start

```bash
docker compose pull
docker compose up -d
```

At its first start, the backend applies the migrations; the instance is empty.

### 5. Create the organization, its first site and its first account

```bash
docker compose exec backend flask org create --name "Example" --slug example
docker compose exec backend flask site create --org example --name "Restaurant Nord" --slug nord
docker compose exec backend flask user invite admin@example.org --role admin --restaurant nord
```

`user invite` prints a single-use activation link. A supervisor of every site takes
`--role org_admin --org example` instead.

## Access

| Path | Serves |
|---|---|
| `/` | The application |
| `/v1/docs` | API reference |
| `/health` | API liveness |
