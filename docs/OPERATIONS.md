# Operations

Day-to-day commands for running Mariam in production, run from the `deploy/` folder.

## Service control

```bash
docker compose up -d                # start, or apply a change
docker compose down                 # stop
docker compose ps                   # state and health of each service
docker compose logs -f --tail=100   # follow the logs
```

## Administration

### First administrator

At its first start, the backend applies the migrations and creates the default site. The first
account comes from an activation link:

```bash
docker compose exec backend flask create-activation-link
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
| `user set-email EMAIL NEW_EMAIL` | Changes the address, ends the sessions and alerts the old address |
| `user set-role EMAIL ROLE [--restaurant S] [--org O]` | Changes the role and tenant |
| `user enable EMAIL` / `user disable EMAIL` | Turns an account off without deleting it |
| `user delete EMAIL [--yes]` | Deletes the account and its passkeys; audit entries are kept |

In development, `make user ARGS="show demo@mariam.app"` wraps the same group.

Addresses are stored lowercase and ASCII-only, and the commands normalise the ones they are
given: `user show Jean@Example.com` finds `jean@example.com`.

An account left with no second factor is sent to the enrolment page on its next sign-in and
cannot leave it until a passkey or an authenticator application is registered — which is what
makes `user reset-2fa` the safe way to unlock someone who lost both their phone and their
laptop. An administrator does the same from the users page, for the accounts it manages,
after confirming its own identity.

### Provisioning a new client

An organization is a client; its slug is the public subdomain, `<slug>.mariam.app`. A supervisor
(`org_admin`) manages every site of that organization from `/org` and creates the restaurants.

```bash
# 1. Create the organization (idempotent on the slug)
docker compose exec backend \
  flask create-org --name "Example Organization" --slug example-org

# 2. Invite the supervisor, attached to the organization and to no site
#    (--org takes an id or a slug; site roles take --restaurant instead)
docker compose exec backend \
  flask user invite supervisor@example.com --role org_admin --org example-org
```

The command prints an activation URL (`/activate/<token>`, valid 72 hours, single use).
`user invite` works for any role (`org_admin`, `admin`, `editor`) and is the generic
way to create an account in production when inviting from the UI is not possible, such as the
first user of a new organization.

### Resetting a password

```bash
docker compose exec backend flask user reset-password user@example.com
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

`REDIS_URL` is required in production: the backend and the scheduler refuse to start without it,
or with `memory://`. The scheduler runs the backend image with the backend's environment plus
`ENABLE_SCHEDULER=1`. A platform that deploys them separately needs the same variables and the
same image tag on both, and both redeployed at each release.

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

### TV display

A screen shows `https://<organization host>/<site>/tv` (`/tv` for a single site) in a browser or a
signage player's web page widget.
- It fills any resolution, 720p to 4K, in landscape or portrait. A screen mounted upright whose
  player sends a landscape picture takes `?rotation=90` (or `270`).
- It refreshes itself: the menu, news and closures every five minutes, the capacity every minute
  during service, and a full reload around 3:30 Paris time. Give the widget a long duration rather
  than a reload every minute, which makes the screen blink.
- When the API is unreachable it keeps the last menu and says since when; a page that could not
  load at all retries every minute.
- Its QR code opens the site's page with `?utm_source=tv&utm_medium=qr`, counted apart in
  "Consultations".

### Traffic counting on shared networks

An institution reaches the service from a handful of public addresses: every student on a campus
shares one. Every IP-indexed ceiling therefore budgets a whole site, not a visitor.

| Variable | Default | What it bounds |
|---|---|---|
| `PUBLIC_RATE_LIMIT` | `600 per minute` | Public-page requests, per address |
| `TELEMETRY_VISITOR_DAILY_CAP` | `120` | Views counted for one visitor, per site |
| `TELEMETRY_IP_DAILY_CAP` | `50000` | Views counted for one address, per site |
| `TELEMETRY_IP_UNIQUE_CAP` | `5000` | Distinct visitors attributable to one address, per site |

