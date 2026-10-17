# API Reference

One API serves the Mariam frontend and any other client. A published menu reads without an
account; a session adds what its account may see and do, on the same routes. Every route is
under `/v1`.

**Specification:** `/v1/openapi.json`, browsable at `/v1/docs`. The repository keeps a copy in
`server/openapi.json`, from which the frontend's types are generated; CI fails when either one
drifts from the code.

**Authentication:** a route needs a session unless the specification says otherwise
(`security: []`, no padlock in `/v1/docs`). The session is the `access_token` of a sign-in, sent
as `Authorization: Bearer <token>`.

**Trying it:** in `/v1/docs`, *Try it out* calls the API it is served by. *Authorize* takes the
`access_token` of `POST /v1/auth/login` (then `POST /v1/auth/mfa/verify` for an account with an
authenticator app) and sends it to every route with a padlock.

## Conventions

Routes being reworked follow these rules. Until its domain moves, a section below describes a
route as it is today.

- **Resources.** Plural English nouns in kebab-case, under the organization and the site they
  belong to: `/v1/orgs/{org}/sites/{site}/menus/2026-10-16`. Organizations and sites are named
  by slug, a menu by its date (one per site and day), anything else by an integer id.
- **Visibility.** Without a session, a route shows the published content of an active
  organization and site; a session adds drafts and private fields. What the caller may not
  reach answers `404`, as if it did not exist.
- **Methods.** `GET` reads, `POST` creates, `PUT` replaces, `PATCH` changes some fields,
  `DELETE` removes. An action with side effects is a `POST` to a sub-path:
  `…/menus/2026-10-16/publish`.
- **Dates.** RFC 3339: `2026-10-16`, `2026-10-16T11:30:00+02:00`. A range is
  `?from=…&to=…`, both ends included.
- **Lists.** An object with the entries under `items`. A paginated list takes `page` and
  `per_page`, and links the other pages in the `Link` header (RFC 8288).
- **JSON.** snake_case; an empty field is `null`, never left out.
- **Versions.** `/v1` changes in place until Mariam 1.0.0, then only in compatible ways: a route
  retired after it answers `Deprecation` and `Sunset` (RFC 9745, RFC 8594) for a release first.
- **Rate limits.** A limited route answers `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
  `X-RateLimit-Reset`; a `429` adds `Retry-After`.

## Errors

An error answers `application/problem+json` (RFC 9457):

```json
{
  "title": "Forbidden",
  "status": 403,
  "detail": "Confirmation d’identité requise.",
  "code": "step_up_required"
}
```

- `detail` is a French sentence meant for display.
- `code` is what a program branches on; it never changes once published.
- `type` is left out, which reads as `about:blank`: `code` names the kind of problem.

A body or parameter that fails the route's schema answers `422`, with one entry per faulty
field: `pointer`, an RFC 6901 JSON Pointer into the body, or `parameter` for the query, the
path or a header.

```json
{
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "Certaines valeurs envoyées sont invalides.",
  "code": "validation_failed",
  "errors": [{ "pointer": "/email", "detail": "Adresse e-mail invalide" }]
}
```

Any route may answer these:

| Status | `code` | When |
|---|---|---|
| 401 | `token_missing`, `token_invalid`, `token_expired`, `token_revoked` | No session, or one that no longer holds |
| 401 | `token_restricted`, `authentication_incomplete` | A token issued for one step of a flow, shown as a session |
| 403 | `admin_required`, `editor_required`, `supervisor_required`, `supervisor_read_only` | The account's role does not allow it |
| 403 | `step_up_required` | The route needs a confirmed session |
| 404 | `not_found` | No such route or resource |
| 405 | `method_not_allowed` | The route exists; `Allow` lists its methods |
| 422 | `validation_failed` | The body or a parameter fails the route's schema |
| 429 | `rate_limited` | Too many requests; `Retry-After` gives the seconds to wait |
| 500 | `internal_error` | An unexpected failure, never with its details |

A route whose domain has not moved yet answers its own refusals as `{"error": "…"}`, sometimes
with a `message`, or a flag such as `passkey_only` on `POST /v1/auth/login`.

## Authentication

Mariam supports two login methods: **passkey** (biometric / FIDO2, passwordless) and **email + password + TOTP**. Every account must have at least one active 2FA method (TOTP or at least one passkey) at all times.

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

Both paths start alike: `GET /v1/auth/check-activation/<token>` validates the link and names
the site, the role and the address the inviter suggested, if any. `POST /v1/auth/activate`
then creates the account, without a second factor yet. Its `mfa_setup` carries a TOTP secret
with its QR code, and a `setup_token` valid 15 minutes. The user then picks a second factor.

The invitee supplies the address and the display name; the role and the tenant come from the
link and from nothing else. An address is stored lowercase and must be ASCII. A display name
is 2 to 50 characters: letters, spaces, hyphens, apostrophes and periods. A link serves once:
it is locked while the account is created, and only invitation links are accepted, never a
password-reset link.

**Path A — Passkey**

1. `POST /v1/auth/passkey/setup/begin` — with the `setup_token`, generate a registration challenge
2. `POST /v1/auth/passkey/setup/complete` — store the passkey, receive JWT (immediate login)

**Path B — TOTP**

1. `POST /v1/auth/mfa/verify-setup` — with the `setup_token` and a first code, enable TOTP and
   receive JWT

The `setup_token` enrols a first factor only: once the account has one, both paths answer
`400` and a further factor takes a confirmed session.

### Token management

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/refresh` | refresh token | Issue a new access token |
| `POST` | `/v1/auth/logout` | refresh token | Revoke the refresh token and every access token issued from it |
| `GET` | `/v1/auth/me` | bearer | Current user profile |
| `PATCH` | `/v1/auth/me` | bearer, confirmed | Change the display name or the sign-in address |

