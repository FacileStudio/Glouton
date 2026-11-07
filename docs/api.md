# Glouton — API

The tRPC router tree is the API. Every procedure is reachable at
`POST|GET /trpc/<path>` — through the public frontend on port 3000, which proxies `/trpc` to the
backend. A handful of plain HTTP routes sit beside it. Generated from `packages/trpc/src/` and
`apps/backend/src/index.ts`.

## Access levels

| Level | Middleware | Requirement |
|---|---|---|
| public | logging | none |
| protected | logging, `isAuthed` | `Authorization: Bearer <jwt>` |
| human | logging, `isAuthed`, `isHuman` | a Glouton session JWT; any delegated (agent) token gets `FORBIDDEN` |
| admin | logging, `isAuthed`, `isHuman`, `isAdmin` | the above plus `role = ADMIN` |

`createContext` first verifies the bearer as a Glouton session JWT. If that fails and OIDC is
configured, it tries a Registre delegated token (see "Delegated tokens" below) and sets
`ctx.actor` from its `act` claim. A delegated caller needs `glouton.read` for queries and
`glouton.write` for mutations. Human-only procedures: `email.sendEmail`, `email.sendDraft`,
`inbox.decideSuggestion`, `inbox.discardDraft`, `contact.merge*`, `contact.delete*`, every
`user` and `team` settings, SMTP and webhook mutation, `lead.query.delete`, `lead.hunt.delete`
and `companyCreation.convertToLead`.

The token is a bearer header only — there is no cookie fallback in `createContext`. Failures come
back as tRPC errors: `UNAUTHORIZED` ("Please log in."), `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`.
Stacks are stripped in production.

Many procedures take an optional `teamId`. Omit it and the call is scoped to the caller's personal
data; supply it and the call is scoped to that team, subject to the caller's membership.

A Scalar API reference is served at `GET /docs`, over an OpenAPI document at
`GET /docs/openapi.json` — the same two paths every Facile backend uses.

The document is produced by `trpc-to-openapi` from the tRPC router, but **no procedure declares
`.meta({ openapi: … })`**, so it currently ships an empty `paths` object. It does not document the
tRPC procedures above, and it does not document the plain Hono routes below either. Adding
`openapi` meta to the procedures you want exposed is what fills it in.

## `auth`

| Procedure | Type | Level | Input |
|---|---|---|---|
| `login` | mutation | public | `{ email, password }`, password min 8 |
| `register` | mutation | public | login fields plus `{ firstName, lastName, confirmPassword }`, refined so the passwords match |
| `me` | query | protected | `{}` |
| `logout` | mutation | protected | `{}` |

Sign-in goes only through Registre OIDC (`/auth/oidc`); the callback hands the client a JWT in the URL fragment, which it sends as a bearer header. There is no password login, register or change-password procedure. There is no refresh procedure; the token simply lasts 7 days. `logout` is client-side only.

## `user`

| Procedure | Type | Level | Input |
|---|---|---|---|
| `me` | query | protected | — |
| `getConfiguredSources` | query | protected | `{ teamId? }?` |
| `updateProfile` | mutation | protected | `{ firstName?, lastName? }` |
| `changePassword` | mutation | protected | `{ currentPassword, newPassword }`, new min 8 |
| `deleteOwnAccount` | mutation | protected | — |
| `getSmtpConfig` | query | protected | — |
| `updateSmtpConfig` | mutation | protected | `{ smtpHost?, smtpPort?, smtpSecure?, smtpUser?, smtpPass?, smtpFromName?, smtpFromEmail? }` |
| `testSmtpConfig` | mutation | protected | the same fields, all required — sends a live test |
| `list` | query | admin | `{ status?: 'all' \| 'active' \| 'suspended' \| 'banned' \| 'pending', role?: 'all' \| 'admin' \| 'user', emailVerified?, isPremium? }?` |
| `getById` | query | admin | `{ id }` |
| `getStats` | query | admin | — |
| `update` | mutation | admin | `{ id, isPremium?, role?: 'USER' \| 'ADMIN' }` |
| `ban` / `unban` | mutation | admin | `{ id, reason }` / `{ id }` |
| `suspend` / `unsuspend` | mutation | admin | suspension fields / `{ id }` |
| `verifyEmail` | mutation | admin | `{ id }` |
| `delete` | mutation | admin | `{ id }` |
| `bulkDelete` | mutation | admin | `{ ids: string[] }` |

