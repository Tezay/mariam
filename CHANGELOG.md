# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Multi-tenant isolation enforced** on events, closures, users, settings, audit logs and imports (scoped to the caller's restaurant/organization); the "first active restaurant" fallback is removed and cross-tenant access now returns 404.
- **Token revocation on credential changes**: password change/reset and MFA reset invalidate all outstanding tokens; changing your own password requires re-login.
- **Stored-XSS fixed** on the public event display (descriptions escaped before markdown rendering).
- **Privilege-escalation guards** on role assignment and cross-scope user reassignment.

### Added

- **Organization → Restaurant hierarchy**: new `Organization` entity and `org_admin` (director) role; restaurants gain `organization_id` and a URL-safe `slug`.
- **Automated off-site backups**: daily Postgres `pg_dump` to a dedicated S3 bucket with retention, plus a `restore.sh` script.
- **Error tracking (Sentry)** for backend and frontend, enabled via environment.
- **Readiness probe** `GET /health/ready` (checks DB and Redis) for external uptime monitoring.
- **Slugged public API** (`/v1/public/<restaurant>/…`): tenant resolved from the request host (subdomain = organization) and the restaurant slug, with an `/v1/public/org` bootstrap endpoint. Legacy `?restaurant_id=` endpoints kept for compatibility.

### Changed

- Users are bound to a restaurant/organization at activation; unassigned accounts no longer fall back to a default restaurant.
- **Production deploys pinned GHCR images** (rollback via `MARIAM_TAG`) instead of building on the server; near-zero-downtime redeploys.
- **Push scheduler** runs as a single dedicated service instead of inside every web worker, preventing duplicate notifications.
- Gunicorn tuned (threaded workers, timeouts); container logs rotated and per-service resource limits set; nginx security headers added.
- CI quality gate now runs on `main` and tags, and image publishing is gated on passing tests.

### Fixed

- Image uploads larger than 1 MB were rejected: nginx `client_max_body_size` is aligned with the 32 MB backend limit.
- nginx rate limiting now keys on the real visitor IP behind Cloudflare instead of the Cloudflare edge IP.

## [0.13.0] - 2026-07-06

### Added

- **Dish catalog**: new per-restaurant `DishCatalog` entity replacing free-text menu items. Admin page `/admin/catalogue` (grid/list views, search, sort by usage), dish detail page with usage statistics and charts, per-dish image upload, and a quick-add combobox in the menu editor.
- **Dish catalog CSV/Excel import**: bulk-import dishes into a chosen category via a catalogue-page wizard, with dietary tag/certification auto-detection, name normalization, duplicate skipping, and shared CSV parsing in `services/csv_import.py`.
- **Per-menu category substitutions**: substitution dishes defined per menu and category, displayed when an item is out of stock.
- **In-app notification center**: bell popover with unread count, persisted notifications, and real-time live alerts (unpublished menu of the day, active service without a published menu, upcoming public holidays). Per-user notification preferences.
- **Calendar settings**: per-restaurant toggles to display French public holidays and school vacations in the admin calendar.
- **Menu copy to multiple dates**: copy a day's menu to any set of dates via a multi-date picker.
- **Full-page event editor**: dedicated `/admin/events/:id/edit` page with rich-text description (Tiptap).
- **Drag and drop in the week view**: move and reorder menu items across days (dnd-kit).
- **Swipeable rows on mobile admin**: swipe gestures for item actions in the day editor.
- **`flask seed-categories` command** and `make db-seed-categories` shortcut.

### Changed

