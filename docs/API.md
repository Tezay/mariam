# API Reference

One API serves the Mariam frontend and any other client. A published menu reads without an
account; a session adds what its account may see and do, on the same routes. Every route is
under `/v1`.

**Specification:** `/v1/openapi.json`, browsable at `/v1/docs`. The repository keeps a copy in
`server/openapi.json`, from which the frontend's types are generated; CI fails when either one
drifts from the code.

**Authentication:** a route needs a session unless the specification says otherwise
(`security: []`, no padlock in `/v1/docs`). A browser holds its session in the `HttpOnly`
cookies a sign-in sets, and signs each write with a CSRF token (see Session cookies). Any other
client sends the access token as `Authorization: Bearer <token>`, which needs no CSRF token.

**Trying it:** in `/v1/docs`, *Try it out* calls the API it is served by. *Authorize* takes the
access token, the value of the `__Host-Http-access` cookie that `POST /v1/auth/login` sets
(then `POST /v1/auth/mfa/verify` for an account with an authenticator app), as the browser's
developer tools show it, and sends it to every route with a padlock. A route without one is open to
anyone. A padlock shown closed before any token is given marks a route open to anyone where a
session sees more (a site's drafts); Swagger UI counts its anonymous option as already met.

## Conventions

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
  `per_page`, counts every entry in `total_count`, and links the other pages in the `Link`
  header (RFC 8288).
- **JSON.** snake_case; an empty field is `null`, never left out. A field reserved to a
  site's editors is left out for anyone else, and the specification says so.
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
| 403 | `admin_required`, `supervisor_required`, `supervisor_read_only` | The account's role does not allow it |
| 403 | `step_up_required` | The route needs a confirmed session |
| 404 | `not_found` | No such route or resource |
| 405 | `method_not_allowed` | The route exists; `Allow` lists its methods |
| 422 | `validation_failed` | The body or a parameter fails the route's schema |
| 429 | `rate_limited` | Too many requests; `Retry-After` gives the seconds to wait |
| 500 | `internal_error` | An unexpected failure, never with its details |

The routes of the account and of its ceremonies also list, in the specification, each
refusal they answer and its codes.

## Authentication

An account signs in with a **passkey**, or with its **email and password** followed by the
code of its authenticator app (TOTP). It keeps at least one second factor, TOTP or a passkey,
at all times. The routes under `/v1/auth` are ceremonies: each step returns what the next one
needs. What the account itself holds lives under `/v1/user` (see The signed-in account).

| Token | Lifetime |
|-------|----------|
| Access token | 30 minutes |
| Refresh token | 7 days |

### Signing in

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/login` | none | Email and password; opens the session, or returns an `mfa_token` when the account has TOTP |
| `POST` | `/v1/auth/mfa/verify` | `mfa_token` | `{mfa_token, code}`; opens the session |
| `POST` | `/v1/auth/passkey/login/begin` | none | A discoverable WebAuthn challenge |
| `POST` | `/v1/auth/passkey/login/complete` | challenge | The assertion; the passkey names the account |
| `POST` | `/v1/auth/refresh` | refresh token | `204`; a new access token, never confirmed |
| `POST` | `/v1/auth/logout` | refresh token | `204`; revokes the refresh token and every access token issued from it, and clears the cookies |

A session answers `{user, confirmed_for}`: `user` is the account as `GET /v1/user` reads it,
`confirmed_for` the seconds the session stays confirmed, `0` when it is not. The tokens come in
cookies. The `mfa_token` serves once, within ten minutes.

- A wrong address or password answers `401 credentials_invalid`, an unknown address alike.
- An account protected by a passkey only answers `403 passkey_only` to the password route.
- A disabled account answers `403 account_disabled`, once its password or passkey checked. It
  has no session either: its tokens are refused, refresh included.

### Session cookies

| Cookie | Holds | Attributes |
|--------|-------|------------|
| `__Host-Http-access` | The access token | `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, for its 30 minutes |
| `__Host-Http-refresh` | The refresh token | The same, for its 7 days |
| `__Host-csrf-access`, `__Host-csrf-refresh` | The CSRF token of each | Readable by the page |

A write the cookies authenticate carries `X-CSRF-TOKEN`: the value of `__Host-csrf-access`, or
of `__Host-csrf-refresh` for `/v1/auth/refresh` and `/v1/auth/logout`. Without it, or with
another, it answers `403 csrf_invalid`. A refused refresh clears the cookies.

Each host has a session of its own, and the pages reach the API on their own site (`/v1` by
default): a browser keeps no cookie for an API on another one.

### Codes

A TOTP code is accepted one 30-second step either side of its own, and once: replayed, it
answers `code_used` (RFC 6238, § 5.2). An account takes ten wrong codes an hour, wherever they
come from. Past that, every code it sends answers `429 too_many_attempts` until the hour ends,
with `Retry-After`. A wrong code answers `401 code_invalid` before a session exists, `403`
within one.

### Account activation

`GET /v1/auth/check-activation/<token>` describes an invitation link: the role, the site or the
organization, and the address the inviter suggested, if any. `POST /v1/auth/activate` creates
the account without a second factor, and answers `201` with `mfa_setup`: a TOTP secret, its QR
code, and a `setup_token` valid 15 minutes. The token carries the secret, encrypted; nothing is
stored before its first code is checked. The user then picks a second factor.

The invitee supplies the address and the display name; the role and the tenant come from the
link and from nothing else. An address is stored lowercase and must be ASCII. A display name
is 2 to 50 characters: letters, spaces, hyphens, apostrophes and periods. A link serves once:
it is locked while the account is created, and only invitation links are accepted, never a
password-reset link. An unknown link answers `404 link_unknown`, a spent, revoked or expired
one `410 link_expired`.

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/mfa/verify-setup` | `setup_token` | `{setup_token, code}`; enables TOTP and opens the session |
| `POST` | `/v1/auth/passkey/setup/begin` | `setup_token` | A registration challenge, in place of TOTP |
| `POST` | `/v1/auth/passkey/setup/complete` | challenge | Stores the passkey and opens the session |

The `setup_token` names the account and enrols a first factor only. Once the account has one,
these routes answer `409 second_factor_present`, and a further factor takes a confirmed
session. An expired or forged token, or one issued before the account's sessions were ended,
answers `401 setup_token_invalid`.

### Password reset

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/v1/auth/check-reset/<token>` | none | The link's address, and the second factor the reset asks for (`mfa_enabled`, `has_passkeys`) |
| `POST` | `/v1/auth/reset-password` | none | `{token, new_password, code}`; `204` |
| `POST` | `/v1/auth/passkey/reset-password/begin` | none | `{reset_token}`; challenges the account's passkeys |
| `POST` | `/v1/auth/passkey/reset-password/complete` | challenge | `{reset_token, challenge_token, credential, new_password}`; `204` |

A reset spends its link and ends every session of the account. An account without TOTP resets
with its passkey (`409 passkey_required` on the code route); one with neither cannot
(`409 second_factor_required`). A link answers as an invitation does: `404 link_unknown`,
`410 link_expired`.

### Session transfer

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/session-transfer/generate` | session, confirmed once enrolled | Generate a single-use transfer token, valid 5 minutes or until this session signs out |
| `POST` | `/v1/auth/session-transfer/validate` | none | Exchange the token for a session on another device |

The receiving device has no second factor of its own to confirm with: the session it opens
inherits what is left of the confirmation of the one that handed it over, never more, and can
register its passkey within that time. A transfer token issued before the account's sessions
were ended answers `401 transfer_invalid`, a spent one `401 transfer_used`.

### Passkeys

A WebAuthn challenge serves once, whatever the ceremony: a route issues it with a
`challenge_token`, and the route that reads it spends it. A challenge read by another ceremony
or another account answers `challenge_invalid`. A refused passkey answers `passkey_refused`
with a fixed sentence: the library's reason never reaches the caller.

### Confirmed sessions (step-up)

A sensitive route asks for a **confirmed session**: one whose account has a second factor, and
presented it less than ten minutes ago. A session is confirmed by a sign-in that checked a
second factor, by the end of account activation, and by the routes below. The window is fixed:
neither using the session nor `POST /v1/auth/refresh`, whose token is never confirmed, extends
it.

The confirmation travels in the access token, whose `fresh` claim holds the Unix time it runs
until, or `false`. The routes below set an access cookie that replaces the caller's and answer
`{confirmed_for}`; the refresh token stays. From an unconfirmed session, a guarded route answers `403` with the code
`step_up_required`.

On a route the session authenticates, `401` speaks of the session alone, and is the one
answer to refresh the access token on. A wrong password, code or passkey answers `403`:
refreshing there would trade a confirmed token for one that is not.

Marked *confirmed* in the tables: creating an invitation, and deleting an account, removing
its second factors or sending it a reset link (see Members and invitations); exporting the
audit log; `PATCH /v1/user`, `DELETE /v1/user/passkeys/{passkey_id}` and
`DELETE /v1/user/totp`.

Marked *confirmed once enrolled*: both steps of adding a passkey and of setting up TOTP under
`/v1/user`, and `POST /v1/auth/session-transfer/generate`. An account with no second factor
has nothing to confirm with, and goes through.

A confirmation always attests a second factor: the password route also takes the TOTP code, an
account without TOTP confirms with its passkey (`403 passkey_required`), and an account with
neither cannot confirm (`403 second_factor_required`).

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/auth/step-up/password` | session | `{password, code}`; a confirmed access token |
| `POST` | `/v1/auth/step-up/passkey/begin` | session | Challenge the caller's passkeys (`409 no_passkey` without one) |
| `POST` | `/v1/auth/step-up/passkey/complete` | session | Verify the assertion; a confirmed access token |

---

## The signed-in account

`U` = `/v1/user`. Every route reads or changes the caller's own account.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `U` | The account; `site` and `organization` as `{slug, name}`, `null` when it has none |
| `PATCH` | `U` | Display name or sign-in address (*confirmed*); the account |
| `GET`, `PATCH` | `U/ui-preferences` | Interface state carried by the account: the guided tours already seen |
| `GET`, `PATCH` | `U/notification-preferences` | Which alerts the account sees, and when its weekly email lands |
| `GET` | `U/alerts` | The account's active alerts, computed now |
| `GET` | `U/passkeys` | The account's passkeys, with `rp_id` and the account as they know it (`user`) |
| `POST` | `U/passkeys/options` | Creation options and a `challenge_token` (*confirmed once enrolled*); `this_device` for this device's own authenticator |
| `POST` | `U/passkeys` | `201`, the passkey the browser created from them (*confirmed once enrolled*) |
| `PATCH` | `U/passkeys/{passkey_id}` | Rename a passkey |
| `DELETE` | `U/passkeys/{passkey_id}` | `204` (*confirmed*) |
| `POST` | `U/totp/enrolment` | A new secret, its QR code and an `enrolment_token` (*confirmed once enrolled*) |
| `PUT` | `U/totp` | `{enrolment_token, code}`: enables TOTP or replaces its secret; the account (*confirmed once enrolled*) |
| `DELETE` | `U/totp` | `204` (*confirmed*) |
| `POST` | `U/password/options` | `{current_password}`; challenges the account's passkeys |
| `PUT` | `U/password` | `204`; ends every session of the account, this one included |

A site's team reads its organization through its site. The account carries no id of either.

**Passkeys.** Each one carries its `credential_id` (base64url) and `provider`, the password manager
its authenticator names, or `null`. Unattested, that name serves display only. `user.id` is the
account's random WebAuthn handle, `null` until it first asks for a passkey: with `rp_id` and the
list, it is what a browser's Signal API takes.

**Address.** A new address ends every other session of the account: the response sets the
cookies of the session that replaces the caller's, which is not confirmed.
Pending password-reset links are spent, and the previous address is told by email. An account
changes address twice a day at most (`429 email_change_limit`, with `Retry-After`); the rescue
account never does (`403 rescue_account`).

**Second factors.** The account keeps one at all times: removing the last passkey while TOTP
is off, or TOTP without a passkey, answers `409 last_second_factor`. A passkey is named after
the device when `device_name` is left out; a name is 1 to 100 characters. A TOTP secret is
stored only once a first code checks it: until then it travels in the `enrolment_token`, valid
ten minutes (`410 enrolment_expired` after), and the secret in use keeps working. A mistyped
code can be tried again with the same token.

**Password.** `PUT U/password` takes the new password and one proof: `current_password`, with
`code` when the account has TOTP, or the `challenge_token` and `credential` of
`U/password/options`. A body that mixes or misses them answers `422`. The password alone never
stands for the second factor an account has: an account protected by a passkey only answers
`403 passkey_required` to the first proof.

**Alerts.** In-app alerts, computed on the fly: nothing is stored.

- They cover the sites the account may read: its own for a site's team, every site of its
  organization for a supervisor. Beyond one site, each rule answers as one entry naming its
  `sites` (`slug` and `name`), rather than one entry per site.
- Each rule names the accounts it is for. A site team gets: unpublished menu, service open
  without a menu, tomorrow's menu missing, traffic drop, low satisfaction, vote anomaly and
  upcoming holiday. A supervisor gets: service open without a menu, traffic drop, low
  satisfaction, vote anomaly and inactive site. Each is switched by its own preference key,
  all on by default; the thresholds are environment variables (`ALERT_*`).
- `PATCH U/notification-preferences` takes the keys to change and validates them: switches
  are booleans, `holiday_alert_days_before` runs from 1 to 30. Anything else answers `422`
  and stores nothing.
- `weekly_digest` subscribes the caller to the email, `digest_day` (Monday = 0) and
  `digest_hour` (6 to 21, Europe/Paris) say when it lands. Off by default, Monday 08:00.
  Whatever the slot, the summary covers the last complete week, Monday to Sunday.
- The email's own link opens `/unsubscribe/<token>` on the frontend, which asks for a click,
  so that a scanner following links unsubscribes no one. Its `List-Unsubscribe` header names
  `POST /v1/weekly-emails/{token}/unsubscribe`, the one-click target of mail clients
  (RFC 8058), which turns `weekly_digest` off; an unknown token answers `404 link_invalid`.

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
  `menu_window`, which the site sets: 30 days back and 7 ahead by default.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/domains/{host}` | The organization a host serves; may be cached five minutes |
| `GET` | `/v1/orgs/{org}` | An organization |
| `GET` | `/v1/orgs/{org}/sites` | Its active sites; its supervisors read them all, with their fields (see Organization) |
| `GET` | `/v1/orgs/{org}/sites/{site}` | A site: its page (tagline, presentation, logo, cover, gallery, access, services, links), address, contact, hours, vote settings, the labels in use, `menu_window` |
| `GET` | `/v1/orgs/{org}/sites/{site}/menus` | Published menus from `from` to `to`, both included (today to the window's end by default; 62 days at most) |
| `GET` | `/v1/orgs/{org}/sites/{site}/menus/{date}` | The published menu of a day |
| `GET` | `/v1/orgs/{org}/sites/{site}/news` | Published news, eight at most (`sort`, `from`, `to`, `visibility` = `tv` or `mobile`); `{news_id}` for one |
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
| `GET` | `/v1/push-key` | VAPID public key for push subscriptions |
| `GET` | `/v1/holidays/{year}` | French public holidays of a year, from calendrier.api.gouv.fr |
| `POST` | `/v1/weekly-emails/{token}/unsubscribe` | Turn the weekly email off; the one-click target of mail clients (see The signed-in account) |

---

## Menus

A site's menus live at the addresses above, one per day. The same `GET` routes serve a
session: an editor of the site (a supervisor included) reads its drafts too, with no window,
and receives the editors' fields: `status`, `published_at` and `updated_at`. Writes require
the `editor` role on the site; a supervisor reads but never writes.
Below, `S` stands for `/v1/orgs/{org}/sites/{site}`.

| Method | Route | Description |
|--------|-------|-------------|
| `PUT` | `S/menus/{date}` | Create or replace the menu of a day: `items` and `chef_note` (300 characters); `201` the first time, `200` after |
| `PATCH` | `S/menus/{date}` | Change the `chef_note` |
| `DELETE` | `S/menus/{date}` | Delete the menu and its items |
| `POST` | `S/menus/{date}/publish` | Publish; `409 menu_empty` without items |
| `POST` | `S/menus/{date}/unpublish` | Back to draft; `409 menu_not_published` for a draft |
| `PATCH` | `S/menus/{date}/items/{item_id}` | Mark an item out of stock (`is_out_of_stock`) |
| `PUT` | `S/menus/{date}/substitutions/{category_id}` | The dishes offered when one of the category runs out: `dish_ids`, three at most, from the site's catalog |

A menu is one tree, `categories`, each holding its `items` or its `subcategories`. An item of
`PUT` keeps its `id` when sent with it, and the items left out are removed. A new item names
a dish by `dish_id`, or by `name`, which reuses the dish of that name in the category or adds
it to the catalog. Every item goes to a category of the site that has no subcategories
(`422 category_invalid`). A menu saved without items goes back to draft.

```bash
curl -X PUT https://crous-example.mariam.app/v1/orgs/crous-example/sites/sciences/menus/2026-10-19 \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"items": [{"category_id": 3, "name": "Poulet rôti"}], "chef_note": null}'
```

### Holidays

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/holidays/{year}` | Public holidays, open to anyone |
| `GET` | `/v1/school-holidays/{year}` | School holidays of `zone` (`A`, `B` or `C`) over the school years touching `year`; `editor` role |

Years 2020 to 2040; another answers `404 year_out_of_range`, and a calendar that does not
answer `502 holidays_unavailable`. Both are cached for a day.

---

## News

A news item may carry a date: a dated one also shows in the calendar and the TV banner, and its
subscribers are reminded of it. The `GET` routes serve a session too: an editor of the site
reads its drafts and the editors' fields (`status`, `visibility`, `created_at`, `updated_at`,
the `id` of each image). Writes require the `editor` role on the site; a supervisor reads but
never writes.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `S/news?sort=&from=&to=&visibility=&limit=` | `sort=published` (default): pinned first, then the latest published, drafts first for an editor; `sort=date`: the dated items, soonest first. `from` and `to` keep the dated items. Anyone reads the published ones, eight at most |
| `GET` | `S/news/{news_id}` | One item: published for anyone, any for the site's editors |
| `POST` | `S/news` | Add an item (`title`, optional `date`, `summary`, `description`, `color` `#RRGGBB`, `pinned`, `status`, `visibility`); `201` and `Location` |
| `PATCH` | `S/news/{news_id}` | Change an item; a new `date` sends its reminders again, `null` removes it |
| `DELETE` | `S/news/{news_id}` | Delete it and its images |
| `POST` | `S/news/{news_id}/publish` | Publish; `published_at` tells when |
| `POST` | `S/news/{news_id}/unpublish` | Back to draft, `published_at` cleared; `409 news_not_published` for a draft |
| `POST` | `S/news/{news_id}/duplicate` | Copy as an unpinned draft, without images, a week later if dated unless `date` says otherwise; `201` and `Location` |
| `POST` | `S/news/{news_id}/images` | Add an image (multipart `file`), six per item |
| `PUT` | `S/news/{news_id}/images/order` | New order of the images: every `image_ids`, once |
| `DELETE` | `S/news/{news_id}/images/{image_id}` | Remove an image |