`smtpPort` is validated 1–65535 and `smtpFromEmail` must be a valid address. Stored SMTP
passwords are encrypted through `ctx.auth`.

## `lead`

A namespace of five sub-routers. Every procedure is protected.

### `lead.query`

| Procedure | Type | Input |
|---|---|---|
| `list` | query | `{ teamId?, status?: 'HOT' \| 'WARM' \| 'COLD', search?, country?, city?, category?, businessType?: 'DOMAIN' \| 'LOCAL_BUSINESS', contacted?, hasWebsite?, hasSocial?, hasPhone?, hasGps?, hasEmail?, sortBy?, sortOrder?, page?, limit? }?` |
| `getById` | query | `{ leadId }` (uuid) |
| `delete` | mutation | `{ leadId }` (uuid) |
| `getStats` | query | `{ teamId? }?` |
| `getActiveSessions` | query | `{ teamId? }?` |

`sortBy` accepts `domain`, `email`, `city`, `country`, `score`, `status` or `createdAt`.
`category` is one of 27 business categories, from `restaurant` and `cafe` through the agency
types (`seo-agency`, `design-agency`, `web-dev-agency`, `marketing-agency`) to `other`.

### `lead.hunt`

| Procedure | Type | Input |
|---|---|---|
| `startLocalBusiness` | mutation | `{ teamId?, location, categories[] (min 1), hasWebsite?, radius? (100–50000), maxResults? (1–500) }` |
| `list` | query | `{ teamId? }?` |
| `getStatus` | query | `{ huntSessionId }` (uuid) |
| `cancel` | mutation | `{ huntSessionId }` (uuid) |
| `delete` | mutation | `{ huntSessionId }` (uuid) |
| `getRunDetails` | query | `{ huntSessionId }` (uuid) |
| `getRunEvents` | query | `{ huntSessionId, level?: 'info' \| 'warning' \| 'error' \| 'success', category?: 'system' \| 'source' \| 'lead' \| 'enrichment', page = 1, limit = 50 (max 100) }` |

`startLocalBusiness` creates a `HuntSession` and enqueues a BullMQ job; it returns immediately.
Poll `getStatus` or subscribe to `/ws` for progress. `radius` is in meters.

### `lead.audit`

| Procedure | Type | Input |
|---|---|---|
| `start` | mutation | `{ teamId? }?` — audits the scope's un-audited leads |
| `list` | query | `{ teamId?, leadId?, limit = 10 (max 100), offset = 0 }?` |
| `cancel` | mutation | `{ auditSessionId }` (uuid) |

### `lead.favorite`

| Procedure | Type | Input |
|---|---|---|
| `toggle` | mutation | `{ leadId }` (uuid) |
| `list` | query | `{ teamId?, page?, limit? }` |
| `isFavorite` | query | `{ leadId, teamId? }` |

### `lead.importExport`

| Procedure | Type | Input |
|---|---|---|
| `exportToCsv` | query | `{ teamId?, leadIds?, status?, search?, country?, city? }` |
| `importFromCsv` | mutation | `{ csvContent (max 5 MB), huntSessionId?, teamId? }` |

Import runs as a background job; export is synchronous and returns the CSV body.

## `email`

All protected.

| Procedure | Type | Input |
|---|---|---|
| `getTemplates` | query | — the built-in outreach templates |
| `getSmtpStatus` | query | `{ teamId? }?` — `{ configured: boolean }` |
| `previewEmail` | query | `{ templateId, variables: Record<string, string> }` |
| `sendEmail` | mutation | `{ teamId?, leadId, templateId, variables }` |
| `getLeadOutreach` | query | `{ leadId, teamId? }` |
| `getStats` | query | `{ teamId? }?` |
| `getAllOutreach` | query | `{ teamId? }?` |

