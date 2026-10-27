# Changelog

All notable changes to this project are documented here. The format is
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While on
`0.x`, a breaking change bumps the minor.

Releases are tagged `v*` on `main`. Dokploy deploys from `main` on push, so a
tag records what shipped rather than triggering the deploy. The version lives
in the root `package.json`.

## [Unreleased]

## [0.2.0] - 2026-10-27

### Added

- **Company creations scraper and lead pipeline for France, UK, and Germany.**
  Ingests daily company registrations from the BODACC OpenDataSoft API and INSEE Recherche-Entreprises (France), the Companies House REST API (UK), and Handelsregister announcements (Germany). Runs as a recurring BullMQ background job every 4 hours with live progress reporting over WebSocket.
- **Automated web and DNS discovery on new company formations.**
  Checks for active domain and DNS records (`.fr`, `.co.uk`, `.de`, `.com`) to tag companies as either qualified website leads or hot web development prospects with no existing website.
- **Company creations interface and 1-click lead conversion.**
  New `/app/creations` route in the frontend built with `@facile/muse` components, multi-criteria filtering by country, NAF/SIC activity codes, postal codes, and website presence, with 1-click conversion to active leads in personal or team workspaces.
- **tRPC `companyCreation` router.**
  Procedures for listing, querying statistics, manual scraper dispatch, and converting company registrations to leads.

## [0.1.0] - 2026-10-27

### Fixed

- **Redis no longer refuses to boot on a corrupt append-only file.** A torn write
  left `appendonly.aof.6.incr.aof` unreadable, Redis exited with "Bad file format
  reading the append only file", and every deploy failed with `container
  glouton-redis is unhealthy`. The container now checks the AOF manifest before
  starting. When the check fails, it copies `appendonlydir` to
  `appendonlydir.bak-<epoch>` (once: an existing backup is never overwritten or
  multiplied) and runs `redis-check-aof --fix`, which truncates the incremental
  file at the corruption point. Every queued command after that point is lost;
  Postgres stays the source of truth. A corrupt base file cannot be repaired this
  way, so the container exits and needs a manual look. Redis still runs as the
  `redis` user.
- **Leaving or deleting the active space falls back to the personal space.**
  Before, the app kept sending the stale space id and offered no switcher to
  leave it.

### Changed

- **The frontend runs on muse**, the shared Facile design system
  (`@facile/muse#v0.7.2`): its tokens, sidebar, mobile nav, page transition and
  toasts. Dark mode follows the system setting.
- The root package is named `glouton` and carries the release version.
- Development tasks move from the `justfile` to `mise.toml`, and lefthook runs the
  suite's shared commit hooks. The `docker:*` tasks now use the `glouton-` service
  names; the broken `setup` recipe is gone.

### Removed

- The trial Goga font files and the `@fontsource` Inter and Poppins packages.
  muse ships the suite typeface.
- The iconify script loaded from jsDelivr. The app bundles `iconify-icon`.
