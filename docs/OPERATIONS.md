# Operations

Day-to-day commands for running Mariam in production. Scripts live in `deploy/scripts/`.

## Service control

```bash
./deploy/scripts/run.sh            # start (same as `up`)
./deploy/scripts/run.sh down       # stop
./deploy/scripts/run.sh restart    # rebuild and restart
./deploy/scripts/run.sh logs       # follow logs
./deploy/scripts/run.sh status     # service health
```

## Administration

### First start

```bash
./deploy/scripts/init.sh
```

### Instance bootstrap

```bash
docker compose -f deploy/compose.yaml exec backend flask create-activation-link
docker compose -f deploy/compose.yaml exec backend flask init-restaurant
```

### Accounts

`flask user` covers what the dashboard does not expose. Every write records an audit entry
with no author and no address, carrying `via: cli` in its details, and returns a non-zero exit
code on failure.

| Command | What it does |
| --- | --- |
| `user list [--role] [--site] [--org] [--all]` | Accounts with their tenant and second factor |
| `user show EMAIL` | Full state: role, tenant, TOTP, passkeys, last login |
| `user invite EMAIL --role R [--restaurant S] [--org O]` | Activation link for a new account |
| `user reset-password EMAIL` | Password reset link (72 h, single use) |
| `user reset-2fa EMAIL [--totp] [--passkeys]` | Removes the second factor and revokes live sessions |
| `user set-email EMAIL NEW_EMAIL` | Changes the address |
| `user set-role EMAIL ROLE [--restaurant S] [--org O]` | Changes the role and tenant |
| `user enable EMAIL` / `user disable EMAIL` | Turns an account off without deleting it |
| `user delete EMAIL [--yes]` | Deletes the account and its passkeys; audit entries are kept |

In development, `make user ARGS="show demo@mariam.app"` wraps the same group.

An account left with no second factor is sent to the enrolment page on its next sign-in and
cannot leave it until a passkey or an authenticator application is registered — which is what
makes `user reset-2fa` the safe way to unlock someone who lost both their phone and their
laptop.

### Provisioning a new client

An organization is a client; its slug is the public subdomain, `<slug>.mariam.app`. A supervisor
(`org_admin`) manages every site of that organization from `/org` and creates the restaurants.

```bash
# 1. Create the organization (idempotent on the slug)
docker compose -f deploy/compose.yaml exec backend \
  flask create-org --name "Example Organization" --slug example-org

# 2. Invite the supervisor, attached to the organization and to no site
#    (--org takes an id or a slug; site roles take --restaurant instead)
docker compose -f deploy/compose.yaml exec backend \
  flask user invite supervisor@example.com --role org_admin --org example-org
```

The command prints an activation URL (`/activate/<token>`, valid 72 hours, single use).
`user invite` works for any role (`org_admin`, `admin`, `editor`, `reader`) and is the generic
way to create an account in production when inviting from the UI is not possible, such as the
first user of a new organization.

### Resetting a password

```bash
docker compose -f deploy/compose.yaml exec backend flask user reset-password user@example.com
```

Without a terminal, on serverless environments, set `RESET_PASSWORD_EMAIL=user@example.com`
and redeploy: the entrypoint runs the same command at container start and prints the URL in
the logs. Remove the variable afterwards, otherwise a new link is issued on every restart.

Completing the reset still requires the account's second factor — its code or its passkey —
so holding the link is not enough. An account with neither is refused: re-enrol it with
`user invite` instead.

### MFA encryption key

TOTP secrets are encrypted at rest with Fernet. The key is mandatory in production, the backend
refuses to start without it.

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Put it in `MFA_ENCRYPTION_KEY` and **store a copy in a secret manager**: losing it makes every
TOTP secret unreadable and forces an MFA reset on every account. The migration that introduced it
encrypts existing secrets on the first `flask db upgrade`, so the key must already be set.

### Redis

Redis carries the JWT blacklist, rate limiting shared across workers, the analytics aggregate
cache, traffic counters and scheduled-job locks. The production compose ships the service;
`REDIS_URL` remains the abstraction, so a managed instance (`rediss://…`) works identically.

```bash
# Switching from a managed instance
# 1. In deploy/.env: REDIS_URL=redis://redis:6379/0
# 2. docker compose up -d redis backend scheduler
# 3. Check, then cancel the managed subscription
curl -s https://<domain>/health/ready | jq .checks
```

The data is ephemeral by design, everything carries a TTL: losing the volume costs at worst a few
minutes of view counters and the current day's unique visitors. Two things to know:

- `maxmemory-policy volatile-ttl` means that under memory pressure Redis evicts keys with a TTL,
  **blacklist entries included**, which would make a revoked token valid again until it expires on
  its own, 30 minutes at most. The 256 MB ceiling is far above real usage; watch
  `redis-cli info memory` if the number of sites grows sharply.