A description is HTML, sanitised when written and again when read. Without storage
configured, an image answers `503 storage_unavailable`.

---

## Exceptional Closures

`GET S/closures?from=&to=` lists the closures that overlap the range, soonest first. Anyone
gets those under way or to come; an editor of the site reads any range, past ones without
`from`. Writes require the `editor` role on the site.

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `S/closures` | Close the site from `start_date` to `end_date`, both included, with an optional `reason` and `description` |
| `PATCH` | `S/closures/{closure_id}` | Change a closure; a new `start_date` sends its reminders again |
| `DELETE` | `S/closures/{closure_id}` | Delete it |

---

## Dishes

A site's catalog. Reading requires a session on the site, writing the `editor` role.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `S/dishes` | One page of dishes (`page`, `per_page` up to 200, 50 by default), filtered by `q`, `category_ids`, `tag_ids`, `certification_ids`, `period`, `new_only` and sorted by `sort`, `order` |
| `POST` | `S/dishes` | Add a dish; `201` with its address in `Location` |
| `GET` | `S/dishes/{dish_id}` | A dish |
| `PATCH` | `S/dishes/{dish_id}` | Change its name, category or labels |
| `DELETE` | `S/dishes/{dish_id}` | Delete it; `409 dish_in_use` while a menu serves it |
| `GET` | `S/dishes/{dish_id}/stats` | Use by period, weekly history and satisfaction |
| `GET` | `S/dishes/stats?ids=` | The same for up to five dishes, to compare them |
| `POST` | `S/dishes/batch-delete` | Delete `ids`, keeping those a menu has served |
| `POST` | `S/dishes/batch-update` | Move `ids` to `category_id`, add or remove labels and certifications |
| `GET` | `S/dishes/export` | CSV of `ids`, or of what the filters select |
| `PUT` | `S/dishes/{dish_id}/image` | Set or replace the photo (multipart `file`) |
| `DELETE` | `S/dishes/{dish_id}/image` | Remove the photo |

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
- `new_only=true` keeps the dishes whose first service ever falls inside `period`;
  with `period=all` there is no window and the filter is ignored.