Template variables are capped at 1000 characters each and rejected if they contain `\r` or `\n` —
that is header-injection defense, so do not relax it. Sending writes an `EmailOutreach` row and
increments the lead's `emailsSentCount`.

`sendDraft` (human) takes `{ id }`. It re-verifies the recipient address, then hands the mail to
`sendOutreach` in `modules/email/transport.ts`, the single transport seam (SMTP today). Legacy
`sendEmail` goes through the same seam. Draft rows are left out of `getStats` and
`getAllOutreach`.

## `contact`

Companies and people. Lists take `{ teamId?, q?, stage?, temperature?, origin?, limit (1-100,
default 25), offset }` and are scoped like other modules; reads and writes by id see the personal
scope plus every team the caller belongs to. Deleted rows (`deletedAt`) never come back.

| Procedure | Type | Level | Input |
|---|---|---|---|
| `listCompanies`, `listPeople`, `search` | query | protected | list filters |
| `getCompany` | query | protected | `{ id }`: company, people, last 50 activities, open suggestions, last 20 outreach |
| `getPerson` | query | protected | `{ id }`: person, company, activities, open suggestions, outreach |
| `createCompany` | mutation | protected | name plus optional fields and `people[]`; origin `MANUAL`, or `AGENT` for a delegated caller |
| `updateCompany`, `updatePerson` | mutation | protected | `{ id, data }`; a stage change logs a `stage.changed` activity |
| `createPerson` | mutation | protected | person fields plus `companyId?`, `teamId?` |
| `changeStage` | mutation | protected | `{ companyId? or personId?, stage }` |
| `addNote` | mutation | protected | `{ companyId? or personId?, text }`, logged as a `note` activity |
| `checkDuplicates` | query | protected | `{ email?, domain?, siret? }` |
| `outreach` | query | protected | `{ companyId? or personId? }` |
| `mergeCompanies`, `mergePeople` | mutation | human | `{ targetId, sourceId }`; moves people, activities, suggestions and outreach, then soft-deletes the source |
| `deleteCompany`, `deletePerson` | mutation | human | `{ id }`; soft delete, a company takes its people with it. A linked Ardoise client is unlinked there, never deleted |

Hunts, CSV imports and company-creation conversions still write `Lead`, and now also mirror each
new lead into a `Company` (plus a `Person` when the lead has a name or email), linked by
`legacyLeadId`.

## `ardoise`

| Procedure | Type | Level | Input |
|---|---|---|---|
| `status` | query | protected | `{ enabled, webUrl }`: whether the sync is configured, and the Ardoise web URL |
| `turnIntoClient` | mutation | human | `{ companyId, billingPersonId, fill?: { firstName?, lastName?, email?, siret?, vatNumber?, addressLine?, postalCode?, city?, country? } }` |
| `unlink` | mutation | human | `{ companyId }`: unlinks on both sides, deletes nothing |

`turnIntoClient` fills the empty fields from `fill`, then needs a billing person with a first and a
last name (Ardoise requires both; `BAD_REQUEST` otherwise). It creates the client in Ardoise in
the space whose `registreSpaceId` matches the company's team, marks the person as the billing
contact, moves the company to `CLIENT` and logs `ardoise.client.linked`. When Ardoise has no such
space it answers 422 `unknown_space`; Glouton returns `BAD_REQUEST` with that reason and logs an
`ardoise.sync_failed` activity. It never retries without the space.

Once linked, an edit of the company's name, SIRET, VAT number or address, or of the billing
person's names or email, queues a push. The push waits 10 seconds after the last edit, then PUTs
the current state with `updatedAt` = the later of the company's and the person's `updatedAt`.
When Ardoise holds a newer version it answers `skipped`, and Glouton fetches that version and
applies it. Edits made through `/api/agent/*` sync the same way.