- The blacklist check **fails closed**: if `REDIS_URL` is set but Redis is unreachable,
  authenticated requests are rejected. `restart: unless-stopped` and the healthcheck cover the
  normal case.

### Traffic counting on shared networks

An institution reaches the service from a handful of public addresses: every student on a campus
shares one. Every IP-indexed ceiling therefore budgets a whole site, not a visitor.

| Variable | Default | What it bounds |
|---|---|---|
| `PUBLIC_RATE_LIMIT` | `600 per minute` | Public-page requests, per address |
| `TELEMETRY_VISITOR_DAILY_CAP` | `120` | Views counted for one visitor, per site |
| `TELEMETRY_IP_DAILY_CAP` | `50000` | Views counted for one address, per site |
| `TELEMETRY_IP_UNIQUE_CAP` | `5000` | Distinct visitors attributable to one address, per site |

A ceiling set too low shows up as 429s on `/v1/public/…` during service hours, or a traffic curve
that flattens at a fixed time. Raising them is functionally safe; lowering them skews the
measurement.

Addresses serve only those ceilings and the unique-visitor count, hashed with a daily salt that is
never persisted (48-hour TTL). No address, no user agent and no per-visitor row reaches
PostgreSQL: the traffic tables hold counters aggregated by site, day, hour and page kind.

### Transactional email

The only email Mariam sends is the weekly digest, and only to accounts that opted in, from the
Notifications section of their account page. Without `SMTP_HOST` it is a logged no-op: nothing
breaks, nobody receives anything.

Default provider: Scaleway TEM, the same host as production object storage, 300 free emails a month.

1. Scaleway console, Transactional Email, add the `mariam.app` domain
2. Publish the DNS records it gives you (SPF, DKIM, return-path MX) and wait for validation
3. Create an API key with `TransactionalEmailFullAccess`
4. Fill in `deploy/.env`:

```bash
SMTP_HOST=smtp.tem.scaleway.com
SMTP_PORT=587
SMTP_USERNAME=<project_id>                  # the Scaleway project id
SMTP_PASSWORD=<API key>
SMTP_SENDER=Mariam <no-reply@mariam.app>    # must belong to the validated domain
```

Check it without waiting for the weekly run:

```bash
docker compose exec backend flask send-digest --to=user@example.com --dry-run
docker compose exec backend flask send-digest --to=user@example.com --html-out /tmp/digest.html
docker compose exec backend flask send-digest --to=user@example.com
```

Wording and layout live in `server/app/templates/emails/`, one folder per language
(`EMAIL_LOCALE`, `fr` by default) above a shared shell. Adding a language means copying the folder
and translating it.

## Database

### Migrations

Migrations are applied automatically when the backend starts. For every model change:

```bash
docker compose exec -T backend flask db migrate -m "describe change"
docker compose exec -T backend flask db upgrade
git add server/migrations/versions/
```

Commit the migration, then redeploy the backend image.

### Baseline or reset without console access

```bash
MARIAM_MIGRATION_AUTOSTAMP=1   # database exists without Alembic history
MARIAM_DB_RESET=1              # wipe and rebuild
```

Both must be temporary: remove them after the deployment.

### Manual dump and restore

```bash
docker exec -t mariam_db_prod pg_dump -U mariam mariam_db > backup_$(date +%Y%m%d_%H%M%S).sql
cat backup_file.sql | docker exec -i mariam_db_prod psql -U mariam -d mariam_db   # overwrites
docker exec -it mariam_db_prod psql -U mariam -d mariam_db                        # console
```

## Updating

```bash
git pull origin main
./deploy/scripts/run.sh restart
```

## Migrating a tenant to a new hostname

Renaming a tenant's public hostname touches passkeys, cached service workers and printed QR codes.
Run it while the service is closed, in this order.

Before anything, list who would be locked out. A passkey is sealed to the hostname that registered
it, so a rename invalidates every one of them; an account holding only passkeys has no way back in.

```sql
SELECT u.id, u.email, (u.mfa_secret IS NOT NULL) AS totp,
       (SELECT COUNT(*) FROM passkeys p WHERE p.user_id = u.id) AS passkeys
FROM users u ORDER BY u.id;
```

Any row with passkeys and no TOTP must enrol one first, or wait for an admin to reset its MFA
afterwards. Keep one administrator account whose TOTP you control: it is what lets you reset the
others.

1. Publish the new hostname and leave the old one serving. Behind a Cloudflare Tunnel, add a public
   hostname pointing at the same service; the CNAME is created for you. Add the domain to the
   frontend application and redeploy it, or the proxy answers 404.