- The export writes `nom;categorie;sous_categorie;labels;certifications`, labels
  and certifications by their display name. The import reads that file back, so
  exporting a catalog and importing it into an empty one restores it; images are
  the exception, being out of reach of a CSV.
- A dish requires a category without subcategories (`422 category_invalid`).
- Two dishes of the same name may not share a category. Creation and update
  answer `409 dish_duplicate` with `dish_id` and `dish_name`, naming the dish
  already there; `batch-update` leaves such a dish as it was and lists it under
  `kept`.
- `batch-delete` answers `{deleted, kept}`: a dish still served in a menu is kept,
  with its name and usage count. `batch-update` answers `{updated, kept}`.
- The `satisfaction` block of a dish's stats reports why it carries no rating:
  `enabled` (the site collects votes), `votable` (the dish's category is offered
  to voters) and `votes`. It also carries the site's `icon_preset` so the
  breakdown is drawn with the icons students saw.

---

## Organization

Requires `org_admin` and the caller's own organization; another answers
`404 org_not_found`. Below, `O` stands for `/v1/orgs/{org}`.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `O/sites` | Every site, closed ones included, with the supervisors' fields: `is_active`, `member_count`, `today_menu_status` (`published`, `draft`, `missing`, `closed`), `upcoming_events`, `last_published_at` |
| `GET` | `O/dish-groups` | Dishes served across the organization, grouped by normalised name (`q`, `sort`, `order`, `period`); paginated with `page`, `per_page` (24 by default) and `Link` |
| `GET` | `O/dish-groups/{name}` | One group, by its `normalized_name` encoded in the path: the organization-wide figures and each site's; `404 dish_group_not_found` |

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

