# Architecture

Technical reference for the deployed system.

## Stack

| Component | Technology | Role |
|---|---|---|
| Frontend | React 18, Vite, Nginx | User interface, port 80 |
| Backend | Flask, Gunicorn | REST API and authentication, port 5000 internally |
| Scheduler | Flask, APScheduler | Scheduled jobs, its own container |
| Database | PostgreSQL 15 | Persistent storage, port 5432 internally |
| Cache and counters | Redis 8 | Token blacklist, rate limits, telemetry counters, job locks |
| Object storage | Scaleway Object Storage, MinIO in development | Dish images, event media, logos |
| Push | Web Push (VAPID) | Browser notifications |

## Request flow

```
                     Mobile · Admin · Display screens
                                  │
                                  ▼ HTTP :80
            ┌─────────────────────────────────────────────┐
            │                   NGINX                     │
            │  Static SPA build   ·   Reverse proxy /v1/* │
            └─────────────────────────────────────────────┘
                                  │
                                  ▼ HTTP :5000
            ┌─────────────────────────────────────────────┐
            │            GUNICORN + FLASK                 │
            │  Auth · Menus · Catalogue · Analytics · Org  │
            └───────┬──────────────────┬──────────────────┘
                    │                  │
        TCP :5432   ▼                  ▼  :6379
            ┌───────────────┐   ┌─────────────────────────┐
            │  POSTGRESQL   │   │         REDIS           │
            │  users        │   │  JWT blacklist          │
            │  menus        │   │  rate limits            │
            │  catalog      │   │  view counters, HLL     │
            │  votes        │   │  job locks              │
            │  telemetry    │   └─────────────────────────┘
            │  audit_log    │              ▲
            └───────────────┘              │
                    ▲               ┌──────────────┐
                    └───────────────│  SCHEDULER   │
                                    │  APScheduler │
                                    └──────────────┘
                                  │
                                  ▼ S3 API (HTTPS)
            ┌─────────────────────────────────────────────┐
            │  Object storage                             │
            │  Development: MinIO, :9000 API / :9001 UI   │
            │  Production: s3.fr-par.scw.cloud            │
            └─────────────────────────────────────────────┘
```

## Nginx

`deploy/nginx/nginx.conf` handles:

1. Reverse proxy: `/v1/*` and `/health` to `backend:5000`, which avoids CORS entirely.
2. Private routes (`/admin`, `/org`, `/login`, `/activate`, `/reset-password`, `/notifications`):
   the SPA is served statically (`try_files $uri /index.html`).
3. Public pages (`/`, `/menu`, `/<slug>/menu`, `/sitemap.xml`): proxied to Flask (`@shell`), which
   injects SEO meta and JSON-LD. Real files, assets, manifests and favicons stay static.
4. Static assets cached for a year, GZIP on.
5. `server_name _` accepts any `*.mariam.app` subdomain; the `Host` header reaches the backend,
   which resolves the organization from it.

## Configuration

`deploy/.env.example` is the authoritative list of environment variables, commented one by one.
[INSTALL.md](INSTALL.md) names the ones the boot guard refuses to start without.

## Multi-tenancy, URLs and SEO

### Tenant resolution

Organization is the subdomain, restaurant is the path: `crous-example.mariam.app/site-a/menu`.
A single-site organization serves its menu at the root, `site-a.mariam.app/menu`.

The backend resolves the organization from the `Host` header (`org_slug_from_host`), then the
restaurant from the path slug. An unresolved host falls back to `DEFAULT_ORG_SLUG`, or 404 when
that is empty.

### DNS

A wildcard `*.mariam.app` record (A/AAAA or CNAME) proxied through Cloudflare. `server_name _`
accepts every subdomain and forwards the host.

### SEO shell

Public pages are proxied to Flask (`routes/seo.py`), which fetches the frontend's `index.html`
(`FRONTEND_ORIGIN`, cached) and injects `<title>`, description, Open Graph and Twitter tags, a
canonical URL, and a Schema.org `Restaurant` JSON-LD with the day's menu. Scrapers do not run
JavaScript, so link previews and indexing depend on this.

`sitemap.xml` is generated per host from the organization's active sites. `robots.txt`, served by
nginx, allows public pages, blocks `/admin`, `/org` and the API, and points at the sitemap.

### Onboarding a client

Create the organization, then invite the supervisor through the CLI, see
[OPERATIONS.md](OPERATIONS.md), "Provisioning a new client". The supervisor then creates the
restaurants and their slugs from the `/org` dashboard.

### Local multi-tenant development

Modern browsers resolve `*.localhost` to `127.0.0.1` with no configuration:

```
http://crous-example.localhost:5173/site-a/menu
curl -H "Host: crous-example.localhost" http://localhost:5000/sitemap.xml
```

`lvh.me` works the same way if needed.

## Security

- MFA required on every management account, TOTP or passkey
- Passwords of 12 characters or more, mixed case, digit and symbol
- 30-minute sessions by default, revoked tokens blacklisted in Redis
- Step-up authentication on destructive actions
- Audit log on every sensitive action, purged past `AUDIT_RETENTION_DAYS`
- HTTPS mandatory in production, and required by Web Push

## Taxonomy

Dietary labels and certifications come from one registry, `server/app/data/taxonomy.py`, seeded
into six reference tables and four join tables. Certification logos live in
`client/public/certifications/`.

```
taxonomy.py (registry)
    │ seeded by an Alembic migration
    ▼
dietary_tag_categories      certification_categories
dietary_tags                certifications
dietary_tag_keywords        certification_keywords
    │ N:N                          │ N:N
    ├── restaurant_dietary_tags    ├── restaurant_certifications
    └── menu_item_dietary_tags     └── menu_item_certifications
```

To add one: edit `taxonomy.py`, write an Alembic migration inserting the row, run `flask db upgrade`.

## Push notifications

Web Push (RFC 8030) with VAPID authentication (RFC 8292).

```
Browser ──(1) subscribe──→ Backend ──(2) signed message──→ Push service
   ▲                          ▲                            (FCM / APNs / WNS)
   │                          │                                   │
   └──(4) service worker ─────┴────── scheduler, every minute     │
          shows notification                                      │
                          (3) delivery ─────────────────────────-─┘
```

1. The user subscribes from `/notifications`; the browser issues a push endpoint.
2. The scheduler checks every minute what should go out, signs with the VAPID private key and
   posts to the push service.
3. The push service delivers to the device.
4. The service worker receives the `push` event and displays the notification.

### Service workers

| File | Used in | Module format |
|---|---|---|
| `client/public/sw-push.js` | Development, registered by `push.ts` | Classic, no imports |
| `client/src/sw-push.js` | Production, built by VitePWA and Workbox | ES modules |

`devOptions.enabled` is false in `vite.config.ts`, so development registers the minimal worker
directly while production ships the Workbox build with asset precaching.

### Headers

| Header | Value | Role |
|---|---|---|
| `TTL` | `86400` | Retention while the device is offline |
| `Urgency` | `high` | Immediate delivery, bypasses Android Doze |
| `Topic` | `menu-today-YYYY-MM-DD` | Replaces a queued message instead of duplicating it |

### Types

| Type | Trigger | Tag |
|---|---|---|
| Today's menu | Scheduler, at the user's chosen hour | `menu-today-{date}` |
| Tomorrow's menu | Scheduler, at the user's chosen hour | `menu-tomorrow-{date}` |
| Event, 7 days out | Scheduler | `event-{title}-7days` |
| Event, next day | Scheduler | `event-{title}-tomorrow` |