2. Set `WEBAUTHN_RP_ID` to the apex domain rather than the tenant host, so future passkeys survive
   every later rename. `WEBAUTHN_ORIGIN` and `FRONTEND_URL` take the new hostname; both accept a
   single origin for WebAuthn.
3. Update the slug, then redeploy the backend and the scheduler. The public menu answers 404 for the
   minute it takes the containers to swap, since the slug and the deployed configuration must agree.

```sql
UPDATE organizations SET slug='new-slug' WHERE slug='old-slug';
```

4. Check the new hostname end to end before redirecting anything: public menu, then an admin login
   with password and TOTP.
5. Redirect the old hostname with a 301 that preserves the path, or printed QR codes pointing at
   `/menu` land on a root. Keep its DNS record: the rule only fires if the name still resolves.
6. Drop the dead credentials, then tell their owners to enrol again.

```sql
DELETE FROM passkeys;
```

A device that already visited the old hostname serves the app from its service worker cache without
touching the network, so the redirect never reaches it. Two measures help. Exclude the service
worker scripts (`/sw*`) from the redirect, so the browser can still fetch them, and add
`Clear-Site-Data: "storage"` on responses from the old hostname, which unregisters the workers and
clears the origin. Support is wide but not universal, so set `CANONICAL_HOST` on the old
deployment: the app then unregisters its own worker and redirects, which is the only measure that
covers every browser.

## Troubleshooting

**The application does not start.** Read `./deploy/scripts/run.sh logs`, check that every required
variable is set in `.env`, and that the port is free (`lsof -i :80`).

**Database connection errors.** Check the db container with `./deploy/scripts/run.sh status`, then
the credentials in `.env`. `Database connection failed after 30 attempts` also appears when the
startup guard rejects the configuration: the entrypoint probes the database with `flask db current`,
which loads the app, so a missing secret surfaces as a connection failure. Check the variables
before suspecting Postgres.

**A healthcheck reporting `curl: not found`.** The backend image carries neither `curl` nor `wget`.
An orchestrator that shells out for an HTTP check needs the Python equivalent, the one
`deploy/compose.yaml` uses:

```bash
python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health', timeout=3)"
```

Give it a start period long enough to cover the migrations, which run before Gunicorn accepts a
connection.

**Full reset**, which destroys all data:

```bash
./deploy/scripts/run.sh down
docker volume rm deploy_postgres_data_prod
./deploy/scripts/run.sh
./deploy/scripts/init.sh
```

## Production readiness

### Automated off-site backups

The `backup` service runs a daily `pg_dump` pushed to a dedicated Scaleway bucket, separate from
media, with configurable retention.

1. Create a bucket (for example `mariam-backups`) with versioning enabled
2. Create a dedicated API key, ideally scoped to that bucket
3. Fill `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`, `BACKUP_S3_BUCKET`
4. Redeploy, then check `docker compose -f deploy/compose.yaml logs backup`

Restoring, which overwrites the database:

```bash
./deploy/scripts/restore.sh                                 # latest dump
./deploy/scripts/restore.sh mariam-YYYYMMDD-HHMMSS.dump     # a specific one
```

Test the restore regularly: the only reliable backup is one that has already been restored. Run it
on a throwaway instance and check the data.

### Media bucket versioning

Enable versioning and a lifecycle rule on the image bucket (`S3_BUCKET_NAME`). It protects photos
and logos from accidental deletion.

### Rollback

Images are published to GHCR on every tag.

```bash
# in deploy/.env
MARIAM_TAG=0.14.0
./deploy/scripts/run.sh
```

Without `MARIAM_TAG`, production follows `latest`. Pinning a tag gives a reproducible deployment.
Migrations are forward-only: rolling back the code does not roll back the schema, so restore a
dump if the schema has to go back too.

### Error tracking

1. Create a Sentry organization in the European region
2. Create two projects, backend (Python/Flask) and frontend (React)
3. Set `SENTRY_DSN` and `FRONTEND_SENTRY_DSN` in `.env`
4. Redeploy. Empty means disabled, with no other effect.

### External uptime monitoring

`GET /health/ready` returns 200 when the database and Redis answer, 503 otherwise. It is distinct
from `/health`, which is process liveness only.

Point an external check (UptimeRobot, healthchecks.io) at `https://<domain>/health/ready` every
one to five minutes, with email or SMS alerting.

### TLS

TLS is terminated by Cloudflare in front of the VPS; nginx listens on `:80`.

- SSL/TLS mode: Full (strict)
- Generate a Cloudflare Origin Certificate and install it on the VPS, so the Cloudflare-to-origin
  leg is encrypted too
- Firewall the VPS to accept only Cloudflare addresses on `:80` and `:443`. Otherwise the origin
  is reachable directly and the nginx real-IP handling can be bypassed
- Enable HSTS at Cloudflare; nginx sends it as well
