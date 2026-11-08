# Changelog

All notable changes to this project are documented here. The format is
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While on
`0.x`, a breaking change bumps the minor.

Releases are tagged `v*` on `main`. Dokploy deploys from `main` on push, so a
tag records what shipped rather than triggering the deploy. The version lives
in the root `package.json`.

## [Unreleased]

### Added

- "AI draft" on a competitor card: Glouton fetches the competitor's homepage and up to two pricing or offer pages (watched ones first, then links found on the homepage) through websearch, which counts against the daily fetch quota, and asks Bulle for a battlecard in the existing fields (overview, why we win, why we lose, objections, landmines, pricing, proof points) in the interface language. The proposal is shown field by field: Accept saves that field only (a list keeps your items and adds the new ones; a text field shows the current text next to the proposal first), Discard drops it. Nothing is saved without an Accept.
- AI summaries of competitor page changes: one or two sentences on what changed and why it matters, shown on the change timeline and carried by each item of the daily digest (in the app and in the `competitor.changes` webhook, so Antenne gets it). Summaries are written lazily, cached on the change, only for spaces with `ai.access`, and capped per space and UTC day by the new plan limit `glouton.ai_summaries_daily` (default 40, attempts count, so a failing model is not retried all day).
- Price extraction: "Extract prices" reads the latest stored copy of the competitor's watched pricing pages (or fetches the pricing page found on its homepage) and lists each price with name, amount, currency, unit and period, on the card and in the compare view, with a link to the source page and to the stored copy it was read from.
- tRPC `competitorAi.*` (`draft`, `summarize`, `extractPrices`, `prices`, `snapshot`). Every call works inside the competitor's scope, and every model call goes through Bulle; a space without `ai.access` gets the plan upsell with its upgrade link before any web fetch.
- Migration `028_competitor_ai.sql` (additive): `PageChange.aiSummary` and `aiSummaryAt`, table `CompetitorPrice`, enum `CompetitorPricePeriod`.

### Security

- Competitor page text sent to Bulle is untrusted data: it sits in delimited data blocks that page text cannot close, the prompt tells Bulle to ignore instructions inside them, and Bulle's JSON is validated strictly (unknown keys, wrong types or ids reject the whole answer with a clear error, never a partial result). Model output only fills a proposal or the price list; it never triggers any other action.

## [0.14.2] - 2026-11-08

### Fixed

- The frontend image installs `@repo/websearch` again, which `@repo/webhooks` now depends on. Without it the v0.14.1 image build failed at `bun install`, so v0.14.1 never deployed; this release ships its security fix.

## [0.14.1] - 2026-11-08

### Security

- Team webhooks can no longer make the backend reach internal addresses (SSRF). Create, update, "Send a test" and every delivery now refuse URLs with credentials, `localhost`, single-label or internal names (`.local`, `.internal`, `.lan`, ...), and loopback, private, link-local, CGNAT, ULA, multicast and reserved IPv4/IPv6 addresses.
- Every delivery resolves the webhook host first and refuses it when any address is internal, then connects to that checked address only, so DNS rebinding cannot redirect it. Redirects are never followed: a 3xx answer counts as a failed delivery.
- The URL guard now lives in one helper (`checkPublicUrl`, `resolvePublicAddress` in `@repo/websearch`) shared by websearch fetches and webhooks. Websearch fetches also refuse hosts that resolve to internal addresses before sonar runs, and the guard gained the ranges it missed (192.0.0.0/24, documentation and benchmark ranges, 6to4, NAT64, the whole fe80::/10 and fec0::/10).
- A failed webhook delivery is now logged with the webhook id (never the URL).

## [0.14.0] - 2026-11-08

### Added

