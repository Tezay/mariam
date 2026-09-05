# MARIAM — API Reference

The MARIAM API follows REST conventions. All endpoints are prefixed with `/v1`. Responses are JSON.

**Interactive documentation (Swagger UI):** `https://<your-ru>.mariam.app/docs`

## Authentication

MARIAM supports two login methods: **passkey** (biometric / FIDO2, passwordless) and **email + password + TOTP**. Every account must have at least one active 2FA method (TOTP or at least one passkey) at all times.

Authenticated requests must include the access token as a Bearer token in the `Authorization` header.

```
Authorization: Bearer <access_token>
```

| Token | Lifetime |
|-------|----------|
| Access token | 30 minutes |
| Refresh token | 7 days |

### Login flows

**Flow A — Standalone passkey (no email/password required)**

1. `POST /v1/auth/passkey/login/begin` — generate a discoverable WebAuthn challenge
2. `POST /v1/auth/passkey/login/complete` — verify assertion, receive JWT

**Flow B — Email + password + TOTP**

1. `POST /v1/auth/login` — submit email and password; returns `mfa_token` if MFA is required
2. `POST /v1/auth/mfa/verify` — submit TOTP code with `mfa_token`, receive JWT

### Account activation

Invitation links support two activation paths depending on the user's choice of 2FA method.

**Path A — Passkey**

1. `GET /v1/auth/check-activation/<token>` — validate the link, retrieve user info
2. `POST /v1/auth/passkey/setup/begin` — generate a WebAuthn registration challenge
3. `POST /v1/auth/passkey/setup/complete` — store passkey, receive JWT (immediate login)

**Path B — TOTP**

1. `GET /v1/auth/check-activation/<token>` — validate the link
2. `POST /v1/auth/activate` — set password and verify TOTP code, receive JWT

### Token management

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/refresh` | refresh token | Issue a new access token |
| `POST` | `/v1/auth/logout` | bearer | Invalidate the current access token |
| `GET` | `/v1/auth/me` | bearer | Current user profile |

### Session transfer

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/session-transfer/generate` | bearer | Generate a session transfer token |
| `POST` | `/v1/auth/session-transfer/validate` | none | Validate and complete session transfer |

### TOTP (authenticator app)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/mfa/setup` | bearer | Generate a new TOTP secret; returns QR code and raw secret |
| `POST` | `/v1/auth/mfa/setup/confirm` | bearer | Verify code and activate TOTP |
| `POST` | `/v1/auth/mfa/verify-setup` | bearer | Verify code during initial account activation |
| `POST` | `/v1/auth/mfa/verify` | mfa token | Verify TOTP code at login (step 2 of Flow B) |
| `DELETE` | `/v1/auth/mfa` | bearer | Disable TOTP — rejected if no passkey is registered |

### Passkeys (WebAuthn / FIDO2)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/v1/auth/passkey` | bearer | List the user's registered passkeys |
| `POST` | `/v1/auth/passkey/register/begin` | bearer | Start passkey registration (account settings) |
| `POST` | `/v1/auth/passkey/register/complete` | bearer | Finish passkey registration; device name auto-detected from User-Agent if omitted |
| `PATCH` | `/v1/auth/passkey/<id>` | bearer | Rename a passkey |
| `DELETE` | `/v1/auth/passkey/<id>` | bearer | Delete a passkey — rejected if it is the last one and TOTP is disabled |
| `POST` | `/v1/auth/passkey/login/begin` | none | Start discoverable passkey login (Flow A, step 1) |
| `POST` | `/v1/auth/passkey/login/complete` | none | Finish passkey login, receive JWT (Flow A, step 2) |
| `POST` | `/v1/auth/passkey/setup/begin` | none | Start passkey registration during activation (Path A, step 2) |
| `POST` | `/v1/auth/passkey/setup/complete` | none | Finish passkey registration during activation, receive JWT (Path A, step 3) |

### Step-up authentication