## `inbox`

| Procedure | Type | Level | Input |
|---|---|---|---|
| `counts` | query | protected | `{ drafts, suggestions, total }` |
| `drafts` | query | protected | open drafts (EmailOutreach `DRAFT`) |
| `suggestions` | query | protected | `{ status = OPEN }?` |
| `createDraft` | mutation | protected | `{ personId, subject, text, html?, rationale? }`; broadcasts `draft:new` |
| `updateDraft` | mutation | protected | `{ id, data: { subject?, text?, html?, rationale? } }`, only while `DRAFT` |
| `discardDraft` | mutation | human | `{ id }` |
| `createSuggestion` | mutation | protected | `{ kind, title, body?, rationale?, companyId?, personId?, teamId?, payload? }`; broadcasts `suggestion:new` |
| `decideSuggestion` | mutation | human | `{ id, decision: ACCEPT or DISMISS }` |

Accepting applies the suggestion: `RESCORE` sets the company's `temperature` and `score` from the
payload, `MATCH` links an Ardoise client (`payload.ardoiseClientId`, filled from `payload.client`
and pushed back to Ardoise) or a person to a company,
`IMPORT` creates a person from the payload, `NEXT_ACTION` logs a note, and `DRAFT` or `FOLLOW_UP`
with `payload.subject` and `payload.text` creates a draft. Accepting never sends anything.
Dismissing an Ardoise `MATCH` creates a new client company from `payload.client` instead.

## `team`

All protected; authorization is by team role, checked in
`packages/trpc/src/modules/team/permissions.ts`.

| Procedure | Type | Input |
|---|---|---|
| `list` | query | — |
| `get` / `getStats` / `getMembers` | query | `{ teamId }` |
| `create` | mutation | `{ name (1–100), description? (max 500) }` |
| `update` | mutation | `{ teamId, name?, description? }` |
| `delete` | mutation | `{ teamId }` |
| `addMember` | mutation | `{ teamId, email, role: 'ADMIN' \| 'MEMBER' }` |
| `removeMember` | mutation | `{ teamId, userId }` |
| `updateMemberRole` | mutation | `{ teamId, userId, role: 'ADMIN' \| 'MEMBER' }` |
| `leave` | mutation | `{ teamId }` |
| `getSmtpConfig` | query | `{ teamId }` |
| `updateSmtpConfig` | mutation | `{ teamId }` plus the SMTP fields |
| `testSmtpConfig` | mutation | the SMTP fields — sends a live test |
| `listWebhooks` | query | `{ teamId }` |
| `createWebhook` | mutation | `{ teamId, name (1–100), url, events[] (min 1), enabled? }` |
| `updateWebhook` | mutation | `{ teamId, webhookId }` plus a partial |
| `deleteWebhook` | mutation | `{ teamId, webhookId }` |
| `testWebhook` | mutation | `{ teamId, url }` |

`OWNER` is deliberately excluded from the role enums — a team has exactly one owner and it is set
at creation. Webhook URLs must be `http(s)` and at most 2000 characters. Subscribable events are
`opportunity.new`, `hunt.completed`, `hunt.failed`, `audit.completed`, `team.member_added` and
`team.member_removed`.

## `opportunity`

All protected. Freelance missions scraped from public boards.

| Procedure | Type | Input |
|---|---|---|
| `list` | query | `{ page = 1, limit = 30 (max 100), search?, tier?: 'HOT' \| 'WARM' \| 'COLD', category?, source?, remoteOnly?, minScore? (0–100), sortBy = 'relevanceScore', sortOrder = 'desc' }` |
| `get` | query | `{ id }` |
| `markClicked` | mutation | `{ id }` — records an `OpportunityView` |
| `stats` | query | — |
| `triggerScrape` | mutation | — runs the scraper now, outside the 3-hour schedule |

`sortBy` accepts `relevanceScore`, `postedAt`, `createdAt`, `budgetMax` or `applicantCount`.
`category` is one of 22 `OpportunityCategory` values and `source` one of 21
`OpportunitySource` platforms.

