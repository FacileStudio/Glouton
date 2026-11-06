# Changelog

All notable changes to this project are documented here. The format is
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While on
`0.x`, a breaking change bumps the minor.

Releases are tagged `v*` on `main`. Dokploy deploys from `main` on push, so a
tag records what shipped rather than triggering the deploy. The version lives
in the root `package.json`.

## [Unreleased]

## [0.7.1] - 2026-11-06

### Fixed

- A person without a plan can reach their settings again. Only a page's own query sends the browser to the paywall on a 402; the layout's inbox counter, the mail transport settings and the team SMTP and stats widgets fail quietly (`{ context: QUIET }` from `@repo/trpc-client`)
- Without a plan, members can still list, read, export (`lead.importExport.exportToCsv`) and delete their existing leads, contacts and hunt history in scopes they belong to. Creating, hunts, audits, outreach, scrapers and the assistant stay gated. Procedures mark this with `meta.forfait.free`; the gate keeps every membership check and passes `ctx.planMode = 'free'` so scope helpers do not hide scopes without a plan
- `team.leave` and `team.delete` need no plan, so teams not linked to Registre can be left or removed; the backend logs how many such teams exist at boot
- A failed SSO sign-in redirects to the login page with a message (`?sso_error=unverified_account` or `sso_failed`) instead of answering raw JSON
- Hunt and audit sessions whose job was skipped for lack of a plan are marked `CANCELLED` with the reason instead of staying pending

### Security

- A Registre snapshot whose `version` or `entitlements_revision` is not a non-negative integer is rejected whole
- Entitlement applies take a Postgres advisory lock, so concurrent applies cannot race on the stale checks or the state row
- When a user has several Registre identities, the personal plan comes from the most recent one that Registre's snapshot lists, ties broken by `sub`, like Courrier; a recreated account is never shadowed by its dead predecessor

## [0.7.0] - 2026-11-04

### Added

- Glouton needs a plan with `glouton.access` (Pro or Studio). Registre's directory snapshot now carries `entitlements_revision`, per-space `entitlements` and per-person `people[]`; Glouton stores them on `Team.entitlements` and in `PersonEntitlement` (by Registre `sub`), in the same transaction as the space sync (migration 022)
- Every tRPC procedure is gated by default. A by-id procedure takes the scope of the row it loads (lead, hunt or audit session); otherwise a team call needs the team's space to have access and a personal call needs the person's own access. The scope is read from the input as the procedure parses it, so a `teamId` it does not declare is ignored, and a procedure that takes a row id without declaring how it is scoped is refused. Refused calls answer HTTP 402 `PAYMENT_REQUIRED` with `data.upgrade_url` (`<OIDC_ISSUER>/spaces/<space id>` or `<OIDC_ISSUER>/spaces`). Exempt: sign-in, session, `user.me`, the space list and `forfait.status`; the person's own account (profile, password, SMTP, deletion) needs a session but no plan. The Registre sync webhook and health routes stay outside tRPC
- The agent REST API answers 402 when the caller has no scope with access, and cross-scope reads only show scopes with access
- Hunt, audit and CSV import jobs, Courrier reply sync and the Courrier contact import skip scopes without access and log it. No data is deleted
- A paywall page at `/app/paywall`, reached from any 402, explains that Glouton is part of the Pro and Studio plans and links to the space's Registre page

### Security

- Fail-open lasts only until the first snapshot with `entitlements_revision > 0`. That fact is stored in `ForfaitState`, so a restart with Registre down keeps the last known values. Older snapshots (lower version or revision) never overwrite newer values
- Malformed entitlement values (wrong type, bad key, more than 200 keys) read as the default, which denies access
- A snapshot from a new issuer, or whose version went back, is logged as an error and becomes the new baseline; enforcement stays on
- `email.sendEmail` and the lead, hunt and audit by-id procedures now check that the row belongs to a scope the caller may use; before, a lead id from any scope was accepted
- A contact write with no team named and no personal access is refused instead of landing in the caller's first team
- The Registre snapshot fetch times out after 10 s, streams the body with a 16 MiB cap, refuses redirects, and requires an https `OIDC_ISSUER` in production. The sync nudge is rate limited to 30 requests a minute per IP
- Account takeover: password sign-up and sign-in are off whenever OIDC is configured (not only under `SSO_ONLY`), `auth.register` needs a session, and an SSO sign-in links to an existing local account by email only when Glouton verified that email (earlier SSO sign-in, directory sync, or an admin's "verify email"). An unverified match is refused until an admin verifies it. The Registre directory sync follows the same rule: it skips, and logs, a member whose email matches an unverified local account instead of linking it
- The plan gate fails closed on a procedure whose input schema it cannot read (union, intersection, array, primitive) unless the procedure is cross-scope; `contact.addNote` now takes a plain object input
- The paywall only links to https upgrade URLs

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