A ceiling set too low shows up as 429s on `/v1/orgs/…` during service hours, or a traffic curve
that flattens at a fixed time. Raising them is functionally safe; lowering them skews the
measurement.

Addresses serve only those ceilings and the unique-visitor count, hashed with a daily salt that is
never persisted (48-hour TTL). No address, no user agent and no per-visitor row reaches
PostgreSQL: the traffic tables hold counters aggregated by site, day, hour and page kind.

### Transactional email

Mariam sends five kinds of email:

- the weekly digest, to accounts that opted in from the Notifications section of their account
  page. It is not sent for a week in which none of the recipient's sites was open, and it
  stops after two weeks without a published menu, which the last digest announces. A site
  closed for a whole week or more gets a reopening notice at the last slot before it reopens;
- a security alert to the holder of an account whose password or second factor changes, with
  the date, the browser and the address the change came from;
- an alert to the previous address when an account changes its sign-in address;
- a password reset link, when an administrator sends one from the users page;
- an invitation, when the administrator who creates it enters an address: twenty a day at most
  for one administrator.

Security alerts cannot be turned off, and a disabled account receives none. An address receives
at most ten messages of a kind per day. Without `SMTP_HOST` every send is a logged no-op:
nothing breaks, nobody receives anything.

Any SMTP relay that accepts STARTTLS on port 587; port 465 is not supported. Send from a
subdomain of its own, such as `mail.example.org`, with SPF, DKIM and DMARC published, and give the
relay credentials that can only send.

```bash
SMTP_HOST=smtp.example.org
SMTP_PORT=587
SMTP_USERNAME=<username>
SMTP_PASSWORD=<password>
SMTP_SENDER=Mariam <no-reply@mail.example.org>   # must belong to the verified domain
SUPPORT_EMAIL=contact@example.org                # where replies go, named in the footer
```