## Plain HTTP routes

| Method | Path | Auth | Proxied publicly | What it does |
|---|---|---|---|---|
| `GET` | `/auth/config` | none | yes | `{ oidc_enabled }` |
| `GET` | `/auth/oidc` | none | yes | Starts the OIDC flow, setting an `oidc_state` cookie with a 10 minute TTL. Registered only when OIDC is enabled |
| `GET` | `/auth/oidc/callback` | state cookie | yes | Verifies `state`, exchanges the code, verifies the id token against the cached JWKS, upserts the user, redirects to `OIDC_SUCCESS_URL#token=<jwt>` |
| `GET` | `/version` | none | yes | `{ version }` from the root `package.json` |
| `POST` | `/api/registre/deletions` | signed secevent+jwt | yes | Registre's GDPR deletion push; verified RS256 against Registre's JWKS, erases the person, answers 202. Glouton also polls `GET /api/directory/deletions` every five minutes |
| `GET` | `/docs` | none | yes | Scalar API reference UI |
| `GET` | `/docs/openapi.json` | none | yes | Generated OpenAPI document |
| `GET` | `/ws` | bearer | **no** | Bun WebSocket for live hunt, audit and lead events |
| `GET` | `/internal/ws-status` | `x-internal-secret` | **no** | Connected users and socket counts |
| `POST` | `/internal/broadcast` | `x-internal-secret` | **no** | `{ message, userId? , broadcastAll? }` — emits to one user or everyone |
| `GET` | `/health/live` | none | **no** | Liveness |
| `GET` | `/health/ready` | none | **no** | Readiness, checks Prisma |
| `GET` | `/` | none | **no** | `{ message: "Welcome to the Glouton's API !" }` |
| any | `/api/agent/*` | bearer | yes | Agent REST API, see below |
| `POST` | `/api/integrations/ardoise/webhook` | HMAC signature | yes | Ardoise events, see below |

The "proxied publicly" column matters: `apps/frontend/server.js` forwards only `/trpc`,
`/auth/config`, `/auth/oidc`, `/docs/*`, `/api/registre/sync`, `/api/agent/*` and
`/api/integrations/ardoise/webhook`. Everything else is reachable only from
inside the Docker network. `x-internal-secret` is compared against `ENCRYPTION_SECRET`, the same
value that signs JWTs.

The WebSocket carries `hunt:progress`, `audit:progress` and `lead:new` events, emitted per user
through `broadcastToUser` or to everyone through `broadcastToAll`.

The stream also carries `draft:new` and `suggestion:new` (to the user, or every member of the
team the row belongs to), which refresh the inbox badge.

## Ardoise webhook

`POST /api/integrations/ardoise/webhook` receives Ardoise's events. Body:
`{ id, event, occurredAt, data }`. Headers: `X-Ardoise-Event`, `X-Ardoise-Delivery` and
`X-Ardoise-Signature-256: sha256=<hex HMAC-SHA256 of the raw body with ARDOISE_WEBHOOK_SECRET>`.

| Answer | When |
|---|---|
| 404 `not_configured` | the sync is off |
| 401 `invalid_signature` | the signature is missing or wrong |
| 400 `invalid_payload` | the body is not an event |
| 200 `{ data: { outcome: "duplicate" } }` | this `X-Ardoise-Delivery` was already handled; Ardoise retries reuse the id |
| 202 `{ data: { outcome } }` | handled, including no-ops (`ignored`, `skipped`, `no_owner`) |
| 500 | the event failed; the delivery id is released so Ardoise's retry runs again |

Delivery ids are kept 30 days in `ArdoiseDelivery`.

