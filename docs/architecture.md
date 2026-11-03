# Glouton — Architecture

How the four containers, the request path, the background job pipeline and the data model fit
together.

## Runtime topology

Only the frontend container is reachable from outside. It runs `apps/frontend/server.js`, a thin
Node HTTP server that forwards API paths to the backend and hands everything else to the
SvelteKit request handler. One public hostname, one Traefik router.

```
Internet ──▶ Traefik ──▶ glouton-frontend (:3000)  server.js
                              ├──▶ /trpc, /auth/config, /auth/oidc,
                              │    /docs/*              ─── proxied ───┐
                              └──▶ everything else  SvelteKit handler   │
                                                                        ▼
                                            glouton-backend (:3001)  Hono, not exposed
                                              ├──▶ /trpc/*      tRPC fetch adapter
                                              ├──▶ /auth/*      OIDC login and callback
                                              ├──▶ /ws          Bun WebSocket, live progress
                                              ├──▶ /internal/*  x-internal-secret only
                                              └──▶ /health/*    liveness, readiness
                                                     │                │
                                              Postgres 16       Redis 7 (BullMQ)
                                                                      │
                                                          workers run in-process
```

The backend has no `expose` and no `ports` in Compose. It is reachable only over the Docker
network, from the frontend container. That is deliberate: the browser never learns the API's
address, and the tRPC client is configured with the relative base URL `/trpc`.

The proxy list in `server.js` is explicit. A new public backend route must be added there or it
will 404 through the SvelteKit handler instead. `/ws` is **not** in that list — the WebSocket
upgrade is not proxied by `server.js`.

## Components

- `apps/backend` — Hono. Wires CORS from `DOMAIN`, request logging, security headers
  (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS on
  HTTPS), and rate limiters on `auth.login` and `auth.register`. Registers the BullMQ workers and
  the opportunity scraper schedule at startup, then serves.
- `apps/frontend` — SvelteKit with `adapter-node`, wrapped by `server.js`. Routes: `/login`,
  `/register`, `/auth/callback`, `/app/{leads,hunts,missions,outreach,teams,settings}`,
  `/legal/*`, and an SSE endpoint at `/api/events`.
- `packages/trpc` — the API. Six top-level routers; `lead` is itself a namespace of five
  sub-routers.
- `packages/jobs` — BullMQ `QueueManager` plus the workers. They run inside the backend process,
  not as separate containers.
- `packages/courrier` — the Courrier client: Registre refresh and token exchange, per-user token
  cache, accounts, send, search and contacts. Built once in `apps/backend/src/config.ts` and shared
  by tRPC and the workers; `null` when `COURRIER_URL` is unset.
- `packages/maps` — Overpass and Nominatim providers, query builders, deduplication.
- `packages/audit` — the website auditor and its four analyzers: technology, SEO, security,
  company info.
- `packages/webhooks` — outgoing team webhooks with a six-event catalog and a 10 second send
  timeout.

`packages/hunter` and `packages/lead-sources` exist as directories but contain no source — only
`node_modules`. They are leftovers from the paid-API era; the only live lead source is
OpenStreetMap.

## Request lifecycle

1. `server.js` decides: proxy to the backend, or render.
2. On the backend, `createContext` reads `Authorization: Bearer <token>` — **only** the header,
   there is no cookie fallback — and verifies it with `AuthManager.verifyToken`. The context
   carries `user`, `prisma`, a raw Bun `SQL` handle, `auth`, `env`, `jobs`, the event emitter, a
   child logger, the client IP and the user agent.
3. Procedure levels: `publicProcedure` (logging), `protectedProcedure` (adds `isAuthed`),
   `adminProcedure` (adds `isAdmin` via `hasAccess(ctx.user, UserRole.ADMIN)`).
4. Anything long-running enqueues a BullMQ job and returns immediately with a session id.

## Background jobs

The workers are all registered in `apps/backend/src/services/register-workers.ts` and processing
in the backend process against Redis.

| Worker | Triggered by | Does |
|---|---|---|
| `local-business-hunt` | `lead.hunt.startLocalBusiness` | Overpass search around a geocoded location, filtered by category and radius, deduplicated, scored, written as `Lead` rows |
| `lead-audit` | `lead.audit.start` | Fetches each lead's site, runs the analyzers, updates `websiteAudit` and `score` |
| `csv-import` | `lead.importExport.importFromCsv` | Parses and upserts leads, max 5 MB of CSV |
| `opportunity-scraper` | a 3-hour scheduler, plus `opportunity.triggerScrape` | Scrapes 21 public freelance boards into `Opportunity` |
| `courrier-reply-sync` | a 15-minute scheduler, when Courrier is configured | Marks Courrier outreach `REPLIED` when the recipient wrote back |
| `courrier-contacts-import` | a daily scheduler, when Courrier is configured | Proposes unknown Courrier contacts as `IMPORT` suggestions |

Lifecycle: the mutation creates a `HuntSession` or `AuditSession` with status `PENDING`, enqueues
the job, and the worker moves it through `PROCESSING` to `COMPLETED`, `FAILED` or `CANCELLED`
while writing `HuntSessionEvent` rows and emitting progress. Progress reaches the browser through
`/ws` — per-user connection tracking with `broadcastToUser` and `broadcastToAll`.