Proves the caller re-authenticated moments ago. The returned `step_up_token` is
single-use, valid 5 minutes, and passed as `X-Step-Up-Token` on the guarded
request (currently `DELETE /v1/users/<id>`).

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/step-up/password` | bearer | Re-authenticate with password (and TOTP when enabled) |
| `POST` | `/v1/auth/step-up/passkey/begin` | bearer | Challenge the caller's passkeys |
| `POST` | `/v1/auth/step-up/passkey/complete` | bearer | Verify the assertion and return the proof |

### Password management

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/change-password` | bearer | Change password — requires current password + TOTP code |
| `POST` | `/v1/auth/passkey/change-password/begin` | bearer | Change password via passkey (step 1) — validate current password, generate challenge |
| `POST` | `/v1/auth/passkey/change-password/complete` | bearer | Change password via passkey (step 2) — verify assertion, apply new password |
| `GET` | `/v1/auth/check-reset/<token>` | none | Validate a password reset link; returns `mfa_enabled` and `has_passkeys` |
| `POST` | `/v1/auth/reset-password` | none | Reset password via reset link — requires TOTP code |
| `POST` | `/v1/auth/passkey/reset-password/begin` | none | Reset password via passkey (step 1) — validate reset token, generate challenge |
| `POST` | `/v1/auth/passkey/reset-password/complete` | none | Reset password via passkey (step 2) — verify assertion, apply password, consume link |

---

## Public Endpoints

No authentication required.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/health` | Liveness — the process is up |
| `GET` | `/health/ready` | Readiness — checks DB and Redis; returns 503 when a dependency is down |
| `GET` | `/v1/restaurant` | Active restaurant info |
| `GET` | `/v1/taxonomy` | Dietary tags and certifications catalog |
| `GET` | `/v1/menus/today` | Today's published menu |
| `GET` | `/v1/menus/tomorrow` | Tomorrow's published menu |
| `GET` | `/v1/menus/week` | This week's published menus |
| `GET` | `/v1/events` | Upcoming published events (TV/mobile display) |
| `GET` | `/v1/notifications/vapid-public-key` | VAPID public key for push subscriptions |

### Tenant-aware public API

The tenant comes from the request host (subdomain = organization) and the
restaurant slug, so these endpoints need no identifier in the query string.
They share one rate limit (`PUBLIC_RATE_LIMIT`, 600 requests per minute by
default), sized for a whole campus behind a single address rather than for one
visitor.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/public/org` | Organization behind the host and its sites (bootstrap for the public pages) |
| `GET` | `/v1/public/<site>/today` | Today's published menu |
| `GET` | `/v1/public/<site>/tomorrow` | Tomorrow's published menu |
| `GET` | `/v1/public/<site>/week` | Published menus for a week (`week_offset`) |
| `GET` | `/v1/public/<site>/events` | Published events (`visibility`, `limit`) |
| `GET` | `/v1/public/<site>/closures` | Current and upcoming exceptional closures |
| `GET` | `/v1/public/<site>/restaurant` | Site info and public configuration |
| `POST` | `/v1/public/track` | Count one page view (`page_kind`, plus `site` for a site-scoped page); always 204 |

The legacy `?restaurant_id=` endpoints above are kept for compatibility.

`POST /v1/public/track` answers 204 in every case, including when it declines to
count: telemetry must never degrade a menu page. A beacon claiming an origin this
deployment does not serve is refused, and per-visitor and per-address daily
budgets cap how far one source can move the figures. IP addresses are used
for those budgets only, hashed with a salt that rotates daily and is never
persisted; no address, user agent or per-visitor row reaches PostgreSQL.

**Example — `GET /v1/menus/today`**

```json
{
  "success": true,
  "data": {
    "date": "2026-03-20",
    "published": true,
    "items": [
      {
        "name": "Salade niçoise",
        "category": "starter",
        "dietary_tags": ["gluten-free"],
        "certifications": []
      }
    ],
    "chef_note": "Bon appétit !"
  }
}
```

---

## Menus