One site's reports under `S`, for its admin, its editors and the organization's supervisors;
the organization's under `O`, for its supervisors.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `S/analytics/overview`, `O/analytics/overview` | Period KPIs with previous-period comparison, daily trend, per-site table |
| `GET` | `S/analytics/publications`, `O/analytics/publications` | Publication rate, punctuality, lead time, completeness, site × day status matrix |
| `GET` | `S/analytics/satisfaction`, `O/analytics/satisfaction` | Menu ratings: distribution, daily score, per-site comparison and dish ranking (`min_votes`, default 10) |
| `GET` | `S/analytics/traffic`, `O/analytics/traffic` | Public-page consultation: daily series, per-site table, hour profile, page-kind split, services said full |

Shared query parameters:

| Parameter | Description |
|-----------|-------------|
| `period` | `1d`, `7d`, `30d` (default) or `90d`, up to today |
| `from`, `to` | A range in place of `period` (`YYYY-MM-DD`), both included, 366 days at most; a `to` after today reads as today |
| `sites` | `O` only: comma-separated slugs; those outside the organization are left out |

An inverted or too long range answers `422`. Each per-site row names its site by `site`
(its slug) and `name`.

Notes:

- A day counts as *open* when the weekday is in the site's `service_days` and no
  exceptional closure covers it; `publication_rate` is measured over those days.