| Event | What Glouton does |
|---|---|
| `client.created`, `client.updated` | A linked company (by `gloutonCompanyId` or `ardoiseClientId`) takes the client's name, SIRET, VAT number and address, and its billing person the contact, unless `updatedAt` is not later than `Company.ardoiseUpdatedAt`. An unlinked client is matched in the team whose `registreSpaceId` matches, else in the personal scope of `ARDOISE_DEFAULT_OWNER_EMAIL`: same SIRET or same contact email links it at once; same email domain (webmail excluded) or a very similar name opens a `MATCH` suggestion; otherwise Glouton creates a `CLIENT` company with origin `ARDOISE` and its billing person. A link or a create is then pushed back so Ardoise stores `gloutonCompanyId`. A client unlinked in Glouton is not imported again |
| `client.deleted` | Unlinks the company and logs `ardoise.client.unlinked`. Nothing is deleted and the stage stays |
| `mission.quote_generated`, `mission.quote_accepted`, `mission.invoice_generated`, `mission.payment_created` | Logs `ardoise.<event>` on the company linked to `data.clientId`, with the amount, document number and Ardoise link. `quote_accepted` also moves the company to `CLIENT`. Events for an unlinked client are ignored |

## Delegated tokens

Bulle reaches Glouton with a Registre RFC 8693 token-exchange access token. The backend
(`apps/backend/src/services/delegated.ts`) accepts it when:

- the signature checks against the issuer JWKS found through OIDC discovery
- `iss` is `OIDC_ISSUER` (with or without a trailing slash), `aud` is `OIDC_CLIENT_ID`, and
  `exp` and `sub` are present and valid
- `scope` (or `scp`) holds `glouton.read` or `glouton.write`
- the user is found by `Account` (`providerId` = issuer, `accountId` = `sub`), or else by the
  `email` claim when `email_verified` is `true`, and is not banned

The `act` claim's `sub` (else `azp`) becomes the actor, recorded on activities and as a
suggestion's `createdBy`. Any delegated caller is refused on human-only procedures.

## Agent REST API (`/api/agent`)

JSON over HTTP for agents. Bearer is a Registre delegated token or a Glouton session JWT. `GET`
needs `glouton.read`, every other method `glouton.write` (session JWTs carry no scopes and pass).
Responses are `{ "data": ... }` or `{ "error": { "code", "message" } }` with 400 (`VALIDATION`,
`BAD_REQUEST`), 401, 403, 404, 409 or 500. Lists default to 25 rows, max 100. Reads see the
personal scope plus every team the user belongs to; creates may carry `teamId`.

**No route sends mail.** Drafts wait in the Glouton inbox until a person clicks Send.

| Method | Path | Body or query | Returns |
|---|---|---|---|
| `GET` | `/api/agent/contacts` | `?q=&stage=&temperature=&limit=` | `[{ type: company or person, id, name, email?, companyName?, stage, temperature?, score?, city?, lastContactedAt? }]` |
| `GET` | `/api/agent/companies/{id}` | | company, `people`, last 50 `activities`, open `suggestions`, `outreach`, `auditSummary` (flat fields of the website audit) |
| `GET` | `/api/agent/people/{id}` | | person, `company`, `activities`, `suggestions`, `outreach` |
| `GET` | `/api/agent/outreach` | `?companyId=&personId=&limit=` | `[{ id, status, subject, origin, personId, companyId, sentAt, repliedAt, createdAt }]` |
| `POST` | `/api/agent/companies` | `{ name, domain?, website?, city?, country?, stage?, notes?, teamId?, people?: [{ firstName?, lastName?, email?, role?, phones? }] }` | 201, the company with `people`, origin `AGENT` |
| `PATCH` | `/api/agent/companies/{id}` | subset of `{ name, domain, website, city, country, stage, notes, temperature, score }` | the company |
| `POST` | `/api/agent/people` | `{ firstName?, lastName?, email?, role?, phones?, notes?, stage?, companyId?, teamId? }` | 201, the person, origin `AGENT` |
| `PATCH` | `/api/agent/people/{id}` | same fields, all optional | the person |
| `POST` | `/api/agent/drafts` | `{ personId, subject, text, html?, rationale? }` | 201, an `EmailOutreach` with status `DRAFT`, origin `AGENT` |
| `PATCH` | `/api/agent/drafts/{id}` | `{ subject?, html?, text?, rationale? }` | the draft; 409 once it is no longer a draft |
| `POST` | `/api/agent/suggestions` | `{ kind, title, body?, rationale?, companyId?, personId?, teamId?, payload? }` | 201, the suggestion (`RESCORE` payload: `{ temperature?, score? }`) |
| `GET` | `/api/agent/suggestions` | `?status=OPEN` | suggestions with company and person names |