Requires `editor` role or above, except the public read routes listed above.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/menus` | List menus (supports filters) |
| `GET` | `/v1/menus/week` | Full week including drafts |
| `GET` | `/v1/menus/<id>` | Menu details |
| `GET` | `/v1/menus/by-date/<date>` | Menu by date (YYYY-MM-DD) |
| `GET` | `/v1/menus/jours-feries/<year>` | French public holidays for a year (no authentication) |
| `GET` | `/v1/menus/vacances-scolaires/<year>` | School holidays for a year, by zone (no authentication) |
| `POST` | `/v1/menus` | Create or update a menu |
| `PUT` | `/v1/menus/<id>` | Update a menu |
| `POST` | `/v1/menus/<id>/publish` | Publish a menu |
| `POST` | `/v1/menus/<id>/unpublish` | Revert a menu to draft |
| `DELETE` | `/v1/menus/<id>` | Delete a menu |
| `POST` | `/v1/menus/week/publish` | Publish the entire week |
| `POST` | `/v1/menus/<id>/images` | Upload image (multipart/form-data) |
| `DELETE` | `/v1/menus/<id>/images/<img_id>` | Delete an image |
| `PUT` | `/v1/menus/<id>/images/reorder` | Reorder images |
| `PUT` | `/v1/menus/<id>/chef-note` | Update chef note |
| `PATCH` | `/v1/menus/<id>/items/<item_id>/stock` | Toggle item out-of-stock status |
| `GET` | `/v1/menus/<id>/substitutions` | Substitution dishes grouped by category |
| `PUT` | `/v1/menus/<id>/substitutions/<category_id>` | Set substitution dishes for a category |

---

## Events

Requires `editor` role or above. Unauthenticated requests to `GET /v1/events` only see published events.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/events` | List events (drafts included when authenticated) |
| `GET` | `/v1/events/storage-status` | S3 storage status |
| `GET` | `/v1/events/<id>` | Event details |
| `POST` | `/v1/events` | Create an event |
| `PUT` | `/v1/events/<id>` | Update an event |
| `DELETE` | `/v1/events/<id>` | Delete an event |
| `POST` | `/v1/events/<id>/publish` | Publish an event |
| `POST` | `/v1/events/<id>/unpublish` | Revert an event to draft |
| `POST` | `/v1/events/<id>/duplicate` | Duplicate an event |
| `POST` | `/v1/events/<id>/images` | Upload image (multipart/form-data) |
| `DELETE` | `/v1/events/<id>/images/<img_id>` | Delete an image |
| `PUT` | `/v1/events/<id>/images/reorder` | Reorder images |

---

## Exceptional Closures

Requires `editor` role or above to write. Unauthenticated requests to
`GET /v1/closures` only see active closures from today onward, split into
`current_closure` and `upcoming_closures`.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/closures` | List closures (filters: `restaurant_id`, `upcoming`, `include_inactive`) |
| `POST` | `/v1/closures` | Create a closure |
| `PUT` | `/v1/closures/<id>` | Update a closure |
| `DELETE` | `/v1/closures/<id>` | Delete a closure |

---

## Dish Catalog

Requires `editor` role or above. Dishes are scoped to the authenticated user's restaurant.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/catalog` | List dishes (filters: `category_id`, `q`, `sort`; optional pagination) |
| `POST` | `/v1/catalog` | Create a dish |
| `GET` | `/v1/catalog/<id>` | Dish details |
| `PUT` | `/v1/catalog/<id>` | Update a dish |
| `DELETE` | `/v1/catalog/<id>` | Delete a dish (409 if used in a menu) |
| `GET` | `/v1/catalog/<id>/stats` | Usage statistics (week/month/semester/year, history) |
| `POST` | `/v1/catalog/<id>/image` | Upload or replace the dish image (multipart/form-data) |
| `DELETE` | `/v1/catalog/<id>/image` | Delete the dish image |

---

## Inbox Notifications

Requires authentication. In-app notification center for business alerts.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/inbox` | List notifications for the current user |
| `GET` | `/v1/inbox/unread-count` | Unread notifications count |
| `GET` | `/v1/inbox/live-alerts` | Alerts computed on the fly (unpublished menu, service without menu, upcoming holiday); nothing is stored |
| `PUT` | `/v1/inbox/<id>/read` | Mark a notification as read |
| `PUT` | `/v1/inbox/read-all` | Mark all notifications as read |
| `DELETE` | `/v1/inbox/<id>` | Delete a notification |
| `GET` | `/v1/inbox/notification-preferences` | Get in-app notification preferences |
| `PUT` | `/v1/inbox/notification-preferences` | Update in-app notification preferences |

---

## Organization

Requires `org_admin`. Cross-site management of the caller's organization;
per-site management stays under the site endpoints.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/org/sites` | Every site of the organization with user count, today's menu status (`published`, `draft`, `missing`, `closed`), upcoming events and last publication |

Opening, renaming or deactivating a site is a billing event and is not exposed
through the API: it is handled by the Mariam team with the `init-restaurant` CLI
command.

---

## Analytics