- **Menu creation onboarding rebuilt**: mobile-first wizard with live preview, optional dish photos, per-category substitutions, strict deduplicated suggestions, and a light publish celebration.
- **Admin layout rebuilt**: collapsible sidebar with persisted state, new shared layout components, and skeleton loading states for the calendar.
- **Menu API shape**: menu items now reference the catalog — responses nest a `dish` object (`dish_id` foreign key) instead of flat `name`/`tags`/`certifications` fields.
- **Toasts centralized**: single `notify` helper (`lib/toast.ts`, backed by sonner) across the admin.
- **Code splitting**: heavy admin pages (catalogue, dish detail, event editor) are lazy-loaded, and public visitors no longer download admin-only dependencies.
- **API reference (`docs/API.md`)**: documents the Dish Catalog, Inbox Notifications, and calendar-settings endpoints; Gallery section removed.
- **Settings page rebuilt**: split into per-tab components (`pages/admin/settings/`) sharing one `useSettingsState` hook.
- **Shared route helpers** centralised in `routes/helpers.py`, removing duplicated copies across blueprints.
- **Production compose** now wires `REDIS_URL`, the WebAuthn variables and `UMAMI_WEBSITE_ID`, and adds a backend `/health` healthcheck.

### Fixed

- **CSV/Excel import**: fixed a 500 on commit - items were still built with the removed `name`/`tags`/`certifications` fields instead of catalog dishes.
- **Daily-menu push notifications**: fixed empty payloads (built from the obsolete item shape) that silently suppressed every push.

### Removed

- **Image gallery**: models, routes, schemas, and admin pages (`GalleryPage`, `GalleryPicker`). Images are now attached to catalog dishes and menus directly.
- **Legacy editors**: `MenuEditor`, `WeeklyPlanner`, `DuplicatePanel`, and `ImportFromDayPanel`, replaced by the new calendar flows.

### Security

- **Multi-tenant scoping on menus**: menu-by-id routes (get/update/publish/unpublish/delete/substitutions) and `GET /menus` are now scoped to the caller's restaurant.
- **Boot-time secret guard**: the app refuses to start outside development with the default `SECRET_KEY`/`JWT_SECRET_KEY`.

### Database

- Migration `bfb39474c140`: creates `dish_catalog` and `category_substitutions`, links `menu_items` to the catalog. ⚠️ **Destructive**: deletes all existing menu items and drops the gallery tables without converting data — back up the database before upgrading in production.
- Migration `d6b24ae95a98`: scopes category substitutions per menu (`menu_id` column and updated unique constraint).
- Migration `ec0cf6a02893`: creates the `inbox_notifications` table.
- Migration `4c83d7dc335a`: adds `notification_preferences` to users and creates `restaurant_calendar_settings`.

## [0.12.0] - 2026-05-07

### Added

- **`flask seed` command**: idempotent upsert of all reference taxonomy data (dietary tags, certifications and their keywords). Replaces the anti-pattern of seeding data inside Alembic migrations.
- **`flask seed-demo` command**: creates a demo restaurant, an admin account without MFA, and a full published week of demo menus (63 dishes across 5 days). Outputs credentials and ready-to-use URLs.
- **`make db-seed` / `make db-demo`**: Makefile shortcuts for the two commands above.
- **pytest infrastructure**: `server/conftest.py` with isolated PostgreSQL test DB, and six test suites covering auth, menus, categories, restaurant settings, users, and the public menu API (46 tests).
- **`server/pyproject.toml`**: replaces `requirements.txt`; production and dev dependencies managed via `uv`. Includes ruff configuration.

### Changed

- **CI build time**: GitHub Actions workflow split into two parallel jobs (`build-backend`, `build-frontend`) and restricted to `linux/amd64` only.
- **Multi-restaurant support for admin routes**: all authenticated backend routes (`/menus/week`, `/settings`, `/settings/categories`, `/events`, `/closures`, etc.) now resolve the restaurant from the authenticated user's `restaurant_id`.
- **Public menu pages accept `?restaurant_id=`**: `MobileMenuDisplay` and `TvMenuDisplay` accept a `restaurantId` prop forwarded from `MenuDisplay`, which reads it from the URL query string.
- **Backend runtime**: Docker images now use `uv` instead of `pip` for dependency installation.

### Removed

- **Icon picker system**: removed `icon-picker.tsx`, `icons-data.ts` (8 335 lines), and all icon-related fields and UI across the admin, TV, and mobile views. Menu categories no longer have an icon field.