- A menu is *punctual* when `published_at` precedes the service opening time for
  that weekday (`11:30` when the site has no service hours).
- Rates are `null` when their denominator is zero.
- The status matrix covers the last 30 days, whatever the period.
- Traffic excludes signage screens (`page_kind` `tv`), which refresh unattended;
  those appear only in the page-kind split. The public root of a multi-site
  organization is counted against the organization and reported separately as
  `totals.org_root_views`, under `O` only.
- `capacity_reached` counts the services a team said full over the period, and their sites;
  `usual_time` is the median hour they filled, in Paris time to five minutes, `null` without one.
- Unique visitors are an estimate: a HyperLogLog over hashes of IP and user
  agent, salted with a key that rotates daily and is never persisted. No cookie,
  no identifier stored on the device, nothing per-visitor in the database.
- Satisfaction carries a `settings` block describing what the sites in scope
  currently offer, so the figures can be read against it: `site_count`,
  `sites_with_vote`, `icon_preset` (`null` when the sites disagree) and
  `dish_question` (resolved for a single site only, `null` otherwise).

---

## Site settings

A site's settings are its page: `GET S` serves the public fields to anyone. The site's
editors also read `vote_category_ids`, `menu_days_ahead`, `menu_days_back` and the `id` of
each photo. Changing them requires the `admin` role on the site; a supervisor reads but never
writes.

