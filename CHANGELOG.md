# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