### Database

- Migration `55b3b63a2e51`: drops `icon` column from `menu_categories`.

## [0.11.1] - 2026-05-04

### Added

- **Default categories on restaurant creation**: new restaurants now get Entrées, Plat principal (with Protéine and Accompagnement subcategories), and Dessert automatically.

### Changed

- **Category color palette**: replaced green/blue/purple/yellow/teal/slate with indigo/sky/mint/saffron/clay/lilac.

### Database

- Migration `h7c8d9e0f1g2`: renames existing color keys to the new palette; auto-assigns colors to previously uncolored categories.

## [0.11.0] - 2026-05-04

### Added

- **Exceptional closures**: Create, edit, and delete exceptional closure periods from the calendar.
- **Menu onboarding**: Full-screen step-by-step wizard to create a new menu (name -> dietary tags -> next dish).

### Changed

- **Admin calendar interface**: Rebuilt as a unified interface combining menu planning and event management. New calendar views: day, week (inline editing per column), month, and year overview.

### Database

- Migration `a96639e26a02`: creates `exceptional_closures` table (`restaurant_id`, `start_date`, `end_date`, `reason`, `description`).
- Migration `892fe6ef799c`: removes `status` column from `exceptional_closures`.

## [0.10.3] - 2026-04-07

### Added

- **Mobile item card**: dietary tag icons displayed alongside certification logos.
- **shadcn Drawer component**: new `Drawer` built on `vaul` replacing `Sheet` for `MobileItemDetailSheet` (for native swipe-to-close supports).

## [0.10.2] - 2026-04-07

### Changed

- **Mobile menu**: hide "Fermé aujourd'hui" status when no service hours are configured.
- **Mobile menu**: add footer at the bottom of the content area.

## [0.10.1] - 2026-04-07

### Fixed

- **Mobile menu**: "Plat principal" and its subcategories were invisible on mobile in production due to `is_highlighted` hardcoded to `false` in migration `c1d2e3f4a5b6`. Fixed by migration `g6b7c8d9e0f1`.

### Database

- Migration `g6b7c8d9e0f1`: sets `is_highlighted = true` on top-level protected categories (`is_protected = true, parent_id IS NULL`).

## [0.10.0] - 2026-04-07

### Added

- **Mobile menu UI** (full rewrite): `MenuDisplay` is now a thin orchestrator delegating to `TvMenuDisplay` or `MobileMenuDisplay` based on screen width / `?mode=tv`. Ten dedicated mobile components: `MobileHeader`, `MobileMenuDisplay`, `MobileCategorySection`, `MobileHighlightedCategory`, `MobileStandardCategory`, `MobileItemCard`, `MobileItemDetailSheet`, `MobileEventSection`, `MobileChefNote`, `MobileDayToggle`, `MobileMenuSkeleton`.
- **Per-category colors**: Six named colors (green, blue, purple, yellow, teal, slate) stored as `color_key` on `menu_categories`. Public menu display uses `color_key`.
- **Expandable mobile header**: Restaurant info (payment methods, capacity, PMR chip, service hours, contact) behind a collapsible panel.
- **Closed-day message**: When the selected day is outside `service_days`, the UI shows a "restaurant closed" message with the next scheduled opening date.

### Changed

- **Timezone**: All date computations now use `Europe/Paris` instead of UTC. Backend: `paris_today()` / `paris_now()` via `zoneinfo.ZoneInfo`. Frontend: `parisToday()` / `addDays()` via `Intl.DateTimeFormat`. `published_at` timestamps use `datetime.now(timezone.utc)` (replaces deprecated `utcnow()`). Audit log `created_at` serialisation now includes the `+00:00` UTC offset so the frontend displays the correct local time.

### Database

- Migration `f5a6b7c8d9e0`: adds `color_key VARCHAR(30)` to `menu_categories`; existing top-level non-highlighted categories assigned default colors in order.