A new address ends every other session of the account: the response carries the access and
refresh tokens of the session that replaces the caller's, which is not confirmed. Pending
password-reset links are spent, the previous address is told by email, and an account changes
address twice a day at most. A disabled account has no session: its tokens are refused,
refresh included.

### Session transfer

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/session-transfer/generate` | bearer, confirmed once enrolled | Generate a single-use transfer token, valid 5 minutes or until this session signs out |
| `POST` | `/v1/auth/session-transfer/validate` | none | Exchange the token for a session on another device |

The receiving device has no second factor of its own to confirm with: the session it opens
inherits what is left of the confirmation of the one that handed it over, never more, and can
register its passkey within that time. A transfer token issued before the account's sessions
were ended is refused.

### TOTP (authenticator app)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/mfa/setup` | bearer, confirmed once enrolled | Generate a TOTP secret; returns it with its QR code and an `enrolment_token` |
| `POST` | `/v1/auth/mfa/setup/confirm` | bearer, confirmed once enrolled | With the `enrolment_token` and a first code, enable TOTP or replace its secret |
| `POST` | `/v1/auth/mfa/verify-setup` | setup token | Verify the first code at activation (Path B) |
| `POST` | `/v1/auth/mfa/verify` | mfa token | Verify TOTP code at login (step 2 of Flow B) |
| `DELETE` | `/v1/auth/mfa` | bearer, confirmed | Disable TOTP — rejected if no passkey is registered |

Nothing is stored when a secret is generated: it travels in the `enrolment_token`, valid ten
minutes, and is written once its first code is checked. The secret in use keeps working until
then, and a mistyped code can be tried again with the same token.

### Passkeys (WebAuthn / FIDO2)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/v1/auth/passkey` | bearer | List the user's registered passkeys |
| `POST` | `/v1/auth/passkey/register/begin` | bearer, confirmed once enrolled | Start passkey registration |
| `POST` | `/v1/auth/passkey/register/complete` | bearer, confirmed once enrolled | Finish passkey registration; device name auto-detected from User-Agent if omitted |
| `PATCH` | `/v1/auth/passkey/<id>` | bearer | Rename a passkey |
| `DELETE` | `/v1/auth/passkey/<id>` | bearer, confirmed | Delete a passkey — rejected if it is the last one and TOTP is disabled |
| `POST` | `/v1/auth/passkey/login/begin` | none | Start discoverable passkey login (Flow A, step 1) |
| `POST` | `/v1/auth/passkey/login/complete` | none | Finish passkey login, receive JWT (Flow A, step 2) |
| `POST` | `/v1/auth/passkey/setup/begin` | setup token | Start passkey registration during activation (Path A, step 1) |
| `POST` | `/v1/auth/passkey/setup/complete` | challenge token | Finish passkey registration during activation, receive JWT (Path A, step 2) |