The digest leaves from the scheduler and the address alert from the backend: both need these
variables. The digest's unsubscribe link points to the API, at `FRONTEND_URL/v1` unless `API_URL`
says otherwise: when the API has a host of its own, give the backend and the scheduler the
`API_URL` the front end is given.

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
docker compose exec -T db pg_dump -U mariam -Fc mariam_db > mariam.dump
docker compose exec -T db pg_restore -U mariam -d mariam_db --clean --if-exists --no-owner < mariam.dump
docker compose exec db psql -U mariam -d mariam_db   # console
```

### Moving a database into this stack

From another deployment on the same major Postgres version, restore before the rest of the stack
starts:

```bash
pg_dump -Fc <connection to the old database> > mariam.dump
docker compose up -d db
docker compose exec -T db pg_restore -U mariam -d mariam_db --no-owner < mariam.dump
docker compose up -d
```

Redis starts empty, so the tokens the old deployment revoked are forgotten: change `JWT_SECRET_KEY`
at the same time, and everyone signs in again. Media stay where they are: keep the `S3_*` values.

## Updating

```bash
docker compose run --rm backup once
git fetch --tags && git checkout vX.Y.Z   # then MARIAM_TAG=X.Y.Z in .env
docker compose pull && docker compose up -d
```

### Testing a release candidate

A tag `vX.Y.Z-rc.N` runs the full release gate and publishes images tagged `X.Y.Z-rc.N` only.
`latest` and `X.Y` stay on the last final release, so production does not move.

1. Tag the commit to test on `main`: `git tag v0.17.0-rc.1 && git push origin v0.17.0-rc.1`
2. On the staging instance, move the backend, the scheduler and the frontend to `0.17.0-rc.1`,
   then redeploy all three
3. Check it: `/health` reports `0.17.0-rc.1`, `/health/ready` answers `ready`, and the changes
   work
4. A fix goes through a pull request as usual and becomes `rc.2`. Once a candidate holds, cut
   the release

The staging database receives the candidate's migrations, and they cannot be rolled back. A
candidate abandoned after a migration leaves the staging schema ahead of production.

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

1. Publish the new hostname and leave the old one serving: route it to the same service at the edge
   (DNS, tunnel or load balancer), and to the frontend in the platform's proxy, or it answers 404.
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

**The application does not start.** Read `docker compose logs`. Compose refuses to start while a
required variable is empty, and names it.

**Database connection errors.** Check the db container with `docker compose ps`, then
the credentials in `.env`. `Database connection failed after 30 attempts` also appears when the
startup guard rejects the configuration: the entrypoint probes the database with `flask db current`,
which loads the app, so a missing secret surfaces as a connection failure. Check the variables
before suspecting Postgres.

**A healthcheck reporting `curl: not found`.** The backend image carries neither `curl` nor `wget`,
and declares no healthcheck of its own: it also runs the scheduler, which listens on no port. Each
service declares its check, as `deploy/compose.yaml` does for the backend with this command:

```bash
python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health', timeout=3)"
```

Give it a start period long enough to cover the migrations, which run before Gunicorn accepts a
connection.

**Full reset**, which destroys all data:

```bash
docker compose down
docker volume rm deploy_postgres_data_prod
docker compose up -d
docker compose exec backend flask create-activation-link
```

## Production readiness

### Automated off-site backups

Daily at `BACKUP_TIME`, in the container's time zone, the `backup` service dumps the database,
restores the dump into a scratch server inside its container, encrypts it with
[age](https://age-encryption.org) and uploads it as `daily/mariam-<UTC>.dump.age`, then fetches
`BACKUP_HEARTBEAT_URL`. A dump that does not restore is not uploaded. The service deletes nothing:
retention is the bucket's. Without `BACKUP_S3_BUCKET`, it logs that backups are off and does
nothing else.

Setup:

1. **Key pair**: `docker run --rm --entrypoint age-keygen ghcr.io/tezay/mariam-backup`. The public
   key goes in `BACKUP_AGE_RECIPIENT`; the identity stays offline.
2. **Bucket**, dedicated, preferably in an account or project of its own, in a storage class
   replicated across availability zones:
   - versioning and Object Lock, default retention 30 days, compliance mode;
   - lifecycle rule on `daily/`: expire current versions after 30 days, noncurrent versions after
     1 day, incomplete multipart uploads after 1 day.
3. **Keys**: the server's may only `s3:PutObject` (multipart included). The restore key,
   `s3:GetObject` and `s3:ListBucket`, stays off the server.
4. **Heartbeat** (optional): a check that alerts when a day passes without a request.
5. First run: `docker compose run --rm backup once`.

Verify, from any machine; it restores into a scratch server and counts each table's rows:

```bash
docker run --rm -i \
  -e BACKUP_S3_ENDPOINT=<endpoint> -e BACKUP_S3_REGION=<region> -e BACKUP_S3_BUCKET=<bucket> \
  -e BACKUP_S3_ACCESS_KEY=<restore key> -e BACKUP_S3_SECRET_KEY=<restore secret> \
  ghcr.io/tezay/mariam-backup verify latest < ~/mariam-backup-identity.txt
```

Restore, in a single transaction, with the backend and the scheduler stopped meanwhile:

```bash
cd deploy
RESTORE_S3_ACCESS_KEY=<restore key> RESTORE_S3_SECRET_KEY=<restore secret> \
  ./scripts/restore.sh ~/mariam-backup-identity.txt [NAME|latest]
```

Keep `MFA_ENCRYPTION_KEY` and the VAPID key pair offline with the identity: a restored database is
unusable without the first, and loses its push subscriptions without the second.

Deployed outside `deploy/compose.yaml`, the image runs on its own with these variables and `PG*`
pointing at the database.

### Media bucket versioning

Enable versioning and a lifecycle rule on the image bucket (`S3_BUCKET_NAME`). It protects photos
and logos from accidental deletion.

### Rollback

Images are published to GHCR on every tag. Rolling back is deploying the previous release:

```bash
git checkout vX.Y.Z   # then MARIAM_TAG=X.Y.Z in .env
docker compose pull && docker compose up -d
```

Migrations are forward-only: rolling back the code does not roll back the schema, so restore a
dump if the schema has to go back too.

### Error tracking

1. Create a Sentry organization in the European region
2. Create two projects, backend (Python/Flask) and frontend (React)
3. Set `SENTRY_DSN` and `FRONTEND_SENTRY_DSN` in `.env`
4. Redeploy. Empty means disabled, with no other effect.

### External uptime monitoring

`GET /health/ready` returns 200 when the database and Redis answer and a traffic-counter flush
succeeded within the last 15 minutes, 503 otherwise. `checks.scheduler` at `false` points at the
scheduler: stopped, without Redis, or failing. Expect it degraded for up to five minutes after a
first install or a Redis wipe, until the first flush.

It is distinct from `/health`, which is process liveness only. Keep container healthchecks on
`/health`: on `/health/ready`, a scheduler outage would take a working backend out of rotation.

Point an external check (UptimeRobot, healthchecks.io) at `https://<domain>/health/ready` every
one to five minutes, with email or SMS alerting.

