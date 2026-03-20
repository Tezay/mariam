# MARIAM — API Reference

The MARIAM API follows REST conventions. All endpoints are prefixed with `/v1`. Responses are JSON.

**Interactive documentation (Swagger UI):** `https://<your-ru>.mariam.app/docs`

## Authentication

MARIAM uses a two-step login flow with mandatory TOTP MFA for admin accounts. Authenticated requests must include the access token as a Bearer token in the `Authorization` header.

```
Authorization: Bearer <access_token>
```

| Token | Lifetime |
|-------|----------|
| Access token | 30 minutes |
| Refresh token | 7 days |

**Login flow:**

1. `POST /v1/auth/login` — submit email and password
2. `POST /v1/auth/mfa/verify` — submit TOTP code, receive JWT

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/v1/auth/login` | Step 1: email and password |
| `POST` | `/v1/auth/mfa/verify` | Step 2: TOTP code (returns JWT) |
| `POST` | `/v1/auth/mfa/verify-setup` | Confirm MFA setup |
| `POST` | `/v1/auth/activate` | Activate account via invitation link |
| `GET` | `/v1/auth/check-activation/<token>` | Validate an activation link |
| `GET` | `/v1/auth/check-reset/<token>` | Validate a password reset link |
| `POST` | `/v1/auth/reset-password` | Reset password (requires TOTP) |
| `POST` | `/v1/auth/change-password` | Change password (requires TOTP) |
| `POST` | `/v1/auth/refresh` | Refresh access token |
| `GET` | `/v1/auth/me` | Current user profile |

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