A WebAuthn challenge serves once, whatever the ceremony: a begin route issues it, and the
complete route that reads it spends it.

### Confirmed sessions (step-up)

A sensitive route asks for a **confirmed session**: one whose account has a second factor, and
presented it less than ten minutes ago. A session is confirmed by a sign-in that checked a
second factor, by the end of account activation, and by the routes below. The window is fixed:
neither using the session nor `POST /v1/auth/refresh`, whose token is never confirmed, extends
it.

The confirmation travels in the access token, whose `fresh` claim holds the Unix time it runs
until, or `false`. The routes below return an `access_token` that replaces the caller's; the
refresh token stays. From an unconfirmed session, a guarded route answers `403` with the code
`step_up_required`.

On a route the session authenticates, `401` speaks of the session alone, and is the one
answer to refresh the access token on. A wrong password, code or passkey answers `403`:
refreshing there would trade a confirmed token for one that is not.

Marked *confirmed* in the tables: `POST /v1/users/invite`, `DELETE /v1/users/<id>`,
`POST /v1/users/<id>/reset-mfa`, `POST /v1/users/<id>/reset-password`,
`GET /v1/audit-logs/export`, `PATCH /v1/auth/me`,
`DELETE /v1/auth/passkey/<id>` and `DELETE /v1/auth/mfa`.

Marked *confirmed once enrolled*: both ends of a passkey registration and of a TOTP setup, and
`POST /v1/auth/session-transfer/generate`. An account with no second factor has nothing to
confirm with, and goes through.

A confirmation always attests a second factor: the password route also takes the TOTP code, an
account without TOTP confirms with its passkey (`403` with `passkey_required`), and an account
with neither cannot confirm (`403` with `second_factor_required`).

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/step-up/password` | bearer | Confirm with password and TOTP code; returns a confirmed access token |
| `POST` | `/v1/auth/step-up/passkey/begin` | bearer | Challenge the caller's passkeys |
| `POST` | `/v1/auth/step-up/passkey/complete` | bearer | Verify the assertion; returns a confirmed access token |

### Password management

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/change-password` | bearer | Change password — requires current password + TOTP code; a passkey-only account is refused with `passkey_required` |
| `POST` | `/v1/auth/passkey/change-password/begin` | bearer | Change password via passkey (step 1) — validate current password, generate challenge |
| `POST` | `/v1/auth/passkey/change-password/complete` | bearer | Change password via passkey (step 2) — verify assertion, apply new password |
| `GET` | `/v1/auth/check-reset/<token>` | none | Validate a password reset link; returns `mfa_enabled` and `has_passkeys` |
| `POST` | `/v1/auth/reset-password` | none | Reset password via reset link — requires TOTP code |
| `POST` | `/v1/auth/passkey/reset-password/begin` | none | Reset password via passkey (step 1) — validate reset token, generate challenge |
| `POST` | `/v1/auth/passkey/reset-password/complete` | none | Reset password via passkey (step 2) — verify assertion, apply password, consume link |

---

## Organizations and sites

What anyone may read of an organization and its sites, with no account: published
content of an active organization and site, nothing else. The routes share one rate
limit (`PUBLIC_RATE_LIMIT`, 600 requests per minute by default), sized for a whole
campus behind a single address rather than for one visitor.

- **Any origin** may call the `GET` routes from a browser (`Access-Control-Allow-Origin: *`,
  no credentials). Writes accept the deployment's own origins only.
- **Conditional requests.** A read carries an `ETag` and `Cache-Control: no-cache`; sent
  back in `If-None-Match`, it answers `304` while nothing changed.