| Method | Route | Description |
|--------|-------|-------------|
| `PATCH` | `S` | Change the page, name, address, contact, service capacity, payment methods, access, service days and hours, menu window, vote, and the labels in use (`tag_ids`, `certification_ids`) |
| `PUT` | `S/logo` | Set or replace the logo (`file`, multipart); returns the site |
| `DELETE` | `S/logo` | Remove it; `204` |
| `PUT` | `S/cover` | Set or replace the photo at the top of the page; returns the site |
| `DELETE` | `S/cover` | Remove it; `204` |
| `POST` | `S/photos` | `201`, a photo added to the gallery (`file` and `alt`, multipart); eight at most (`409 site_photo_limit`) |
| `PATCH` | `S/photos/{photo_id}` | Change its `alt` |
| `DELETE` | `S/photos/{photo_id}` | Remove it; `204` |
| `PUT` | `S/photos/order` | `{photo_ids}`: every photo once, in the new order (`422 image_order_invalid` otherwise) |
| `GET` | `S/calendar-settings` | What the calendar shows besides menus: public holidays, school holidays and their zone |
| `PATCH` | `S/calendar-settings` | Change them; `admin` role |
| `GET` | `S/live-status` | Today's service, for anyone: `{capacity_reached, reached_at}` |
| `PUT` | `S/live-status` | `{capacity_reached}`, by the site's admins and editors; it lapses with the day, in Paris time |
| `GET` | `S/quality` | For anyone: `{declaration, menus, labels}`, the latest EGalim year and what the last 30 days of published menus served |
| `GET` | `S/egalim-declarations` | `{items}`, every year declared, the latest first |
| `PUT` | `S/egalim-declarations/{year}` | `{sustainable_share, organic_share, territorial_share}`; `201` for a new year, `200` when replaced; `admin` role |
| `DELETE` | `S/egalim-declarations/{year}` | `204`; `404 egalim_declaration_not_found`; `admin` role |