The API stores domains normalised (`https://www.Acme.io/x` becomes `acme.io`) and emails lowercased.

## Subscription gate

`packages/trpc/src/modules/forfait` mirrors porte/forfait: values are a JSON bool or an integer
limit (`-1` unlimited); a missing or malformed value reads as the feature default. Glouton reads
one feature, `glouton.access` (default `false`).

Storage, written inside `applySnapshot`'s transaction:

| Where | What |
|---|---|
| `Team.entitlements` | The values of the Registre space the team mirrors; `{}` when the space has none |
| `PersonEntitlement` | The values of `people[]`, keyed by Registre `sub`, so a person entitled before their first sign-in is covered |
| `ForfaitState` | One row, written by the first snapshot with `entitlements_revision > 0`; holds the highest version and revision applied |

Rules:

- No `ForfaitState` row: every scope is allowed, with one warning per process.
- A snapshot without `entitlements_revision` changes nothing. A snapshot whose version or revision is lower than the stored one is ignored.
- Otherwise the snapshot is the whole truth: linked teams take their space's values, people absent from it lose theirs. Teams not linked to a Registre space have no values and so no access.

Enforcement points:

| Where | Check |
|---|---|
| tRPC middleware on every procedure builder | Runs on the input as the procedure parses it. `meta.forfait.row` (lead, hunt, audit by-id procedures, `email.sendEmail` and `email.sendToLead`): the row's scope; a declared `teamId` must match the row's team, and another person's personal row reads as `NOT_FOUND`. Else a declared `teamId`: member of that team (else `FORBIDDEN`) and team access. Else personal access, except the `CROSS_SCOPE` list (`inbox.*`, `contact.*`, `ardoise.*`, `assistant.write`, `assistant.nextAction`, `opportunity.*`, `companyCreation` reads, `email.sendDraft`, `email.getTemplates`, `email.previewEmail`, `user.getConfiguredSources`), which needs one scope with access. A procedure whose input has an id key (`id`, `ids`, `*Id`, `*Ids` other than `teamId`) must declare `row` or `ids: 'scoped' \| 'unscoped'`, or it is refused; `forfait-scope.test.ts` checks every procedure. An input schema that is not a (wrapped) object, such as a union, intersection or array, is refused unless the procedure is cross-scope |
| `ACCOUNT` list | `user.updateProfile`, `user.changePassword`, `user.deleteOwnAccount`, `user.*SmtpConfig`, `team.leave`, `team.delete`: a session, no plan (the procedures check membership and ownership) |
| `meta.forfait.free` | Reading, exporting and deleting existing data (`lead.query.*` reads and `delete`, `lead.favorite.list`/`isFavorite`, `exportToCsv`, `lead.hunt` reads and `delete`, contact reads and deletes, `team.get`/`getMembers`): same scope and membership checks, no plan; runs with `ctx.planMode = 'free'` |
| `resolveScope` | The same team or personal check, for every scoped router |
| `accessForUser` | Drops the personal scope and teams without access from cross-scope reads |
| `/api/agent/*` | `402` when no scope has access |
| Workers | `local-business-hunt`, `lead-audit`, `csv-import` skip jobs of scopes without access; Courrier reply sync and contact import skip those scopes |

The opportunity and company-creation scrapers fill shared catalogs owned by no scope and keep running.

A refusal is `TRPCError` code `PAYMENT_REQUIRED` (HTTP 402) with message
`Glouton is part of the Pro and Studio plans.` and `data.upgrade_url`. The web client sends any
402 to `/app/paywall`, which reads `forfait.status` for the current scope.
