# Installation

Installing Mariam on a server or locally.

## Requirements

- Docker and Docker Compose V2
- Git

## Steps

### 1. Clone

```bash
git clone https://github.com/Tezay/mariam.git
cd mariam
```

### 2. Run the installer

```bash
./deploy/scripts/install.sh
```

It checks Docker and Docker Compose, creates `.env` from the template, and sets script permissions.

### 3. Configure secrets

Edit `.env`. `deploy/.env.example` is the authoritative list, commented variable by variable.

Generate random values with `openssl rand -hex 32`.

The backend refuses to start in production until these are set to real values:

| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | Flask secret |
| `JWT_SECRET_KEY` | JWT signing key |
| `DEVICE_ID_SECRET` | Signs vote device tokens, must differ from `JWT_SECRET_KEY` |
| `MFA_ENCRYPTION_KEY` | Encrypts stored TOTP secrets |
| `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Object storage credentials |

Also expected in any real deployment, though they fall back to development defaults:
`REDIS_URL`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `FRONTEND_URL`, `BASE_DOMAIN`, `S3_BUCKET_NAME`,
`S3_PUBLIC_URL`, and the `VAPID_*` keys. Leaving `WEBAUTHN_RP_ID` on its default breaks passkeys,
since a credential is bound to the domain that created it.

Set `WEBAUTHN_RP_ID` to the **apex domain**, not the tenant host. A credential is sealed to the
value used at registration, and no mechanism migrates it afterwards: scoped to a tenant subdomain,
every passkey dies the day that tenant is renamed. Scoped to the apex, they work across every
tenant and survive.

### Object storage (Scaleway)

1. Create a bucket in [console.scaleway.com](https://console.scaleway.com), Object Storage.
2. Set its visibility to public: menu images are served directly from it.
3. Create an API key pair, then fill the `S3_*` variables.

### Push notifications (VAPID)

```bash
npx web-push generate-vapid-keys
```

Copy both keys into `.env` and set `VAPID_CONTACT_EMAIL`, which push services require.

The key pair is bound to existing browser subscriptions: changing it forces every user to
subscribe again.

### Transactional email

Optional. Without `SMTP_HOST` and `SMTP_SENDER` the weekly digest is a logged no-op.
See [OPERATIONS.md](OPERATIONS.md) for the Scaleway TEM setup and its DNS records.

### 4. Start

```bash
./deploy/scripts/run.sh
```

The application listens on port 80. Change `PORT` in `.env` if it is taken.

### 5. Create the first administrator

```bash
./deploy/scripts/init.sh
```

It creates the default restaurant and prints an activation link for the first admin account.

## Access

- Application: `http://localhost`
- Health: `http://localhost/api/health`