Every value has its rule, refused with `422` otherwise:
- **Site:** a name of 1 to 50 characters without a web or email address, a postcode of five
  digits.
- **Hours:** service days from `0` (Monday) to `6`, hours as `HH:MM` with the close after the
  open. `service_hours` replaces every day's hours.
- **Closed lists:** payment methods among `izly`, `cb`, `cash` and `ticket_restaurant`;
  services among `wifi`, `microwave`, `takeaway`, `terrace`, `power_outlets`,
  `water_fountain` and `study_area`, read back in that order.
- **Votes and labels:** vote categories of the site, known labels.
- **Texts:** plain text, never markup. `tagline` holds one line of 160 characters at most,
  `description` paragraphs of 800, `access_info` paragraphs of 300, `quality_commitments`
  paragraphs of 600. Spaces are tidied and an empty text reads as `null`.
- **Links:** six at most, `[{kind, url, label}]`, replacing the site's.
  - The `url` is `https`, without credentials.
  - A `website` takes any host and needs a `label`.
  - The other kinds (`izly`, `instagram`, `facebook`, `linkedin`, `x`, `tiktok`, `youtube`)
    lead to their own domain, carry no label, and appear once at most.
- **Menu window:** `menu_days_ahead` from 0 to 28, `menu_days_back` from 0 to 90.
- **Service capacity:** `service_capacity`, the meals the team can serve in one service, from 1
  to 10 000, or `null`.
- **EGalim declaration:** the percent of a year's food purchases, by value, from 0 to 100 to the
  tenth; the organic share is part of the sustainable one, the territorial share is optional. A
  year runs from 2019 to the current one (`422 egalim_year_invalid`).

In `S/quality`, `menus` counts each dish as often as it was served; `vegetarian` is measured
over the dishes of highlighted categories and their subcategories, and is `null` without one.
`menus` is `null` without a published menu over the period, and `labels` lists those of the
dishes served.

An image is decoded and stored again, without its metadata: JPEG, PNG, WebP or HEIC, 5 MB
at most. It is brought down to 512 pixels on its longer side for a logo (which keeps its
transparency), 2400 for the cover and 2000 for a photo, and keeps its first frame only. A
photo's `alt` describes it for screen readers, 150 characters at most, and cannot be empty.

---

## Categories

A site's menu categories: one level of subcategories at most, and only a category without
subcategories carries dishes. Reading requires a session on the site, writing the `admin`
role on it; a supervisor reads but never writes.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `S/categories` | The categories in order, each with its subcategories |
| `POST` | `S/categories` | Add a category, or a subcategory with `parent_id` (a top-level category of the site); after the others unless `order` says otherwise; `201` |
| `PATCH` | `S/categories/{category_id}` | Change its `label`, `is_highlighted` or `color_key` (`indigo`, `sky`, `mint`, `saffron`, `clay`, `lilac`) |
| `PUT` | `S/categories/order` | New order of one level: every `category_ids` of the top level, or of one parent, once |
| `DELETE` | `S/categories/{category_id}` | Delete it and its subcategories |

A subcategory under a category that holds dishes, or the deletion of a category whose subtree
holds some, answers `409 category_has_dishes` with `dish_count`; a subcategory takes the
parent's dishes with `move_dishes: true`. A protected category answers `409 category_protected`.

---

## Members and invitations

A site's accounts belong to the site, and its admin manages them; the supervisors'
accounts belong to the organization, and the supervisors manage them. A supervisor reads a
site's accounts but never changes them (`403 supervisor_read_only`).

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `S/members` | The site's accounts, newest first; paginated (`page`, `per_page` up to 200, `Link`) |
| `PATCH` | `S/members/{user_id}` | `role` (`admin` or `editor`) and `is_active`; turning an account off ends its sessions |
| `DELETE` | `S/members/{user_id}` | Delete an account (*confirmed*); `204` |
| `DELETE` | `S/members/{user_id}/second-factors` | Remove its TOTP and passkeys and end its sessions (*confirmed*); `204` |
| `POST` | `S/members/{user_id}/password-reset` | Email it a link to choose a new password, returned as `reset_url` only when it could not be emailed (*confirmed*); `201` |
| `GET` | `S/invitations` | The 50 latest pending invitations, each with whether it was emailed; the site's admins only, a link being enough to create the account |
| `POST` | `S/invitations` | Invite someone (*confirmed*): `role`, an optional `email` that pre-fills the activation form, `send_email` to email it as well; `201` |
| `DELETE` | `S/invitations/{invitation_id}` | Revoke a pending invitation: its link stops working at once; `204` |
| `GET` | `O/members` | Every account of the organization, for its supervisors |
| `PATCH` | `O/members/{user_id}` | `is_active` of a supervisor |
| `DELETE` | `O/members/{user_id}`, `…/second-factors` | As for a site, on a supervisor (*confirmed*) |
| `POST` | `O/members/{user_id}/password-reset` | As for a site, on a supervisor (*confirmed*) |
| `GET`, `POST`, `DELETE` | `O/invitations`, `O/invitations/{invitation_id}` | The supervisors' invitations, without `role` |