Two janitors run alongside: `checkOrphanedSessions` at startup, and `cleanupStalled` every 30
minutes, both reconciling database sessions against the queue. The opportunity scraper is
scheduled idempotently with `upsertScheduler` plus one immediate run five seconds after boot.

`/internal/ws-status` and `/internal/broadcast` allow an operator to inspect and drive the socket
layer. They are authenticated by an `x-internal-secret` header compared against
`ENCRYPTION_SECRET` — the same secret that signs JWTs. Never expose those paths publicly; the
`server.js` proxy list correctly omits them.

## Data model

PostgreSQL 16 through Prisma 7, schema split across `packages/database/prisma/schema/*.prisma`.

| Model | Purpose |
|---|---|
| `User` | Accounts. `role` is `USER` or `ADMIN`; `status` is `ACTIVE`, `SUSPENDED`, `BANNED` or `PENDING`. Carries per-user SMTP fields and ban/suspension metadata |
| `Team`, `TeamMember`, `TeamWebhook` | Teams with `OWNER` / `ADMIN` / `MEMBER` roles, team SMTP config, and outgoing webhook subscriptions |
| `Lead` | The core record: `source` (9 values incl. `OPENSTREETMAP`, `CSV_IMPORT`, `MANUAL`), `businessType` (`DOMAIN` or `LOCAL_BUSINESS`), contact and company fields, `coordinates`, `technologies[]`, `socialProfiles`, `websiteAudit`, `status` and `score`. Unique on `(userId, email)` and on `(userId, domain, firstName, lastName)` |
| `UserFavoriteLead` | Per-user favorites |
| `HuntSession`, `HuntSessionEvent` | Hunt tracking with progress counters, `sourceStats`, and a levelled event log (`INFO`, `WARN`, `ERROR`, `SUCCESS`) |
| `AuditSession` | Audit tracking with the same progress shape |
| `EmailOutreach` | Sent emails with `EmailStatus` from `PENDING` through `SENT`, `OPENED`, `CLICKED`, `REPLIED`, `BOUNCED`, `FAILED` |
| `Opportunity` | A scraped freelance mission: source platform (21 values), `OpportunityCategory` (22 values), budget range, `isRemote`, `relevanceScore`, `applicantCount` |
| `OpportunitySearch`, `OpportunityView`, `UserOpportunityNotification`, `UserOpportunityPreferences` | Saved searches, click tracking, notifications and matching preferences |
| `Session`, `Account`, `Verification`, `AdminPermission`, `AuditLog`, `Contact` | Sessions, linked OIDC accounts, verification tokens, per-entity admin permissions, and a `CREATE`/`UPDATE`/`DELETE` audit trail |
| `Subscription`, `PaymentHistory` | Billing tables. No payment provider is wired up in this repo |
| `Room`, `RoomParticipant`, `Message`, `Media` | Messaging tables, unused by the current routers |

Scoping is by `userId` with an optional `teamId` on `Lead`, `HuntSession` and `AuditSession`;
`packages/trpc/src/utils/scope.ts` resolves which of the two a request targets.

## Authentication

Custom HS256 JWT. `AuthManager` (`@repo/auth`, 101 lines) signs with `jose` using
`ENCRYPTION_SECRET`. **One token, no refresh token**, expiring after `7d`. The issuer and
audience still default to `maxi-boilerplate-api` and `maxi-boilerplate-client`, inherited from
the boilerplate and never renamed. Passwords go through argon2 in `@repo/crypto`.

The token is returned in the login response body and sent back as a bearer header — it is not a
cookie, so there is no CSRF surface and no automatic session on server-rendered pages.

Roles come from `@repo/auth-shared`: a `SessionUser` shape and a `ROLE_HIERARCHY` of `USER: 1`,
`ADMIN: 2`. Both `@repo/auth` and `@repo/auth-shared` are workspace packages private to this
monorepo, copy-pasted from `MonorepoBoilerplate` and drifted since — Glouton's `auth-shared`
adds `isPremium` to `SessionUser`, and its `AuthState.session` holds a token rather than a
boolean. Nothing imports either package across repos.

### OIDC

Optional, in `apps/backend/src/services/oidc.ts` and mounted by `handlers/auth.ts`. Active only
when `OIDC_ISSUER` is set; `serverEnvSchema` refuses to boot if the issuer is present without
`OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`, or if `SSO_ONLY` is set without an issuer.

The flow is standard authorization code with a `state` nonce in an `HttpOnly` cookie, discovery
document and JWKS both cached in memory, and `jose` verifying the id token. `OIDC_REDIRECT_URL`
defaults to `${DOMAIN}/auth/oidc/callback` and `OIDC_SUCCESS_URL` to `${DOMAIN}/auth/callback`.
On success the backend redirects to the success URL with the JWT in the **URL fragment**
(`#token=…`), so it never reaches a server log. Users are provisioned on first SSO login from the
`profile` claims.

## Integrations

Glouton does not use `pool` or `enveloppe` and does not publish to Nook or Journal. Its outbound
integration is the per-team webhook: `packages/webhooks` posts a `{ app, event, timestamp, team,
data }` payload to a subscribed URL for `opportunity.new`, `hunt.completed`, `hunt.failed`,
`audit.completed`, `team.member_added` and `team.member_removed`.