- Competitor discovery (`/app/competitors/suggestions`, also "Find competitors" on `/app/competitors`): Glouton searches from the space's prospecting profile and fills a suggestion queue. Sources: web searches through sonar (keywords and the offer with the area, plus "similar to our site" searches when the profile has a website), OpenStreetMap places of the space's own category around its area, and recent BODACC creations matching its NAF codes and area. Web searches count against the daily websearch quota; when it runs out, the run stops searching the web and goes on with the map and BODACC, and the queue says so.
- Each suggestion shows its score and why: 15 points per agreeing source (up to 45), up to 35 for the share of profile keywords its evidence mentions (a NAF match counts as full), and 20/12/6 points within 5/15/30 km or 15 when it is in the area. The evidence lines link to their source.
- Accept creates a competitor prefilled with the name, website, area and evidence (or links the competitor that already has that domain); "Accept all at N or more" does it in bulk; Reject keeps the row so that domain or SIREN never comes back. Suggestions are deduplicated against the space's competitors and every earlier suggestion. A "N new" badge on the Suggestions tab counts the ones nobody opened yet.
- Weekly discovery per profile: an hourly scan (`competitor-discovery-tick`, through `QueueManager.upsertScheduler`) queues one run a week for every profile that can search, at most 6 per scan and 3 minutes apart.
- BODACC watch: after each company creation scrape, new companies matching a profile's NAF codes and area become suggestions, with a notice in the app and a `competitor.new_registered` team webhook (Antenne). A profile's first pass only sets the cursor.
- Settings > Prospecting gains "Your website" and "Your own category", which discovery uses for similar-site and map searches. An empty profile shows a link to that page in the queue.
- Team settings gain a Webhooks tab for owners and admins: list, add with event checkboxes (including `competitor.changes`, `hunt.digest`, `hunt.schedule_paused` and `competitor.new_registered`), send a test, pause and delete. It uses the existing `team.*Webhook` procedures and their checks.
- tRPC `competitorDiscovery.*` (`list`, `counts`, `run`, `markSeen`, `accept`, `reject`, `restore`, `acceptAbove`). Every call works inside the declared scope; a suggestion id from another space reads as not found.
- Migration `026_competitor_discovery.sql` (additive): tables `CompetitorSuggestion` (unique per space and domain, and per space and SIREN) and `CompetitorDiscoveryState`, enums `CompetitorSuggestionSource` and `CompetitorSuggestionStatus`, and `TeamProspectProfile.website` and `ownCategory`.

## [0.13.0] - 2026-11-08

### Added

- Automatic hunts (`/app/hunts/schedules`): a local business hunt can repeat every day, week or month. Pick "Repeat" when you start a hunt, or press "Repeat" on a finished hunt. The list shows each schedule's last run, its new leads and its next run, with pause, resume, run now, frequency and delete.
- A scan every 15 minutes starts the due schedules as normal hunts linked to their schedule, at most 6 per scan and 2 minutes apart, so OpenStreetMap sees a slow trickle. A schedule whose previous run is still going is not started again. The existing deduplication keeps only new leads.
- After each run with new leads, a digest ("N new leads") appears in the app and goes to the team's webhooks as `hunt.digest`. After 3 failed runs in a row, the schedule pauses itself with a notice in the app and a `hunt.schedule_paused` webhook.
- Prospecting profile in Settings > Prospecting, one per space: offer, area, target categories, NAF codes and keywords. "Create the suggested hunts" adds one automatic hunt per target category around the area. Competitor discovery will read the same profile (`profileFor` in `@repo/trpc`).
- "Suggest segments" on the automatic hunts page: Bulle reads the profile and proposes segments, each one a weekly hunt in one click. It needs `ai.access`; without it, the page shows the plan limit with the upgrade link.
- Plan limit `glouton.hunt_schedules` (default 10, `-1` for unlimited) caps the enabled schedules of a space. Past it, the call answers 402 with `data.plan_limit`, like `glouton.watched_pages`.
- tRPC `huntSchedule.*` (`list`, `create`, `createFromSession`, `createFromProfile`, `update`, `pause`, `resume`, `runNow`, `delete`, `suggestSegments`) and `prospect.*` (`get`, `save`). The plan gate scopes `huntSchedule` rows like leads.
- Migration `025_automatic_hunts.sql` (additive): tables `TeamProspectProfile` and `HuntSchedule`, enum `HuntFrequency`, and `HuntSession.scheduleId` (set to null when the schedule is deleted).

## [0.12.0] - 2026-11-08

### Added