## [0.9.1] - 2026-04-04

### Security

- **Rate limiting**: use `CF-Connecting-IP` as the authoritative client IP to prevent `X-Forwarded-For` spoofing.
- **Token blacklist**: fail-closed when Redis is configured but unreachable.
- **Intermediate tokens**: `webauthn_pending`, `setup_phase`, and `session_transfer` tokens are now rejected on all regular `@jwt_required()` endpoints.
- **Account activation**: `passkey/setup/begin` and `mfa/verify-setup` require a short-lived `setup_token` (15 min) issued at activation; added dedicated rate limit (5/min) on `mfa/verify-setup`.
- **Frontend**: editor-only pages now enforce `editor`/`admin` role; `reader` accounts are redirected to 403.

### Fixed

- **CORS**: added `PATCH` to allowed methods (stock toggle on the service page was blocked by preflight).

## [0.9.0] - 2026-04-03

### Added

- **Menu categories**: New `menu_categories` DB table replaces the JSON field on `Restaurant`. Supports one level of subcategories (`parent_id` self-referential FK). Default tree: Entrée → Plat principal (Protéines, Accompagnements, Option végétarienne) → Dessert.
- **Menu items**: `category_id` (integer FK) replaces the `category` string slug. New `is_out_of_stock` flag and `replacement_label` text field per item.
- **Category CRUD API**: `GET/POST/PUT/DELETE /v1/settings/categories` with `is_protected` enforcement and reorder endpoint.
- **Restaurant info fields**: `address_label/lat/lon` (BAN-verified), `email`, `phone`, `capacity`, `payment_methods`, `pmr_access` on `restaurants`.
- **Service page** (`/admin/service`): Dedicated real-time service view. Per-item stock toggle, inline item editor (name, tags, replacement label), auto-saving chef's note, and a shortcut to the full MenuEditor.

### Changed

- **Settings page**: New sections for address (BAN autocomplete), contact info, capacity, service hours, PMR accessibility, and accepted payment methods.

### Database

- Migration `c1d2e3f4a5b6`: creates `menu_categories`, migrates `menu_items.category`, migrates `menu_item_images` to FK-based linking, converts `gallery_image_tags.category_id` from VARCHAR to INTEGER, drops `restaurant.menu_categories` JSON column.
- Migration `d2e3f4a5b6c7`: inserts `hot_appetizer` dietary tag.
- Migration `e3f4a5b6c7d8`: adds restaurant info fields; creates `restaurant_service_hours`; drops legacy `address` column.

## [0.8.7] - 2026-04-01

- **Analytics**: Custom Umami events - `menu-tomorrow-view`, `notifications-subscribe/unsubscribe`, `login-success/failure` (with method), `menu-week-publish`, `event-publish`.

## [0.8.6] - 2026-03-30

### Added

- **Analytics**: Umami tracking script injected dynamically from runtime config (`UMAMI_WEBSITE_ID` env var on the frontend container).

## [0.8.5] - 2026-03-25

### Changed

- **Public API (frontend)**: Added a dedicated `publicAxios` client (no JWT interceptor) and moved public menu/event fetches into feature APIs: `menusApi.getToday()`, `menusApi.getTomorrow()`, `eventsApi.getPublic(...)`.

### Fixed

- **Public menu display**: `/menu` now calls `menusApi`/`eventsApi` public endpoints without `Authorization` header, even for logged-in editor/admin sessions, so published events render correctly.

## [0.8.4] - 2026-03-22

### Fixed

- **PWA (admin)**: Manifest fetch handler in Service Worker is now registered before `precacheAndRoute`; manifests excluded from Workbox precache — prevents Workbox from serving the cached public manifest before the dynamic handler can respond.

## [0.8.3] - 2026-03-22

### Fixed

- **PWA (admin)**: Service Worker now intercepts manifest requests and serves `manifest-admin.webmanifest` for admin/editor users (role persisted in CacheStorage). Replaces unreliable inline-script swap that iOS Safari ignored.
- **PWA (admin)**: Post-QR-scan flow now includes an inline passkey registration step before redirecting to the PWA install onboarding.