Requires `admin` or `org_admin`. The scope is derived from the caller: a site
admin gets its own site, an org director every site of its organization. The
`X-Restaurant-Id` header is ignored here — directors narrow the scope with
`site_ids` instead.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/analytics/overview` | Period KPIs with previous-period comparison, daily trend, per-site table |
| `GET` | `/v1/analytics/publications` | Publication rate, punctuality, lead time, completeness, site × day status matrix |
| `GET` | `/v1/analytics/traffic` | Public-page consultation: daily series, per-site table, hour profile, page-kind split |

Shared query parameters:

| Parameter | Description |
|-----------|-------------|
| `period` | `7d`, `30d` (default) or `90d` |
| `start`, `end` | Custom ISO range (`YYYY-MM-DD`), capped at 366 days; overrides `period` |
| `site_ids` | Comma-separated site ids; ids outside the caller's scope are ignored |

Notes:

- A day counts as *open* when the weekday is in the site's `service_days` and no
  exceptional closure covers it; `publication_rate` is measured over those days.
- A menu is *punctual* when `published_at` precedes the service opening time for
  that weekday (`11:30` when the site has no service hours).
- Rates are `null` when their denominator is zero. Traffic and satisfaction keys
  are present but `null` until those features collect data.
- The status matrix covers at most the last 60 days of the period.
- Traffic excludes signage screens (`page_kind` `tv`), which refresh unattended;
  those appear only in the page-kind split. The public root of a multi-site
  organization is counted against the organization and reported separately as
  `totals.org_root_views`.
- Unique visitors are an estimate: a HyperLogLog over hashes of IP and user
  agent, salted with a key that rotates daily and is never persisted. No cookie,
  no identifier stored on the device, nothing per-visitor in the database.

---

## Restaurant and Settings

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/v1/settings` | editor+ | Full restaurant settings |
| `PUT` | `/v1/settings` | admin | Update settings |
| `GET` | `/v1/restaurants` | admin | List the caller's restaurants |
| `GET` | `/v1/restaurant/calendar-settings` | editor+ | Calendar display settings (public holidays, school vacations) |
| `PUT` | `/v1/restaurant/calendar-settings` | editor+ | Update calendar display settings |

---

## Categories

Requires `admin` role.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/settings/categories` | List all categories with subcategories |
| `POST` | `/v1/settings/categories` | Create a category or subcategory |
| `PUT` | `/v1/settings/categories/reorder` | Reorder categories |
| `PUT` | `/v1/settings/categories/<id>` | Update a category |
| `DELETE` | `/v1/settings/categories/<id>` | Delete a category |

---

## Users

Requires `admin` role.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/users` | List users |
| `GET` | `/v1/users/<id>` | User details |
| `PUT` | `/v1/users/<id>` | Update a user |
| `DELETE` | `/v1/users/<id>` | Delete a user (requires `X-Step-Up-Token`) |
| `POST` | `/v1/users/<id>/reset-mfa` | Reset a user's MFA |
| `POST` | `/v1/users/invite` | Create an invitation link |
| `GET` | `/v1/users/invitations` | List pending invitations |

---

## Audit Log

Requires `admin` role with active MFA session.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/audit-logs` | Paginated audit log (filters: `action`, `user_id`, `restaurant_id`, `start_date`, `end_date`) |
| `GET` | `/v1/audit-logs/export` | CSV export (max 10,000 rows) |

---

## Push Notifications

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/v1/notifications/vapid-public-key` | none | VAPID public key |
| `POST` | `/v1/notifications/subscribe` | any | Subscribe or update subscription |
| `GET` | `/v1/notifications/preferences` | any | Get notification preferences |
| `PUT` | `/v1/notifications/preferences` | any | Update notification preferences |
| `DELETE` | `/v1/notifications/unsubscribe` | any | Unsubscribe |
| `POST` | `/v1/notifications/test` | any | Send a test notification |

---

## CSV / Excel Import

Requires `editor` role or above. Three-step flow: upload, preview, confirm.

### Menus (matrix format: columns = categories, rows = dates)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/v1/imports/menus/upload` | Upload and parse file |
| `POST` | `/v1/imports/menus/preview` | Preview with column mapping |
| `POST` | `/v1/imports/menus/confirm` | Execute import |

### Dish catalog (list format: one row per dish)

Imports a flat list of dishes into a single chosen category/subcategory (required).
Tags and certifications are auto-detected from the dish name and any designated
"tag" columns. Dishes whose normalized name already exists in the target category
are skipped (idempotent).

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/v1/imports/catalog/upload` | Upload and parse file; suggests the name column |
| `POST` | `/v1/imports/catalog/preview` | Preview dishes with detected tags and duplicate flags |
| `POST` | `/v1/imports/catalog/confirm` | Create the dishes (duplicates skipped) |

Preview/confirm body: `{ file_id, name_column, tag_columns[], category_id, auto_detect_tags }`.