Every account carries its `site` (`slug` and `name`, `null` for a supervisor). The caller's
own account answers `403 own_account` (deleting, deactivating, changing its role, resetting
it), the rescue account `403 rescue_account`. A reset link needs an active account with a
second factor (`409 member_inactive`, `409 second_factor_missing`); the reset leaves the
account active, to sign in with its password and set up a new factor. An address already in
use answers `409 email_taken`; one administrator emails twenty invitations a day at most.

---

## Audit Log

Requires an account carrying a second factor, code or passkey (`403 second_factor_required`
otherwise): the site's admin or a supervisor under `S`, a supervisor under `O`. Each read is
itself audited.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `S/audit-logs` | The site's entries, newest first; paginated (`page`, `per_page` up to 100, `Link`) |
| `GET` | `S/audit-logs/export` | The same as CSV, 10,000 rows at most (*confirmed*) |
| `GET` | `O/audit-logs` | The entries of the organization's sites and of its supervisors; `site` narrows to one site |
| `GET` | `O/audit-logs/export` | The same as CSV (*confirmed*) |

Filters: `action`, `user_id`, `from` and `to` (days in Paris time, both included). An
unreadable filter answers `422`.

---

## Push Notifications

A visitor's browser subscribes to a site's menus and events, with no account. A subscription
is named by the SHA-256 of its endpoint, in base64url: the browser computes it, and the
endpoint, which alone lets anyone push to that browser, never appears in an address.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/push-key` | The VAPID public key to subscribe with; `503 push_unavailable` when push is not set up |
| `PUT` | `S/push-subscriptions/{id}` | Subscribe: `endpoint`, `keys` as `PushSubscription.toJSON()` returns them, `platform` and the preferences; `201` the first time, `200` after |
| `GET` | `S/push-subscriptions/{id}` | Its preferences |
| `PATCH` | `S/push-subscriptions/{id}` | Change its preferences |
| `DELETE` | `S/push-subscriptions/{id}` | Unsubscribe; `204` |
| `POST` | `S/push-subscriptions/{id}/test` | Send a test notification to the stored subscription; `204`, or `502 push_failed` |

Notes:

- `endpoint` must be an `https://` address on a browser push service (Google, Mozilla, Apple,
  Microsoft), and `{id}` its fingerprint (`422 subscription_id_mismatch` otherwise). Anything
  else answers `422`: it is neither stored nor contacted.
- A subscription follows one site: subscribing on another moves it there, and the first site
  then answers `404 subscription_not_found`. A closed site answers `404`.
- Preferences: `notify_today_menu`, `notify_tomorrow_menu`, `notify_events`, and the times
  `notify_today_menu_time` and `notify_tomorrow_menu_time` (`HH:MM`, Paris time). Left out of
  a `PUT`, they take their default.

---

## Imports

Menus or dishes loaded from a CSV or Excel file, in three steps: send the file, preview,
confirm. An import belongs to the account, the site and the kind it was opened for, and closes
after thirty minutes or once confirmed (`404 import_not_found` after). Requires the `editor`
role.

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `S/menu-imports` | Send a file of menus, one row a day and one column a category (multipart `file`); `201` with the import's `id`, its columns, the first rows and a suggested mapping |
| `POST` | `S/menu-imports/{import_id}/preview` | The menus a `column_mapping` and a `date_config` give, each day that has a menu flagged |
| `POST` | `S/menu-imports/{import_id}/confirm` | Write them: `duplicate_action` (`skip`, `replace` or `merge`) for a day that has a menu, `auto_publish` |
| `POST` | `S/dish-imports` | Send a file of dishes; suggests the name column |
| `POST` | `S/dish-imports/{import_id}/preview` | The dishes it would add, with the labels found and the duplicates |
| `POST` | `S/dish-imports/{import_id}/confirm` | Add them, skipping the duplicates |

A file of dishes goes into one category (`name_column`, `category_id`, `tag_columns`,
`auto_detect_tags`): labels and certifications are found in the name and in the tag columns,
and a dish whose name the category already has is skipped. A file with the export's columns
is recognised when sent (`is_catalog_export`), with the category paths it holds and those the
site has. Preview and confirm then take `category_map`, each path to a category id or to
`"create"`, and read categories, labels and certifications from the file. A subcategory under
a category that already holds dishes is refused (`422 category_invalid`).
