# Mariam

Menu management for university restaurants.

[![Quality Gates](https://img.shields.io/github/actions/workflow/status/Tezay/mariam/quality.yml?branch=main&label=quality%20gates)](https://github.com/Tezay/mariam/actions/workflows/quality.yml)
[![Release](https://img.shields.io/github/v/release/Tezay/mariam?include_prereleases)](https://github.com/Tezay/mariam/releases)
[![License](https://img.shields.io/badge/license-Source%20Available-blue)](LICENSE.md)
[![mariam.app](https://img.shields.io/badge/mariam.app-informational)](https://mariam.app)

**English** | [Français](README.fr.md)

[![Mariam dashboard](docs/assets/dashboard.webp)](https://mariam.app)

## Overview

Mariam lets catering staff prepare and publish daily menus, and lets students read them on a phone
or on in-restaurant screens, without an account.

It is multi-tenant: an organization owns any number of sites, each with its own dashboard, public
page and data. Supervisors get a separate dashboard spanning every site they oversee. The same
analytics views serve both, scoped by role.

## Features

**For catering staff**

- Unified calendar with day, week, month and year views
- Dish catalogue with images, dietary labels, certifications and usage statistics
- CSV import and export, round-trip safe
- One-click publication, per day or per week
- Events, exceptional closures and a chef's note
- Real-time alerts, weekly email digest, per-user preferences

**For students**

- Mobile-first menu, no account required
- Full-screen display mode for in-restaurant screens
- Dietary labels and official certifications on every dish
- Three-level satisfaction vote, anonymous and fraud-resistant

**For supervisors**

- Cross-site overview: publication, traffic, satisfaction, site ranking
- Per-site drill-down on the same views
- Organization-wide dish catalogue, accounts and audit log

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind, shadcn/ui, Recharts, TanStack Query |
| Backend | Flask 3, flask-smorest, SQLAlchemy 2, Alembic, Gunicorn |
| Data | PostgreSQL 17, Redis 8, S3-compatible object storage |
| Infrastructure | Docker Compose, Nginx, GitHub Actions |

## Quick start

```bash
git clone https://github.com/Tezay/mariam
cd mariam
docker compose up -d --build
make db-upgrade   # the development server does not migrate on start
make db-demo      # optional: a demo site, its admin and a week of menus
```

Frontend on `https://localhost:5173`, API on `http://localhost:5000`, OpenAPI at `/v1/docs`.
See [docs/INSTALL.md](docs/INSTALL.md) for production.

## Documentation

| Audience | Start with |
|---|---|
| Integrate the API (intranet, portal, bot) | [docs/INTEGRATING.md](docs/INTEGRATING.md), then [docs/API.md](docs/API.md) |
| Run an instance, non-commercial use only ([license](LICENSE.md)) | [docs/INSTALL.md](docs/INSTALL.md), then [docs/OPERATIONS.md](docs/OPERATIONS.md) |
| Contribute | [CONTRIBUTING.md](CONTRIBUTING.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/TESTING.md](docs/TESTING.md) |

Every document: [docs/](docs/README.md). Also [SECURITY.md](SECURITY.md) to report a vulnerability, and
[CHANGELOG.md](CHANGELOG.md) for the release history.

## Repository layout

```
client/   React frontend
server/   Flask backend, migrations, tests
deploy/   Production compose, Nginx, scripts
docs/     Technical documentation
```

## License

Source available, not open source: see [LICENSE.md](LICENSE.md). Non-commercial use is granted
under those terms; commercial use requires a separate agreement, see
[COMMERCIAL_LICENSE_TEMPLATE.md](COMMERCIAL_LICENSE_TEMPLATE.md).
