# Changelog

All notable changes to this project are documented here. The format is
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While on
`0.x`, a breaking change bumps the minor.

Releases are tagged `v*` on `main`. Dokploy deploys from `main` on push, so a
tag records what shipped rather than triggering the deploy. The version lives
in the root `package.json`.

## [Unreleased]

## [0.6.0] - 2026-11-04

### Added

- One mail composer for people, companies, drafts and leads, with Bulle docked beside it: draft, reply, shorten, warm up, formalize, fix, translate and suggest a subject, in place
- Bulle's blob shows in the composer and reacts while it writes
- "Prochaine action" on company pages: Bulle reads the contact and its history and proposes the next steps and a draft
- `email.sendToLead` sends free text to a legacy lead through the configured transport
- `BULLE_URL` turns the assistant on; Glouton reaches Bulle with a Registre token exchange (`bulle.read`, `bulle.write`)

### Changed

- Courrier and Bulle share one Registre token store, so a user's refresh token is never rotated twice at once
- Lead and outreach pages use the shared composer; templates fill the composer as plain text

### Removed

- The "Demander à Bulle" clipboard and new-tab flow
- The unused `isomorphic-dompurify` dependency

## [0.5.5] - 2026-11-03

### Changed

- Spaces use the share-circle icon

### Fixed

- `bun run lint` no longer crashes: the root `ajv` override forced ajv 8 on eslint, and the eslint configs had been truncated. Lint now passes with zero warnings
- The frontend type-checks with 0 errors under strict mode: router types, route params, lead and hunt JSON fields, and nullable outreach ids
- The creations page reads the fields the API returns, and relaunching a hunt sends validated categories

## [0.5.4] - 2026-11-03

### Fixed

- The hunts page spaces its header, counters and empty state like the other pages

### Changed

- The desktop sidebar drops "Espaces"; the space switcher already links to space management. Mobile keeps it

## [0.5.3] - 2026-11-03

### Fixed

- Live updates: the WebSocket open handler no longer wipes Hono's socket data, so pings get a pong and messages and closes stop crashing the backend every 25 s

## [0.5.2] - 2026-11-03

### Fixed

- Uncaught exceptions and unhandled rejections log their message and stack instead of `{}`

## [0.5.1] - 2026-11-03

### Fixed

- The frontend image copies the new `@repo/courrier` workspace, so the v0.5.0 build no longer fails at `bun install`

## [0.5.0] - 2026-11-03

### Added

- **Contacts.** Companies and people, with stages (Prospect, Contacted, Client, Partner, Network),
  an origin, notes and an activity timeline. `/app/contacts` lists and filters them and adds one
  by hand; each company and person has a detail page with a stage selector and an "Ask Bulle"
  button. Hunts, CSV imports and company-creation conversions now write contacts too.
- **Agent inbox** at `/app/inbox`: drafts and suggestions from Bulle. A person edits and sends a
  draft, or accepts or dismisses a suggestion; the nav shows how many wait.
- **Agent REST API** under `/api/agent/*` for contacts, outreach, drafts and suggestions. It
  accepts a Registre delegated token (`glouton.read` for GET, `glouton.write` otherwise) or a
  session JWT, and has no route that sends mail.
- **Send through Courrier.** In Settings > Compte, or a space's SMTP tab, pick a Courrier
  account to send outreach from instead of SMTP. Glouton gets a Courrier token by refreshing the
  user's Registre grant and exchanging it (RFC 8693). SMTP stays the fallback when Courrier is not
  picked or not configured. Sent outreach records `courrierAccountId`.
- **Reply detection.** Every 15 minutes, `courrier-reply-sync` looks in Courrier for mail from
  each recipient of the last 30 days of Courrier outreach and marks it replied, with an
  `email.replied` activity.
- **Contacts from Courrier.** Daily, `courrier-contacts-import` proposes the addresses you wrote
  to from Courrier, and that Glouton does not know, as import suggestions in the inbox.
- **Ardoise sync.** "Passer en client" on a company creates the client in Ardoise, after you pick
  the billing contact and fill what is missing. Linked companies show a "Lié dans Ardoise" link
  and an Unlink action. Ardoise clients flow back through a signed webhook: Glouton links them by
  SIRET or contact email, asks in the inbox on a domain or name match, and creates the rest.
  Quotes, invoices and payments land on the company timeline, and an accepted quote makes it a
  client. Edits on either side sync with last write wins; a delete on one side only unlinks.
- `bun run backfill:contacts [--dry-run]` turns existing leads into companies and people and
  links their outreach. Running it twice changes nothing.

### Changed

- tRPC also accepts Registre delegated tokens. Sending mail, SMTP and team settings, webhooks,
  merges and deletes refuse them with `FORBIDDEN`: only a person signed in to Glouton can do those.
- Every outgoing mail goes through one `sendOutreach` seam, ready for a Courrier transport.
- SSO sign-in keeps the Registre refresh token, encrypted, when the provider returns one.
- SSO sign-in asks for `offline_access`, so Registre returns a refresh token. Glouton saves the
  rotated token after each refresh.
- Sending the legacy lead template mail now logs `email.sent` and moves the linked person and
  company from Prospect to Contacted, like a draft send.

### Upgrade notes

- The schema change is additive (new tables, nullable `EmailOutreach.leadId` and `templateId`,
  new `EmailStatus.DRAFT`). `prisma db push` at boot applies it, and migration
  `019_contacts_hub.sql` matches it. Run `bun run backfill:contacts` once after deploy. The
  `Lead` table is unchanged and the Leads pages still read it.
- Migration `020_courrier_transport.sql` adds nullable `mailTransport` and `courrierAccountId` to
  `User` and `Team`. Set `COURRIER_URL=https://courrier.facile.studio` to turn Courrier on. Users
  sign in once more with SSO to store a refresh token before they can pick Courrier.
- The Ardoise sync adds the `ArdoiseDelivery` table (migration `021_ardoise_deliveries.sql`) and
  stays off until `ARDOISE_URL`, `ARDOISE_API_TOKEN`, `ARDOISE_WEBHOOK_SECRET` and
  `ARDOISE_DEFAULT_OWNER_EMAIL` are all set, with the matching `GLOUTON_*` values in Ardoise.

## [0.4.0] - 2026-11-03

### Added

- **Spaces come from Registre.** Glouton imports its existing teams into
  Registre once, then mirrors Registre's shared spaces: same names, same
  members, same roles. It pulls at boot, every 5 minutes, and 2 seconds after
  Registre posts to `POST /api/registre/sync`. A mate added in Registre gets a
  Glouton account before their first sign-in, and lands on it when they sign
  in with SSO.
- SSO sign-in records the Registre identity (issuer and `sub`), and finds the
  user by it before falling back to email.

### Changed

- Creating a space, renaming it, adding or removing members, changing roles,
  leaving and deleting now happen in Registre. Glouton shows a "Gérer dans
  Registre" link instead, and the API answers 409 for those actions on a linked
  space. Description, SMTP, API keys and webhooks stay in Glouton.
- A member who has a Registre identity and is no longer in the Registre space
  loses their Glouton membership. Members without one, such as password-only
  accounts, are never removed by the sync.

### Known gaps

- Membership changes made in Registre do not fire the `team.member_added` and
  `team.member_removed` webhooks.

## [0.3.0] - 2026-11-03

### Added

- **Profile pictures from Registre.** Team members now show their Registre
  picture, with the initial when they have none. The sidebar user card does
  the same through muse v0.7.3, and a missing picture no longer shows a broken
  image.

### Changed

- The OIDC sign-in stores the `picture` claim only when it is an https URL, and
  clears a stale non-https value.

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