- **Menu window.** An anonymous caller sees the menus of the dates in the site's
  `menu_window`: 30 days back and 7 ahead.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/domains/{host}` | The organization a host serves; may be cached five minutes |
| `GET` | `/v1/orgs/{org}` | An organization |
| `GET` | `/v1/orgs/{org}/sites` | Its active sites |
| `GET` | `/v1/orgs/{org}/sites/{site}` | A site: address, contact, hours, vote settings, the labels in use, `menu_window` |
| `GET` | `/v1/orgs/{org}/sites/{site}/menus` | Published menus from `from` to `to`, both included (today to the window's end by default; 62 days at most) |
| `GET` | `/v1/orgs/{org}/sites/{site}/menus/{date}` | The published menu of a day |
| `GET` | `/v1/orgs/{org}/sites/{site}/events` | Published events from today on (`visibility` = `tv` or `mobile`, `limit` up to 20) |
| `GET` | `/v1/orgs/{org}/sites/{site}/closures` | Exceptional closures under way or to come |
| `GET` | `/v1/orgs/{org}/sites/{site}/menus/{date}/vote` | What the device in `Device-Id` may rate today, and its own vote |
| `PUT` | `/v1/orgs/{org}/sites/{site}/menus/{date}/vote` | Rate today's meal: `rating` 1-3, optional `dish_ids` and `fingerprint`; `201` for the first vote, `200` for a change |
| `POST` | `/v1/devices` | A signed device token, for `Device-Id` |
| `POST` | `/v1/orgs/{org}/page-views` | Count one view of a public page (`page_kind`, and `site` for a site's page); always `204` |

```bash
curl https://crous-example.mariam.app/v1/orgs/crous-example/sites/sciences/menus/2026-10-16
```

The vote is anonymous and capped at one per device, organization and day — a
student eats once, wherever they eat; rating another site of the same
organization moves the vote there rather than adding one. A vote may name at
most one dish per votable category, chosen by the site in its settings
(`vote_enabled`, `vote_category_ids`); unset, the first subcategory of the
highlighted category applies. Aggregates are never returned publicly: a caller
only ever sees its own vote. The window opens with the day's
service hours and closes at midnight: a meal is rated once served, and a day
without service hours cannot be rated. Refusals are `403 device_invalid`, `409`
(`voting_disabled`, `voting_not_open`, `vote_already_recorded` for a fingerprint
bound to another device), `422 dish_invalid` and `429 vote_limit_reached`. The
address cap counts new votes only: changing an existing one cannot move the score,
so it is never charged. The device token is dropped from the stored vote the day
after it was cast, once the vote can no longer be edited.

`POST /v1/orgs/{org}/page-views` answers 204 in every case, including when it
declines to count: telemetry must never degrade a menu page. A beacon claiming an
origin this deployment does not serve is refused, and per-visitor and per-address
daily budgets cap how far one source can move the figures. IP addresses are used
for those budgets only, hashed with a salt that rotates daily and is never
persisted; no address, user agent or per-visitor row reaches PostgreSQL.

### Other public endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/health` | Liveness — the process is up |
| `GET` | `/health/ready` | Readiness — checks DB, Redis and a scheduler flush in the last 15 minutes; returns 503 otherwise |
| `GET` | `/v1/taxonomy` | Dietary tags and certifications catalog |
| `GET` | `/v1/notifications/vapid-public-key` | VAPID public key for push subscriptions |
| `GET`/`POST` | `/v1/public/unsubscribe/<token>` | Turn the weekly digest off from the email; POST answers the one-click of mail clients |
| `GET` | `/v1/menus/week`, `/v1/events`, `/v1/closures` | Read anonymously by `?restaurant_id=`, until their domain moves under `/v1/orgs` |

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
| `POST` | `/v1/menus/week/publish` | Publish the drafts of a week (`week_offset`, current week by default) |
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
| `GET` | `/v1/catalog` | List dishes (`q`, `category_ids`, `tag_ids`, `certification_ids`, `period`, `sort`, `order`; optional pagination) |
| `POST` | `/v1/catalog` | Create a dish |
| `GET` | `/v1/catalog/<id>` | Dish details |
| `PUT` | `/v1/catalog/<id>` | Update a dish |
| `DELETE` | `/v1/catalog/<id>` | Delete a dish (409 if used in a menu) |
| `GET` | `/v1/catalog/<id>/stats` | Usage windows, weekly history and satisfaction |
| `GET` | `/v1/catalog/stats?ids=` | The same for up to five dishes, for the comparison view |
| `POST` | `/v1/catalog/bulk/delete` | Delete several dishes, keeping those served in a menu |
| `POST` | `/v1/catalog/bulk/category` | Attach several dishes to one leaf category |
| `POST` | `/v1/catalog/bulk/labels` | Add or remove dietary tags and certifications on several dishes |
| `GET` | `/v1/catalog/export` | Export dishes as CSV: `ids=` for a selection, the list filters otherwise |
| `POST` | `/v1/catalog/<id>/image` | Upload or replace the dish image (multipart/form-data) |
| `DELETE` | `/v1/catalog/<id>/image` | Delete the dish image |