## [0.8.2] - 2026-03-22

### Added

- **PWA (admin)**: Separate `"Mariam — Gestion"` manifest (`start_url: /admin/menus`) dynamically.
- **Install onboarding**: Full-screen `/admin/install` page shown on first login for admin/editor users, with platform-specific instructions — iOS/Safari steps, native Android prompt, and a desktop QR code with a 5-minute session transfer token for cross-device authentication.
- **Auth**: Server-side logout (`POST /auth/logout`) blacklists both the refresh token and the access token in Redis, preventing any reuse after sign-out.

### Fixed

- **Security**: MFA intermediate tokens (`mfa_pending`) are now explicitly rejected on all protected API endpoints.
- **Security**: Session transfer tokens are now single-use — a second scan within the 5-minute window is rejected.
- **Auth**: MFA intermediate token now has an explicit 10-minute TTL (previously `expires_delta=False`).
- **Auth**: `POST /auth/refresh` now has a dedicated rate limit (10/min).

## [0.8.1] - 2026-03-22

### Fixed

- **Passkeys**: Removed `authenticatorAttachment: platform` constraint (blocked devices without biometrics) and `excludeCredentials` list (blocked Apple devices sharing the same iCloud Keychain passkey).

## [0.8.0] - 2026-03-21

### Added

- **Passkeys (WebAuthn / FIDO2)**
    - Full passkey support as an alternative to TOTP — no dependency on an authenticator app.
    - Account activation via passkey: register a passkey and receive a JWT in one step.
    - Standalone passkey login: discoverable-credential challenge, no email/password required.
    - 2FA invariant enforced server-side and client-side: TOTP cannot be disabled while no passkey is registered, and the last passkey cannot be deleted while TOTP is disabled.
    - New `passkeys` table; new `py_webauthn` backend dependency; new `@simplewebauthn/browser` frontend dependency.

## [0.7.2] - 2026-03-21

### Fixed

- **PWA**: Exclude `config.js` from Workbox precache.

## [0.7.1] - 2026-03-21

### Fixed

- **PWA**: Force page reload when a new Service Worker activates : prevents stale JS bundles from calling outdated API endpoints after a deployment.

## [0.7.0] - 2026-03-20

### Added

- **Sidebar**: Pulsing dot on "Événements" nav item when a published event is scheduled for today.

### Changed

- **API routes**: Refactored server routes into dedicated modules — `audit.py`, `imports.py`, `restaurant.py`, `taxonomy.py`, `users.py` — replacing the monolithic route files for improved maintainability and separation of concerns.

### Fixed

- **API robustness**: Added null-guard (`or {}`) after all `request.get_json()` calls in reorder-images, chef-note, sync-item-images (menus), and tag endpoints (gallery) — a missing or malformed JSON body now returns 400 instead of crashing with 500.
- **Audit**: `start_date`/`end_date` filter parameters now silently ignore invalid ISO format values instead of raising an unhandled `ValueError` (500).

## [0.6.1] - 2026-03-05

### Added
- **Menu drawer**: Unpublish and delete actions; dirty-state detection with contextual button labels; unsaved-changes close guard.
- **Events**: Whole event card is now clickable to open the detail overlay (today + upcoming).
- **Certifications**: Badge click on public menu : popover with details (category, guarantee, issuer, jurisdiction).

### Changed
- **MSC certification**: Updated SVG logo.

## [0.6.0] - 2026-02-26

### Added
- **Password Reset**: Password reset feature for production (serverless).
- **Sidebar Help Button**: "Besoin d'aide ?" link to official docs in admin sidebar.

### Changed

- **Taxonomy**: Full database normalization of dietary tags and certifications.
    - 17 dietary tags across 4 categories (Régime, Allergènes, Préparation, Goût) with Lucide icons.
    - 11 official certifications across 2 categories (public labels, private labels) with SVG logos.
    - Keyword-based auto-detection for CSV imports (DB-driven, no more hardcoded lists).
    - Registry file (`server/app/data/taxonomy.py`) as single source of truth.
