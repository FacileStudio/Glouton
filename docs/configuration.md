# Glouton — Configuration

Every environment variable the code actually reads, and the settings that deliberately live in
the database instead.

## Backend

Validated by `serverEnvSchema` in `packages/env/src/index.ts`, parsed by
`apps/backend/src/env.ts` at import time. A missing or invalid variable throws before the server
starts — the process does not come up degraded.

Empty strings are preprocessed to `undefined` for the optional string and URL fields, because
Docker Compose passes unset optional variables as empty strings.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `production` or `test` |
| `PORT` | no | `3001` | HTTP listen port, coerced to a number |
| `DOMAIN` | **yes** | — | Public frontend URL. Minimum length 1. Sole source of the CORS allow-list, and the base for the OIDC redirect and success defaults |
| `ENCRYPTION_SECRET` | **yes** | — | Minimum 32 characters. Signs JWTs, keys `@repo/crypto`, and doubles as the `x-internal-secret` for `/internal/*` |
| `DATABASE_URL` | **yes** in practice | — | Postgres connection string. Read by `prisma.config.ts` and the runtime client, not by the zod schema |
| `REDIS_HOST` | no | `localhost` | BullMQ Redis host |
| `REDIS_PORT` | no | `6379` | BullMQ Redis port |
| `REDIS_PASSWORD` | no | — | BullMQ Redis password |
| `REDIS_DB` | no | `0` | BullMQ Redis database index |
| `HUNTER_API_KEY` | no | — | Declared in the schema but read nowhere in the source. A leftover from the paid-API era; setting it has no effect |

`ENCRYPTION_SECRET` doing double duty as the internal-endpoint secret is worth remembering:
rotating it invalidates every session **and** changes the `/internal/*` credential at the same
time.

### OIDC

All optional, but cross-validated by a `superRefine` on the schema:

- setting `OIDC_ISSUER` without `OIDC_CLIENT_ID` **and** `OIDC_CLIENT_SECRET` fails startup

| Variable | Required | Default | What it does |
|---|---|---|---|
| `OIDC_ISSUER` | no | — | Issuer URL, for example `https://porte.facile.studio/application/o/glouton/`. Its presence is what enables the OIDC routes |
| `OIDC_CLIENT_ID` | with issuer | — | Authentik client id |
| `OIDC_CLIENT_SECRET` | with issuer | — | Authentik client secret |
| `OIDC_REDIRECT_URL` | no | `${DOMAIN}/auth/oidc/callback` | Must match the callback registered in Authentik |
| `OIDC_SUCCESS_URL` | no | `${DOMAIN}/auth/callback` | Where the backend redirects with `#token=…` |
| `APP_VERSION` | no | `dev` | Served by `GET /version`. Set it at release time (compose build arg and env) |