Notes:

- `sort` accepts `usage` (default), `name`, `recent` and `score`; unrated dishes
  sort last rather than at the bottom of the scale. Every dish carries `votes`
  and `score`, the latter `null` under five votes.
- `order` is `asc` or `desc`. Left out, a name reads A to Z and a measure reads
  best-first.
- `period` bounds `usage_count`, `votes` and `score` together: `all` (default),
  `7d`, `30d`, `90d` or `12m`. `tag_ids` and `certification_ids` are
  comma-separated and conjunctive: a dish must carry every one of them.
  `category_ids` is disjunctive, a dish belonging to a single category.
- `q` tolerates a typo: case, accents and ligatures are folded, then each word of
  the query must appear in the name or sit within one edit of a word of it (two
  beyond seven letters). Words of three letters or fewer must match exactly.
- `new_only=1` keeps the dishes whose first service ever falls inside `period`;
  with `period=all` there is no window and the filter is ignored.
- The export writes `nom;categorie;sous_categorie;labels;certifications`, labels
  and certifications by their display name. The import reads that file back, so
  exporting a catalog and importing it into an empty one restores it; images are
  the exception, being out of reach of a CSV.
- A dish requires a category, and that category must be a leaf: one carrying
  subcategories is refused. Creation without a category is refused, and an update
  may not set it back to null.
- Two dishes of the same name may not share a category. Creation and update
  answer 409 with `dish_id` and `dish_name`, naming the dish already there;
  `POST /v1/catalog/bulk/category` keeps such a dish where it is and lists it
  under `kept`.
- `POST /v1/catalog/bulk/delete` answers `{deleted, kept}`: a dish still served in
  a menu is kept, with its name and usage count. The other bulk routes answer the
  ids they changed. All of them are audited and require the `editor` role.
- The `satisfaction` block of a dish's stats reports why it carries no rating:
  `enabled` (the site collects votes), `votable` (the dish's category is offered
  to voters) and `votes`. It also carries the site's `icon_preset` so the
  breakdown is drawn with the icons students saw.

---

## Inbox Notifications

Requires authentication. In-app alerts, computed on the fly: nothing is stored.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/inbox/live-alerts` | Active alerts on the sites the caller may read |
| `GET` | `/v1/inbox/notification-preferences` | Get the caller's alert and email preferences |
| `PUT` | `/v1/inbox/notification-preferences` | Update them |

Notes:

- `live-alerts` is scoped by role: a site account sees its own site, a supervisor
  every site of its organization. Beyond one site each rule answers as one entry
  carrying `site_ids` and `site_names`, rather than one entry per site.
- Each rule names the accounts it is for. A site team gets: unpublished menu,
  service open without a menu, tomorrow's menu missing, traffic drop, low
  satisfaction, vote anomaly and upcoming holiday. A supervisor gets: service open
  without a menu, traffic drop, low satisfaction, vote anomaly and inactive site.
  Each is switched by its own preference key, all on by default; the thresholds
  are environment variables (`ALERT_*`).
- `PUT notification-preferences` takes the keys to change and validates them:
  switches are booleans, `holiday_alert_days_before` runs from 1 to 30. Anything
  else answers `422` and stores nothing.
- `weekly_digest` subscribes the caller to the email, `digest_day` (Monday = 0)
  and `digest_hour` (6 to 21, Europe/Paris) say when it lands. Off by default,
  Monday 08:00. Whatever the slot, the summary covers the last complete week,
  Monday to Sunday.

---

## Organization

Requires `org_admin`. Cross-site management of the caller's organization;
per-site management stays under the site endpoints.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/org/sites` | Every site of the organization with user count, today's menu status (`published`, `draft`, `missing`, `closed`), upcoming events and last publication |
| `GET` | `/v1/org/catalog` | Dishes served across the organization, pooled by normalised name (`q`, `sort`, `order`, `period`, `page`, `per_page`) |
| `GET` | `/v1/org/catalog/group?name=` | One pooled dish: the organization-wide aggregate and each site's figures |