- **Public Taxonomy API**: `GET /api/public/taxonomy` returns all tag/cert categories with nested objects.

### Removed

- Legacy `is_vegetarian`, `is_halal`, `is_pork_free`, `allergens` columns from `menu_items`.
- Legacy `dietary_tags`, `certifications` JSON columns from `restaurants`.
- Hardcoded `DEFAULT_DIETARY_TAGS`, `DEFAULT_CERTIFICATIONS` from frontend constants.

### Database

- Migration `a2b3c4d5e6f7`: 6 reference tables + 4 junction tables, seed data, drop legacy columns.
- Migration `b3c4d5e6f7a9`: `tags_customized` flag on `restaurants`.

## [0.5.2] - 2026-02-23

### Fixed

- NotificationsPage: removed unused imports (`detectPlatform`, `Platform` type).

## [0.5.1] - 2026-02-23

### Fixed

- PWA install button on Android/Desktop: only shows when browser provides the install prompt; properly awaits user choice.
- TypeScript: removed invalid generic type `Uint8Array<ArrayBuffer>` and unused imports.

## [0.5.0] - 2026-02-23

### Added

- **Push Notifications**: Web Push via VAPID (RFC 8030). Public `/notifications` page to subscribe, configure preferences, and send test notifications. Per-user scheduling for daily menu and event reminders (J-7 and J-1). Automatic cleanup of expired subscriptions and orphan detection.
- **Service Worker**: Dual architecture (minimal classic JS for dev, Workbox injectManifest for prod). HTTPS dev support via mkcert auto-detection.
- **Scheduler**: APScheduler cron (every minute) with Redis distributed lock for multi-instance safety.
- **Database**: New `push_subscriptions` table with endpoint indexes; `notified_7d`/`notified_1d` flags on events.

### Changed

- Nginx caching: Service Worker JS files are no-cache; hashed assets in `assets/` remain immutable (1 year).

## [0.4.1] 2026-02-20

### Added

- **Rate Limiting**: Redis-backed API rate limiting (Upstash in prod, in-memory fallback in dev). Per-route rate limits. Nginx-level rate limiting as defense-in-depth.

### Changed

- `robots.txt`: allow crawling of `/menu`, `/api/v1/`, `/api/public/` for search engines and AI agents. Internal routes remain blocked.
- Centralized `get_client_ip()` into `security.py` (removed duplicates across route files).

## [0.4.0] - 2026-02-19

### Added

- **Events**
    - Full event management system (create, edit, publish, archive).
    - Customizable color per event with preset palette and free color picker.
    - Upload 1 to 6 images per event with drag-to-reorder support.
    - TV display: day-of banner with image carousel, rotating footer for upcoming events.
    - Mobile display: event card with detail overlay.

- **Image Gallery**
    - Centralized gallery to store and reuse dish photos across menus.
    - Search and filters (automatic tagging by dish name and category) in the admin interface.
    - Gallery picker integrated into the menu editor to attach photos to dishes.

- **Menu Photos & Chef's Note**
    - Direct per-item photo upload in the menu editor.
    - Configurable chef's note per menu.

- **S3 Storage**
    - S3-compatible storage service.
    - Image upload, deletion, and validation with unique key generation.
    - HEIC/HEIF support: automatic conversion to JPEG on the server.

## [0.3.8] - 2026-02-03

### Fixed
- Handled databases with an empty `alembic_version` when autostamping.

## [0.3.7] - 2026-02-03

### Fixed
- Fixed production migration script import path.

## [0.3.6] - 2026-02-03

### Fixed
- Serialized production DB migrations with an advisory lock and safe bootstrap/reset handling.

## [0.3.5] - 2026-02-03

### Added
- Initial database migration for the current schema.

