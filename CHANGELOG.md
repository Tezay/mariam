# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Deployment**: Automatic database updates to ensure reliability during upgrades.

## [0.1.0] - 2024-12-24

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