Opening, renaming or deactivating a site is a billing event and is not exposed
through the API: it is handled by the Mariam team with the `init-restaurant` CLI
command.

Catalogue notes:

- Dishes are grouped by `lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))`.
  Accents are not folded, so two spellings differing only by an accent stay two
  entries. `display_name` is the most frequent spelling in the group.
- `sort` accepts `usage` (default), `sites`, `name`, `photos` and `score`, with
  the same `order` and `period` semantics as the site catalogue.
- `score` is `null` under five votes.
- The pool is read-only: sites own their dishes, and nothing here writes to
  them.

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
| `GET` | `/v1/analytics/satisfaction` | Menu ratings: distribution, daily score, per-site comparison and dish ranking (`min_votes`, default 10) |
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
- Satisfaction carries a `settings` block describing what the sites in scope
  currently offer, so the figures can be read against it: `site_count`,
  `sites_with_vote`, `icon_preset` (`null` when the sites disagree) and
  `dish_question` (resolved for a single site only, `null` otherwise).

---

## Restaurant and Settings

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/v1/settings` | editor+ | Full restaurant settings |
| `PUT` | `/v1/settings` | admin | Update settings; `name` holds 1 to 50 characters and no web or email address |
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

Notes:

- Only a leaf category carries dishes. Creating a subcategory under a category
  that holds dishes answers 409 with `stranded_dishes`; repeat the call with
  `move_dishes: true` to move them into the new subcategory.
- Deletion answers 409 with `attached_dishes` when the category or one of its
  descendants still holds dishes.

---

## Users

Requires `admin` role.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/users` | List users |
| `GET` | `/v1/users/<id>` | User details |
| `PUT` | `/v1/users/<id>` | Update a user's role, site or status; suspending it ends its sessions |
| `DELETE` | `/v1/users/<id>` | Delete a user (requires a confirmed session) |
| `POST` | `/v1/users/<id>/reset-mfa` | Remove a user's TOTP and passkeys and end their sessions (requires a confirmed session) |
| `POST` | `/v1/users/<id>/reset-password` | Email a user a password reset link, returned only when it could not be emailed (requires a confirmed session) |
| `POST` | `/v1/users/invite` | Create an invitation link (requires a confirmed session); `send_email` also emails it to `email`, and the invitation's `emailed` tells whether it left; `email` is optional and only pre-fills the activation form |
| `GET` | `/v1/users/invitations` | List pending invitations, each with whether it was emailed |
| `DELETE` | `/v1/users/invitations/<id>` | Revoke a pending invitation |

Invitations follow the same boundary as accounts: a supervisor lists and revokes supervisor
invitations, a site admin those of its site. The reset leaves the account active: it signs in
with its password and enrols a new method. It is refused on the caller's own account and on
the rescue account.

The two routes below are the exception: any authenticated user reads and writes
its own.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/users/me/ui-preferences` | Interface state carried by the account: the guided tours already seen |
| `PUT` | `/v1/users/me/ui-preferences` | Update those flags; unknown keys are ignored |

---

## Audit Log

Requires the `admin` role and an account carrying a second factor, code or passkey.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/audit-logs` | Paginated audit log (filters: `action`, `user_id`, `restaurant_id`, `start_date`, `end_date`) |
| `GET` | `/v1/audit-logs/export` | CSV export (max 10,000 rows; requires a confirmed session) |

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

Notes:

- Every route but the first takes the subscription's `endpoint`, which must be an `https://`
  address on a browser push service (Google, Mozilla, Apple, Microsoft). `subscribe` and `test`
  also take its two keys, as `PushSubscription.toJSON()` returns them. Anything else answers
  `422`: it is neither stored nor contacted.
- `subscribe` answers `404` to a `restaurant_id` that is unknown or inactive.

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

A file carrying the export columns is recognised at upload (`is_catalog_export`),
which returns the category paths it contains and those the site already has.
Preview and confirm then take `category_map` — each path to a category id or to
`"create"` — instead of a name column and a single category, and read categories,
labels and certifications from the file itself. Creating a subcategory under a
category that already holds dishes is refused (409).