### Changed
- Improved public menu loading UX with delayed skeleton, retry window, and 20s public API timeouts.

### Fixed
- Added accessible labels to admin week navigation buttons.

## [0.3.4] - 2026-01-08

### Added
- Runtime environment variable configuration for frontend (`API_URL`).
- Multi-origin CORS support for backend.

## [0.3.3] - 2026-01-07

### Fixed
- Fixed serverless deployment crash caused by `db.create_all()` running at import time.

## [0.3.2] - 2026-01-07

### Added
- SQLAlchemy connection pool settings optimized for serverless databases.
- Automatic database initialization on container startup.

## [0.3.1] - 2026-01-07

### Fixed
- Fixed missing `package.json` version update in client.
- Fixed Docker publish workflow (multi-arch support, corrected summary).

## [0.3.0] - 2026-01-06

### Added

- **CI/CD**
    - GitHub Actions workflow for automatic Docker image builds on version tags.

- **CSV/Excel Menu Import**
    - New wizard to import menus from CSV or Excel files.
    - Automatic column mapping and diet tag detection (Vegetarian, Halal, Bio, etc.).
    - Smart duplicate handling (Skip, Replace, Merge) and preview mode.

- **Error Handling**
    - New `InlineError` component with auto-detection of network, server, and permission errors.
    - 10-second timeout on all API requests to prevent infinite loading states.
    - New UI for 404 (Not Found) and 403 (Forbidden) pages.

### Fixed

- **CSV Import**: Replaced in-memory file cache with database-backed `ImportSession` model to fix 404 errors in multi-worker Gunicorn production environments.

### Changed

- **Production Entrypoint**
    - Adjusted Gunicorn worker count (4 to 2) to match production capacity and deployment requirements.

## [0.2.0] - 2025-12-30

### Added

- **User Account Page**
    - New "Mon Compte" page accessible from the user dropdown menu.
    - Password change with security validation.
    - Account information display (email, role, MFA status).

- **Branding & Logo**
    - Custom logo in the admin dashboard navigation bar and on public pages.
    - Theme-adaptive logo (light/dark mode support).

- **Favicons & PWA**
    - SVG favicons with automatic browser dark mode support (fallback .ico for legacy browser compatibility).
    - Complete PWA configuration: installable on home screen (iOS, Android, Windows).

- **Developer API (v1)**: Public API at `/api/v1/menus` and `/api/v1/restaurant` with Swagger documentation at `/api/v1/docs`.

- **Deployment**: Automatic database updates to ensure reliability during upgrades.

### Changed

- **Dark Theme**
    - Fixed text visibility issues in dark mode across the entire dashboard.
    - Harmonized colors on all admin pages.

### Technical

- Automatic database migrations during version upgrades.

## [0.1.0] - 2025-12-24

### Added

- **Authentication & Security**
    - Multi-Factor Authentication (MFA/TOTP) for all admin accounts.
    - Secure password hashing and strength validation.
    - Audit logging for sensitive actions (login, settings changes, user management).
    - Activation link system for initial admin setup.

- **Admin Interface**
    - Weekly Menu Planner with drag-and-drop capabilities.
    - Restaurant Settings dashboard (categories, service days, dietary tags).
    - User Management system (invite, role management).
    - Responsive "Drawer" layout for menu editing.

- **Public Display**
    - **TV Mode**: Specialized horizontal interface for large screens, non-scrollable, with auto-hiding controls (Zoom, Rotate).
    - **Mobile Mode**: Responsive view for students/staff on smartphones.
    - "Tomorrow's Menu" fixed footer in TV mode.
    - Automatic mode detection based on screen width + `?mode=tv` override.

- **Infrastructure**
    - Docker Compose setup for Development and Production.
    - Nginx configuration for production deployment.
    - Deployment scripts (`install.sh`, `run.sh`, `init.sh`).

- **Legal**
    - Implementation of **MARIAM Source Available License** (Dual-licensing model).
    - Educational institutions (University Restaurants) explicitly categorized as Commercial Use.