The same variables configure delegated access for agents. With `OIDC_ISSUER` and
`OIDC_CLIENT_ID` set, the backend also accepts Registre token-exchange tokens whose `aud` is
`OIDC_CLIENT_ID` (Glouton's Registre client id, `1IdqK3bA2LWI-zuWVLqFpnIlCTVu117F` in prod) and
whose scope holds `glouton.read` or `glouton.write`, on tRPC and on `/api/agent/*`. The signing
keys come from the issuer's discovery document. Without `OIDC_ISSUER`, only session JWTs work.

SSO sign-in asks for `openid email profile offline_access`. Registre returns a refresh token
for `offline_access` without `prompt=consent` when the client has the `refresh_token` grant.
Glouton stores it on the `Account` row, encrypted with `ENCRYPTION_SECRET`. Registre rotates
it on every refresh, and Glouton saves each new one.

### Courrier

Optional. With `COURRIER_URL` and OIDC set, a user or a space can send outreach through a
Courrier account instead of SMTP. Without `COURRIER_URL`, the Courrier transport, reply sync
and contact import are off and every mail goes through SMTP.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `COURRIER_URL` | no | — | Courrier base URL, `https://courrier.facile.studio` in prod. Its presence turns the integration on |
| `COURRIER_AUDIENCE` | no | `tniN7PWx8mSOCwVAAvYpBexYnMFWAM5flt19rNl0` | Courrier's Registre client id, the token-exchange audience |

How Glouton gets a Courrier token for a user:

1. It refreshes the user's stored Registre refresh token at the issuer's token endpoint, with
   client secret basic auth (`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`).
2. It exchanges that access token (RFC 8693, `subject_token_type`
   `urn:ietf:params:oauth:token-type:access_token`) for audience `COURRIER_AUDIENCE` with scope
   `courrier.read courrier.write`. Registre must allow Glouton's client that exchange.
3. It caches both tokens in memory per user until 30 seconds before they expire.

A user with no stored refresh token, or whose refresh Registre refuses, sees "Reconnect your
Facile account": signing out and back in with SSO stores a fresh one. Users who signed in
before this release have none until they sign in again.

The choice lives on `User` and `Team` (`mailTransport` = `COURRIER` or `SMTP`,
`courrierAccountId`), set in Settings > Compte and in a space's SMTP tab. A space's choice wins
over its member's. A Courrier send failure is reported and never retried over SMTP.

Two BullMQ jobs run when Courrier is configured:

- `courrier-reply-sync`, every 15 minutes: for SENT, OPENED and CLICKED outreach of the last
  30 days sent through Courrier, it searches the Courrier account for mail from the recipient
  after `sentAt`, then sets `REPLIED`, logs `email.replied` and moves a Prospect to Contacted.
- `courrier-contacts-import`, daily: proposes each Courrier contact not yet on a person in the
  user's scope as an `IMPORT` suggestion in the inbox, at most 200 per user per run. An address
  with an open or dismissed import suggestion is not proposed again.

Both log and skip a failing user. Both hold an in-memory token cache, so run one backend
replica, or expect an occasional "Reconnect" when two replicas rotate the same refresh token.

### Ardoise sync

Links Glouton companies to Ardoise clients, both ways. The four first variables go together: set
all four or none, else startup fails. With none set, the sync is off: the webhook answers 404,
edits queue nothing, and the backend logs "Ardoise sync is off" once.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `ARDOISE_URL` | with the others | — | Ardoise backend URL, for example `https://api-ardoise.facile.studio`. Glouton calls `{ARDOISE_URL}/api/integrations/glouton/*` |
| `ARDOISE_API_TOKEN` | with the others | — | Bearer token Glouton sends to Ardoise. Same value as Ardoise's `GLOUTON_API_TOKEN` |
| `ARDOISE_WEBHOOK_SECRET` | with the others | — | Minimum 16 characters. Verifies `X-Ardoise-Signature-256` on incoming webhooks. Same value as Ardoise's `GLOUTON_WEBHOOK_SECRET` |
| `ARDOISE_DEFAULT_OWNER_EMAIL` | with the others | — | Glouton user who owns clients that arrive without a matching team. When no user has this email, those clients are not imported and the backend logs an error |
| `ARDOISE_WEB_URL` | no | `https://ardoise.facile.studio` | Ardoise web app, for the "Lié dans Ardoise" link (`/admin/clients/{id}`) |

On the Ardoise side, set `GLOUTON_URL` to Glouton's public URL: Ardoise posts to
`{GLOUTON_URL}/api/integrations/ardoise/webhook`, which `server.js` forwards to the backend.

## Frontend

`apps/frontend/src/lib/env.ts` validates only `NODE_ENV` — the frontend has no public API URL to
configure, because the tRPC client uses the relative base `/trpc`.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `HOST` | no | `0.0.0.0` | Bind address for `server.js` |
| `PORT` | no | `3000` | Listen port for `server.js` and the Vite dev server |
| `BACKEND_URL` | no | `http://localhost:3001` | Where `server.js` proxies API paths. In Compose this is `http://glouton-backend:3001`. Also the Vite dev proxy target |
| `NODE_ENV` | no | `development` | Read by `src/lib/env.ts` and the client logger |

## Logging

Read directly by `packages/logger`, not by any schema.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `LOG_LEVEL` | no | `debug` in development, `info` in production | Pino level |
| `LOGTAIL_TOKEN` | no | — | In production only, adds a Logtail transport with this source token |

## Other

| Variable | Required | Default | What it does |
|---|---|---|---|
| `SMTP_HOST` | no | `mail.glouton.app` | Probe domain used by the email verifier in `packages/jobs/src/services/email-verifier.ts`. It is **not** the SMTP server used to send mail |

## Compose

`docker-compose.yml` uses the `:?` form for the two that matter, so a missing value stops the
deploy rather than starting a broken stack.

| Variable | Default | What it does |
|---|---|---|
| `DOMAIN` | none — **fails** if unset | Passed to both the backend and the frontend |
| `ENCRYPTION_SECRET` | none — **fails** if unset | Passed to the backend |
| `POSTGRES_PASSWORD` | `glouton` | Database password. The user and database name are hard-coded to `glouton` |
| `COURRIER_URL`, `COURRIER_AUDIENCE` | empty | Passed to the backend; empty leaves Courrier off |
| `ARDOISE_*` | empty | Forwarded to the backend by name; see [Ardoise sync](#ardoise-sync) |
| `CACHE_BUST` | `2026-05-15-1` | Build arg that invalidates the backend image's source-copy layer |

`DATABASE_URL` is assembled by Compose from `POSTGRES_PASSWORD` and always points at
`glouton-postgres`; it is not settable directly there. Redis is wired to `glouton-redis:6379`
with `REDIS_DB=0`.

## What is not an environment variable

- **SMTP credentials.** Stored on `User` (`smtpHost`, `smtpPort`, `smtpSecure`, `smtpUser`,
  `smtpPass`, `smtpFromName`, `smtpFromEmail`) and on `Team`, edited through
  `user.updateSmtpConfig` and `team.updateSmtpConfig`. Both have a `testSmtpConfig` procedure.
- **Outgoing webhooks.** Stored as `TeamWebhook` rows — name, URL, event subscriptions, enabled
  flag — managed through the `team` router.
- **Lead sources.** OpenStreetMap needs no key and there is nothing to configure.

Glouton does not use `tronc` or `troncenv`; the Go chassis conventions do not apply here.