### TLS

TLS is terminated in front of the server; the `proxy` service listens on `:80`.

- Encrypt the leg from the TLS terminator to the server too: an origin certificate, or a tunnel.
- Where the proxy's port is published, accept it from the terminator only, or a client can claim
  any address to the proxy.
- The frontend and the API send HSTS.

### Client address

The proxy establishes the visitor's address once: from `REAL_IP_HEADER`, on a connection from one
of `TRUSTED_PROXIES`, and from the connection itself otherwise. It passes it on as `X-Real-IP`,
which the API believes only from a peer on the deployment's own network.

| Variable | Default | Set it to |
|---|---|---|
| `TRUSTED_PROXIES` | the private and loopback ranges | the ranges the TLS terminator connects from, when they are public |
| `REAL_IP_HEADER` | `X-Forwarded-For`, read right to left past trusted entries | the header a CDN in front sets to the visitor's address |

The API and the frontend server must be reachable through the proxy only: every rate limit, audit
entry and vote ceiling keys on this address.

### Security headers

Each application sets the headers of what it answers, whatever proxy stands in front.

- The frontend server (`client/server.js`) sends HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy` and `Permissions-Policy`. The TV display (`/tv`, `/<site>/tv`) goes without
  `X-Frame-Options`, so that a signage player may show it in a frame.
- The API (`server/app/security_headers.py`) sends HSTS, `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`,
  `X-Robots-Tag: noindex` and an enforced Content-Security-Policy that loads nothing. Its two HTML
  pages, the API documentation and the unsubscribe confirmation, have a policy of their own.

The frontend's Content-Security-Policy is report-only for now. The server writes it for each page
(`client/src/lib/runtime-config.server.ts`), with a nonce for the router's inline scripts and the
origins the deployment configures: the API when `API_URL` is absolute, Umami, Sentry. To make it
enforcing:

1. Browse the admin, a public menu and the TV display with the browser console open, and clear
   every `Content-Security-Policy-Report-Only` violation
2. In `client/src/entry.server.tsx`, rename the header to `Content-Security-Policy`
3. Release, then check the console again

### Frontend container

The image runs a Node server as an unprivileged user.

| Setting | Value |
|---|---|
| Port | `3000`, or `PORT` |
| Healthcheck | Declared in the image, on `GET /healthz`, and run by Docker and Compose. The image carries neither `curl` nor `wget`: a probe run inside the container must call `node`, as the image's does, or reach `/healthz` over the network |
| Memory | 384 MB is comfortable |

| Variable | Role |
|---|---|
| `API_URL` | Where browsers reach the API: `/v1` behind `deploy/nginx`, or the API's own host, `https://api.example.org/v1` |
| `API_INTERNAL_URL` | Optional. Where the server itself reaches the API, for instance `http://backend:5000/v1` on a shared Docker network. Without it the server goes through `API_URL`: its calls then all carry the server's own address and draw on a single `PUBLIC_RATE_LIMIT` budget |
| `UMAMI_SCRIPT_URL`, `UMAMI_WEBSITE_ID` | Optional, together: the tracker's script and the site it reports as |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | Optional: error reporting from the browser |
| `CANONICAL_HOST` | See "Migrating a tenant to a new hostname" |

The variables are read at each request: changing one takes a restart, not a rebuild.
