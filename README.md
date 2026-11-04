# Glouton

Self-hosted lead generation for a small agency: hunt local businesses from OpenStreetMap, audit
their websites, score them, and run email outreach — plus a scraper that pulls freelance missions
from public job boards.

Everything heavy runs as a BullMQ background job with live progress streamed to the browser over
a WebSocket. Leads, hunts and missions belong either to a user or to a team.

## What it does

- Local-business hunts over OpenStreetMap (Overpass and Nominatim), no API key required
- Website audits: technology detection, SEO, security headers, company info, speculative crawling
- Lead scoring into `HOT`, `WARM` and `COLD`, with per-user deduplication
- CSV import and export of leads
- Email outreach with per-user or per-team SMTP, templates, previews and delivery tracking
- Freelance mission scraping from 21 public sources, re-run every three hours
- Teams with `OWNER` / `ADMIN` / `MEMBER` roles, mirrored from Registre's shared spaces, with shared leads and outgoing webhooks
- Email/password auth plus optional OIDC SSO against Authentik, with an `SSO_ONLY` mode
- A subscription gate: each space, and each person's personal scope, needs `glouton.access` from its Registre plan (Pro or Studio)

## Subscription gate

Registre pushes plan entitlements in its directory snapshot. Glouton stores the last known values
in its database and checks `glouton.access` on every tRPC call, in the scope of the call (the
team named by `teamId`, after a server-side membership check, or the personal scope). New
procedures are gated unless added to `EXEMPT` in `packages/trpc/src/modules/forfait/gate.ts`.

Until a snapshot with `entitlements_revision > 0` has been applied once, Glouton allows every scope
and logs a warning, so deploying it before Registre and Ardoise locks nobody out. After that it
never fails open again, even across restarts. Details: [docs/api.md](docs/api.md#subscription-gate).

## Stack

| Layer | Tech |
|---|---|
| API | Bun, Hono 4, tRPC 11, Prisma 7, PostgreSQL 16, BullMQ on Redis 7 |
| Client | SvelteKit 2.60 (Svelte 5 runes), Tailwind CSS 4, Leaflet |
| Deploy | Docker Compose, four containers, one public hostname |

Zod is pinned at `^3.24.1` in every workspace package — Glouton is on the **zod 3** side of the
suite split.

## Quick start

```sh
DOMAIN=http://localhost:3000 \
ENCRYPTION_SECRET=local-dev-encryption-secret-change-me \
docker compose up -d
```

Then open <http://localhost:3000>. `DOMAIN` and `ENCRYPTION_SECRET` have no defaults — Compose
refuses to start without them.

### Local development

```sh
docker compose up -d glouton-postgres glouton-redis
bun install
bash scripts/migrate.sh "$DATABASE_URL"
mise run dev
```

The frontend listens on port 3000 and proxies `/trpc`, `/auth/config`, `/auth/oidc` and `/docs/*`
through to the backend on 3001, so the browser only ever talks to one origin.

## Configuration

| Variable | What it does |
|---|---|
| `DOMAIN` | Public URL of the frontend. Required, no default. Drives the CORS allow-list and the OIDC redirect defaults |
| `ENCRYPTION_SECRET` | JWT signing key and internal-endpoint shared secret, minimum 32 characters |
| `DATABASE_URL` | Postgres connection string |
| `REDIS_HOST` | Redis host for the BullMQ queues, defaults to `localhost` |
| `BACKEND_URL` | Where the frontend process proxies API traffic, defaults to `http://localhost:3001` |
| `OIDC_ISSUER` | Enables SSO when set; `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` then become required |

SMTP is not an environment variable — credentials are stored per user and per team, and edited
in the app.

Full reference: [docs/configuration.md](docs/configuration.md).

## Structure

```
apps/
  backend/   Hono server — handlers/ (trpc, auth, websocket, health), services/ (events, workers)
  frontend/  SvelteKit app plus server.js, a thin reverse proxy in front of the built handler
packages/
  trpc/      tRPC router; modules/ for auth, user, lead, email, team, opportunity, forfait
  jobs/      BullMQ queue manager and the four workers
  database/  Prisma schema in prisma/schema/, raw SQL migrations in migrations/
  maps/      OpenStreetMap providers, Overpass queries, Nominatim geocoding
  audit/     Website auditor and its analyzers
  auth/      AuthManager — HS256 JWT via jose, argon2 hashing via @repo/crypto
  webhooks/  Outgoing team webhook catalog and delivery
  ui/        Shared Svelte components      smtp/  Nodemailer transport
docs/        Architecture, configuration, development, deployment, API
```

## Documentation

| Doc | What's in it |
|---|---|
| [Architecture](docs/architecture.md) | Runtime topology, job pipeline, data model, auth |
| [Configuration](docs/configuration.md) | Every environment variable and default |
| [Development](docs/development.md) | Local setup, `mise` tasks, migrations, quality gate |
| [Deployment](docs/deployment.md) | Docker Compose, Dokploy, Traefik, schema management |
| [API](docs/api.md) | The tRPC router tree and the plain HTTP routes |

---

Part of the [Facile Suite](https://facile.studio) — self-hosted tools for creative studios
and freelancers. One login, zero cloud dependency.
