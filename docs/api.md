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
| admin | logging, `isAuthed`, `isAdmin` | the above plus `role = ADMIN` |

The token is a bearer header only — there is no cookie fallback in `createContext`. Failures come
back as tRPC errors: `UNAUTHORIZED` ("Please log in."), `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`.
Stacks are stripped in production.

Many procedures take an optional `teamId`. Omit it and the call is scoped to the caller's personal
data; supply it and the call is scoped to that team, subject to the caller's membership.

An OpenAPI document is generated from the router (`trpc-to-openapi`) and served at
`GET /openapi.json`, with a Scalar reference UI at `GET /docs`.

## `auth`

| Procedure | Type | Level | Input |
|---|---|---|---|
| `login` | mutation | public | `{ email, password }`, password min 8 |
| `register` | mutation | public | login fields plus `{ firstName, lastName, confirmPassword }`, refined so the passwords match |
| `me` | query | protected | `{}` |
| `logout` | mutation | protected | `{}` |

`login` and `register` return a JWT in the response body — the client stores it and sends it as a
bearer header. There is no refresh procedure; the token simply lasts 7 days. `logout` is
client-side only. `/trpc/auth.login` and `/trpc/auth.register` each sit behind their own rate
limiter.

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
| `GET` | `/auth/config` | none | yes | `{ sso_only, oidc_enabled }`, so the login page knows whether to show the password form |
| `GET` | `/auth/oidc` | none | yes | Starts the OIDC flow, setting an `oidc_state` cookie with a 10 minute TTL. Registered only when OIDC is enabled |
| `GET` | `/auth/oidc/callback` | state cookie | yes | Verifies `state`, exchanges the code, verifies the id token against the cached JWKS, upserts the user, redirects to `OIDC_SUCCESS_URL#token=<jwt>` |
| `GET` | `/openapi.json` | none | yes | Generated OpenAPI document |
| `GET` | `/docs` | none | yes | Scalar API reference UI |
| `GET` | `/ws` | bearer | **no** | Bun WebSocket for live hunt, audit and lead events |
| `GET` | `/internal/ws-status` | `x-internal-secret` | **no** | Connected users and socket counts |
| `POST` | `/internal/broadcast` | `x-internal-secret` | **no** | `{ message, userId? , broadcastAll? }` — emits to one user or everyone |
| `GET` | `/health/live` | none | **no** | Liveness |
| `GET` | `/health/ready` | none | **no** | Readiness, checks Prisma |
| `GET` | `/` | none | **no** | `{ message: "Welcome to the Glouton's API !" }` |

The "proxied publicly" column matters: `apps/frontend/server.js` forwards only `/trpc`,
`/auth/config`, `/auth/oidc`, `/docs` and `/openapi.json`. Everything else is reachable only from
inside the Docker network. `x-internal-secret` is compared against `ENCRYPTION_SECRET`, the same
value that signs JWTs.

The WebSocket carries `hunt:progress`, `audit:progress` and `lead:new` events, emitted per user
through `broadcastToUser` or to everyone through `broadcastToAll`.
