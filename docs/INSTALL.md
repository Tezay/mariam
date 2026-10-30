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
- `WEBAUTHN_RP_ID` is the **apex domain**, not a tenant host. A passkey is sealed to the value used
  when it was registered: scoped to a tenant subdomain, every passkey dies the day that tenant is
  renamed. Another installation under the same domain (demo, staging) takes its own host, so a
  device never mixes the passkeys of two databases.
- `MFA_ENCRYPTION_KEY` encrypts the stored TOTP secrets; see [OPERATIONS.md](OPERATIONS.md) to
  generate it, and keep a copy offline.
- `S3_PUBLIC_URL` is the public address of the media bucket: images are served from it directly.
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` come from `npx web-push generate-vapid-keys`. Changing
  the pair later forces every user to subscribe again.
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

At its first start, the backend applies the migrations and creates the default site.

### 5. Create the first administrator

```bash
docker compose exec backend flask create-activation-link
```

It prints a single-use activation link.

## Access

| Path | Serves |
|---|---|
| `/` | The application |
| `/v1/docs` | API reference |
| `/health` | API liveness |
