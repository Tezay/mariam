# Architecture

Technical reference for the deployed system.

## Stack

| Component | Technology | Role |
|---|---|---|
| Frontend | React 18, React Router 7, Node 22 | User interface and the server that answers it, port 3000 internally |
| Proxy | Nginx | One origin for the frontend and the API, port 80 |
| Backend | Flask, Gunicorn | REST API and authentication, port 5000 internally |
| Scheduler | Flask, APScheduler | Scheduled jobs, its own container |
| Database | PostgreSQL 17 | Persistent storage, port 5432 internally |
| Cache and counters | Redis 8 | Token blacklist, rate limits, telemetry counters, job locks |
| Object storage | Any S3-compatible service, MinIO in development | Dish images, event media, logos |
| Push | Web Push (VAPID) | Browser notifications |

## Request flow

```
                     Mobile · Admin · Display screens
                                  │
                                  ▼ HTTPS
                 TLS terminator: platform proxy, tunnel or CDN
                                  │
                                  ▼ HTTP :80
            ┌─────────────────────────────────────────────┐
            │                   NGINX                     │
            │    /v1/* to the API  ·  the rest to Node    │
            └───────┬─────────────────────────────┬───────┘
                    │                             ▼ HTTP :3000
                    │              ┌──────────────────────────────┐
                    │              │     NODE + REACT ROUTER      │
                    │              │ Pages · robots.txt · sitemap │
                    │              └──────────────┬───────────────┘
                    ▼ HTTP :5000                  ▼
            ┌─────────────────────────────────────────────┐
            │            GUNICORN + FLASK                 │
            │  Auth · Menus · Catalogue · Analytics · Org │
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
            │  Production: any S3-compatible service      │
            └─────────────────────────────────────────────┘
```

## Proxy

The `proxy` service, an image built from `deploy/nginx`, puts the frontend and the API behind one
origin, which avoids CORS entirely. It is the only service that receives outside traffic.

1. `/v1/*` and `/health` go to `backend:5000`.
2. Every other path goes to `frontend:3000`.
3. `server_name _` accepts any `*.mariam.app` subdomain; the `Host` header reaches both
   containers, which resolve the organization from it.
4. The visitor's address is established here, from the trusted proxies in front, and passed on
   as `X-Real-IP`. Rate limits live in the API alone.

## Frontend server

`client/server.js` serves the build on port 3000: static files, the pages, and five paths it
answers itself.

| Path | Content |
|---|---|
| `/config.js` | The deployment's public settings, read from the environment at each request |
| `/robots.txt` | Crawl rules, pointing at the sitemap of the requested host |
| `/sitemap.xml` | The organization's active sites, asked from the API |
| `/app.webmanifest?site=` | The app manifest of a site's page, under the site's name |
| `/healthz` | Liveness, for the container healthcheck |

The public pages are rendered by the server, then hydrated in the browser:

| Path | Page |
|---|---|
| `/` | A single-site organization's page, or the list of its sites |
| `/<site>` | A site's page; `?date=` picks a day of its menu window |
| `/menu`, `/<site>/menu` | Permanent redirects to the site's page, query kept |
| `/tv`, `/<site>/tv` | The display screen, rendered in the browser only and not indexed |
| `/privacy` | The privacy notice for visitors |

The other paths (the dashboard, sign-in) answer a loading indicator, and the application renders
them in the browser.

Each context is an app of its own: a site's page installs the site's app, `/admin` the
dashboard (`manifest-admin.webmanifest`) and `/org` the supervision (`manifest-org.webmanifest`);
the other pages link no manifest. An account installs the app of its own dashboard, from
`/admin/install` or `/org/install`.

To reach the API the server uses `API_INTERNAL_URL` when the deployment sets one and `API_URL`
otherwise. It passes on the visitor's address in `X-Real-IP`, and only when that header came from
the proxy: from any other peer it drops it.

## Configuration

`deploy/.env.example` is the authoritative list of environment variables, commented one by one.
[INSTALL.md](INSTALL.md) names the ones the boot guard refuses to start without.

## Multi-tenancy, URLs and SEO

### Tenant resolution

Organization is the subdomain, restaurant is the path: `crous-example.mariam.app/site-a/menu`.
A single-site organization serves its menu at the root, `site-a.mariam.app/menu`.

The API names the organization and the site in the path: `/v1/orgs/{org}/sites/{site}/…`.
Which organization a host serves is the API's answer too, `GET /v1/domains/{host}`
(`services/tenancy.py`): the subdomain of `BASE_DOMAIN`, or `DEFAULT_ORG_SLUG` for any other host,
or 404 when that is empty. The frontend server asks it for every page, and keeps the answer as long
as the response allows.

### DNS

One record per tenant host, or a wildcard `*.mariam.app`, pointing at the TLS terminator in front
of the proxy. `server_name _` accepts every subdomain and forwards the host.

### Indexing

Each public page carries its own title, description, canonical address and Open Graph preview. A
menu also carries a Schema.org `Restaurant` in JSON-LD, with the dishes of the day. All of it is in
the HTML the server sends, so a crawler or a link preview reads it without running JavaScript.

`robots.txt` allows public pages and blocks `/admin`, `/org` and the API. `sitemap.xml` lists the
organization's active sites. The frontend server answers both for the requested host.

### Onboarding a client

Create the organization, then invite the supervisor through the CLI, see
[OPERATIONS.md](OPERATIONS.md), "Provisioning a new client". The supervisor then creates the
restaurants and their slugs from the `/org` dashboard.

### Local multi-tenant development

Modern browsers resolve `*.localhost` to `127.0.0.1` with no configuration:

```
http://crous-example.localhost:5173/site-a/menu
curl -k https://crous-example.localhost:5173/sitemap.xml
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

1. The visitor subscribes from the notifications panel of a site's page; the browser issues a
   push endpoint. The backend accepts one only on a browser push service
   (`server/app/utils/push_endpoint.py`) and posts to no other host.
2. The scheduler checks every minute what should go out, signs with the VAPID private key and
   posts to the push service.
3. The push service delivers to the device.
4. The service worker receives the `push` event and displays the notification.

### Service workers

| File | Used in | Module format |
|---|---|---|
| `client/public/sw-push.js` | Development, registered by `push.ts` | Classic, no imports |
| `client/src/sw-push.js` | Production, bundled by `client/scripts/build-sw.mjs` with Workbox | ES modules |

Development registers the minimal worker directly. A production build bundles the other one and
injects its precache list once the app is built; `client/src/entry.client.tsx` registers it, and
a page still running the previous build reloads when the new worker takes over.

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
