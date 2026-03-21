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
| `GET` | `/v1/auth/me` | bearer | Current user profile |

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
| `GET` | `/health` | Health check |
| `GET` | `/v1/restaurant` | Active restaurant info |
| `GET` | `/v1/taxonomy` | Dietary tags and certifications catalog |
| `GET` | `/v1/menus/today` | Today's published menu |
| `GET` | `/v1/menus/tomorrow` | Tomorrow's published menu |
| `GET` | `/v1/menus/week` | This week's published menus |
| `GET` | `/v1/events` | Upcoming published events (TV/mobile display) |
| `GET` | `/v1/notifications/vapid-public-key` | VAPID public key for push subscriptions |

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
| `POST` | `/v1/menus/<id>/item-images` | Sync gallery images for menu items |
| `DELETE` | `/v1/menus/<id>/item-images/<link_id>` | Unlink a gallery image from a menu item |

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

## Gallery

Requires `editor` role or above.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/gallery` | List images with pagination and search |
| `GET` | `/v1/gallery/<id>` | Image details and usages |
| `POST` | `/v1/gallery` | Upload an image |
| `DELETE` | `/v1/gallery/<id>` | Delete an image |
| `PUT` | `/v1/gallery/<id>/tags` | Replace all tags |
| `POST` | `/v1/gallery/<id>/tags` | Add a manual tag |
| `DELETE` | `/v1/gallery/<id>/tags/<tag_id>` | Remove a tag |

---

## Restaurant and Settings

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/v1/settings` | editor+ | Full restaurant settings |
| `PUT` | `/v1/settings` | admin | Update settings |
| `GET` | `/v1/restaurants` | admin | List all restaurants |
| `POST` | `/v1/restaurants` | admin | Create a restaurant |
| `PUT` | `/v1/restaurants/<id>` | admin | Update a restaurant |

---

## Users

Requires `admin` role.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/users` | List users |
| `GET` | `/v1/users/<id>` | User details |
| `PUT` | `/v1/users/<id>` | Update a user |
| `DELETE` | `/v1/users/<id>` | Delete a user |
| `POST` | `/v1/users/<id>/reset-mfa` | Reset a user's MFA |
| `POST` | `/v1/users/invite` | Create an invitation link |
| `GET` | `/v1/users/invitations` | List pending invitations |

---

## Audit Log

Requires `admin` role with active MFA session.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/audit-logs` | Paginated audit log (filters: `action`, `user_id`, `start_date`, `end_date`) |
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

Requires `editor` role or above. Three-step flow: upload, preview with column mapping, confirm.

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/v1/imports/menus/upload` | Upload and parse file |
| `POST` | `/v1/imports/menus/preview` | Preview with column mapping |
| `POST` | `/v1/imports/menus/confirm` | Execute import |