- Competitor website monitoring. On a competitor card, the "Pages suivies" panel adds, edits, pauses and removes watched pages (URL, optional CSS selector, kind pricing/offer/blog/jobs/other, alert threshold, default 5 %), and suggests the usual `/tarifs`, `/pricing`, `/offres`, `/blog` and `/recrutement` paths of the competitor's domain. A change history shows each recorded change with a readable line diff and a "mark as seen" action. The competitors list shows a "Veille" badge with the count of unseen changes.
- A daily `competitor-watch` job fetches each due page through `@repo/websearch` (it counts against the scope's daily fetch quota; once the quota is spent the remaining pages are skipped and the digest says how many), respects robots.txt (longest-match rules, crawl delay; a server error on robots.txt skips the site) and waits at least 10 s between two fetches on one host. It normalizes the text (dates, times, relative ages, tokens, tracking parameters, short cookie banner lines and whitespace), hashes it, diffs it against the last snapshot and records a change only above the page's threshold. It keeps the last 5 snapshots and 100 changes per page, and sends one digest per space: an in-app toast and, for teams, the `competitor.changes` webhook event (Antenne). Digests carry counts and URLs, never page text.
- Plan limit `glouton.watched_pages` (default 10 per space, -1 unlimited). Adding a page past it answers 402 with `plan_limit`, shown with muse's PlanLimit banner.
- tRPC `competitorWatch.*` (`pages`, `addPage`, `updatePage`, `deletePage`, `changes`, `markSeen`, `unseenCounts`), scoped through the competitor row like `competitor.*`.
- Migration `027_competitor_watch.sql` (additive): enum `WatchedPageKind`, tables `WatchedPage`, `PageSnapshot` and `PageChange`, deleted with their competitor.

## [0.11.0] - 2026-11-08

### Added

- Competitors (`/app/competitors`), per space with the same scoping and access checks as leads. Each competitor has a one-page battlecard: overview, why we win, why we lose, objection handling (objection, response, proof), landmines as questions to ask, pricing and proof points, plus website, area, NAF codes, tags, notes and an archived status. The list searches by name, domain, area or tag and filters by tag.
- `/app/competitors/[id]` shows the battlecard, the win rate with its won and lost counts (a caution under 5 closed deals), why the competitor won, and the leads won against it and lost to it.
- `/app/competitors/compare?ids=` puts 2 to 4 battlecards side by side.
- Lead win/loss: "Close the deal" on a lead records won or lost. A loss needs a reason (`LOST_TO_COMPETITOR`, price, no decision, no budget, timing, missing features, other); a loss to a competitor also needs the competitor and why it won. A win can name the competitor it beat. "Reopen" clears the outcome.
- tRPC `competitor.*` (`list`, `get`, `compare`, `create`, `update`, `delete`, `closeLead`, `reopenLead`). The plan gate scopes `competitor` rows like leads.
- Migration `024_competitors.sql` (additive): table `Competitor`, enums `CompetitorStatus`, `LeadOutcome`, `LeadLossReason` and `CompetitorLossReason`, and on `Lead` the columns `outcome`, `closedAt`, `lossReason`, `lostToCompetitorId`, `competitorLossReason` and `wonAgainstCompetitorId` (set to null when the competitor is deleted).

## [0.10.3] - 2026-11-08

### Added

- `@repo/websearch`: a typed sonar client with a Redis result cache and a per-team daily quota (`WEBSEARCH_DAILY_QUOTA`, default 50 searches; `WEBSEARCH_DAILY_FETCH_QUOTA`, default 200 fetches).
- The backend image ships sonar v0.13.0 (checksum verified) and chromium, with the sonar engine keys passed through the compose environment.

## [0.10.2] - 2026-11-07

### Changed

- `@facile/muse` v0.14.4 to v0.16.1. Buttons use the `secondary` and `ghost-danger` variants in place of the deprecated `outline` and `danger`.
- `GET /version` reads the version from the root `package.json` at runtime, so it matches the release tag without any deploy environment change. The `APP_VERSION` build argument and env are gone.

## [0.10.1] - 2026-11-07

### Changed

- `@facile/muse` v0.14.2 to v0.14.4: the language chosen in the user menu re-renders the whole UI without a reload.

## [0.10.0] - 2026-11-07
### Added

- The hunts, leads, contacts, outreach, settings, spaces, missions and company creations pages, the mail composer and the Bulle panel are now available in French, English, Spanish and German, through the same catalog as v0.9.0 (`lib/i18n/rows`). The French copy is the source of truth. Spanish and German need native review.
- Dates, times, relative times ("2 hours ago"), durations, percentages, amounts and plurals go through `Intl` in the session locale (`useFormat`, and plural messages in the catalog).
- When Bulle answers 402 (the plan has no `ai.access`), the assistant panel shows muse's `PlanLimit` with the upgrade link. `assistant.status` reports `plan_required` with the limit, and `assistant.write` and `assistant.nextAction` answer 403 with `data.plan_limit` instead of a 402, so the paywall redirect does not fire.
- Settings: `SettingsLayout` with Profile, Preferences, Mail, Subscription and Advanced. The old `appearance` and `account` addresses redirect to `preferences` and `mail`.
- `lib/i18n/rows.test.ts` fails when a translation drops a `{placeholder}` or is empty.

### Changed

- Bump `@facile/muse` from v0.13.0 to v0.14.2.
- The sidebar and mobile bar open muse's user menu (account, settings, subscription, language, theme, help, sign out). The language is saved in the `fc_locale` cookie and the theme in `localStorage` (`glouton.theme`), applied in `app.html` before first paint. A language chosen in the menu now wins over the locale Registre sends at sign-in.
- The subscription row of the user menu and the settings Subscription section link to Registre's spaces page (`https://sso.facile.studio/spaces`) and show `glouton.access` and `ai.access`. `forfait.status` returns `aiAccess`.
- Profile is read-only (name, photo and email come from Facile).

### Removed

- The cog next to the user card, the profile form, the in-settings sign-out and the settings tabs.

## [0.9.0] - 2026-11-07
### Added

- GDPR erasure. Glouton polls Registre's `GET /api/directory/deletions` every five minutes (a TypeScript port of porte/directory v0.3.0: persisted cursor, one-minute overlap, 60-day record of handled subjects, paging by 1000) and accepts Registre's signed push at `POST /api/registre/deletions` (RS256 `secevent+jwt` verified against Registre's JWKS). A deleted person loses their account, identities, tokens, personal leads, contacts and hunts, and their plan entitlement. Rows they authored inside a team are handed to a banned "deleted user" row, so the team keeps its data. A second call is a no-op. Register `https://glouton.facile.studio/api/registre/deletions` as Glouton's `deletion_uri` in Registre.
- `GET /version` serves the build's `APP_VERSION` (compose build arg and env).
- `users.locale`, filled from the OIDC `locale` claim (fr, en, es, de) and carried in the session. The UI follows it, then the `fc_locale` cookie, then `Accept-Language`.
- The UI is available in French, English, Spanish and German for the landing page, sign-in, callback, error pages, navigation and the paywall. Spanish and German need native review.
- `.github/workflows/ci.yml`: typecheck, lint, tests against Postgres, build, and filet.
- Migration `023_registre_only_sign_in.sql`: `User.locale` and the `DeletionState` table.

### Security

- A session token stops verifying as soon as its user row is gone, so an erased person's JWT (7-day lifetime) no longer works on tRPC, the agent API or the WebSocket.

### Changed

- Sign-in goes only through Registre. The login page is muse's `AuthScreen` with `SignInWithFacile`; the landing page uses `LandingHeader` and `LandingFooter`.
- Bump `@facile/muse` from v0.11.0 to v0.13.0 (borderless; the custom `Select`). The app's own borders and dividers are removed.
- The OIDC flow adds PKCE and a nonce in a signed state cookie, and the token call has a timeout and refuses redirects.
- An SSO sign-in now needs Registre to assert `email_verified`, matches the email case-insensitively, and refuses an account that already holds another subject of the same issuer (`?sso_error=identity_conflict`). It still refuses an unverified local account.
- `deleteOwnAccount` uses the same erasure as the Registre deletion.

### Removed

- Local sign-up and passwords: the `/register` page, `auth.login`, `auth.register` and `user.changePassword`, their rate limiters, the password form in settings, `SSO_ONLY`, and the local `/legal/*` pages (Registre publishes the legal pages; muse's footer links to them).

## [0.8.0] - 2026-11-06

### Added

- The landing page shows the live plans from the public catalog, with Glouton access highlighted and a note that the app is included in the Pro and Studio offers. The section stays hidden while the catalog is empty.

### Changed

- Bump `@facile/muse` from v0.7.4 to v0.11.0 and set the muse locale to French explicitly, since muse now defaults to English.

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
