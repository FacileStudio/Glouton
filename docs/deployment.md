# Glouton — Deployment

Building the images, the Compose topology, and what Dokploy and Traefik need in front of them.

## Images

Two Dockerfiles, both multi-stage on `oven/bun:1.3.7-alpine`, both installing from the root
`bun.lock` with `bun install --no-save`.

**`apps/backend/Dockerfile`** — copies `prisma.config.ts` to the root, runs `prisma:generate` in
the builder with a `DATABASE_URL` build arg, and runs as an unprivileged `backend` user (uid
1001). A `CACHE_BUST` build arg sits just before the source copy so the layer can be invalidated
on demand. Its command is:

```sh
bun run --cwd packages/database prisma:push --accept-data-loss && bun run apps/backend/src/index.ts
```

**`apps/frontend/Dockerfile`** — runs `svelte-kit sync` then
`bun run build --filter=@repo/frontend`, and ships `build/`, `server.js`, `packages/` and
`node_modules`. Runs as `frontend` (uid 1001), exposes `3000`, `CMD ["bun",
"apps/frontend/server.js"]`.

Nothing is baked into the frontend bundle at build time. The tRPC client uses the relative base
`/trpc`, so the same image works behind any hostname — no rebuild when the domain changes.

## Compose topology

```
glouton-postgres  postgres:16-alpine, volume postgres_data, pg_isready healthcheck
glouton-redis     redis:7-alpine, appendonly, maxmemory-policy noeviction, volume redis_data
      ▲
      │ both depends_on: service_healthy
glouton-backend   no expose, no ports — reachable only on the Docker network
      ▲                healthcheck: fetch /health/ready
      │ depends_on: service_healthy
glouton-frontend  expose 3000, BACKEND_URL=http://glouton-backend:3001
                       healthcheck: fetch /
```

Only `glouton-frontend` is exposed, and it uses `expose` rather than `ports`, so nothing binds a
host port — the reverse proxy reaches it over the shared network. All four services set
`restart: unless-stopped`.

Redis runs with `--maxmemory-policy noeviction`. That is required for BullMQ: an eviction policy
would silently drop queued jobs.

```sh
DOMAIN=https://glouton.example.com ENCRYPTION_SECRET=... docker compose up -d
docker compose logs -f glouton-backend
docker compose down
```

`DOMAIN` and `ENCRYPTION_SECRET` use Compose's `:?` form. Omitting either aborts the deploy with
an explanatory message rather than starting a broken stack.

## Dokploy and Traefik

Glouton is deployed on la ruche through the Dokploy panel at `gare.facile.studio`, as a Compose
application. Prefer the `dokploy` CLI over SSH plus docker.

This app satisfies the one-container / one-router / one-hostname rule cleanly, despite running
four containers: exactly one is routable. Point a single Traefik router at `glouton-frontend`
port `3000` and set `DOMAIN` to that hostname. Do not add a router for the backend — it is
private by design, and `/internal/broadcast` and `/internal/ws-status` are only protected by a
shared secret.

CORS is built from `DOMAIN` alone, so a mismatch between the Traefik hostname and `DOMAIN` shows
up as browser CORS failures rather than a server error.

One caveat: the proxy in `apps/frontend/server.js` forwards `/trpc`, `/auth/config`,
`/auth/oidc`, `/docs` and `/openapi.json` and nothing else. `/ws` is **not** in that list, so the
WebSocket upgrade does not traverse the frontend container. Live hunt and audit progress
therefore depends on a route to the backend's `/ws` that this Compose file does not provide —
verify it before assuming real-time updates work in a given deployment.

## Schema management

The backend container runs `prisma:push --accept-data-loss` on every start, before the server
comes up. There is no migration job and no `prisma migrate deploy` step.

That has two consequences worth stating plainly. Editing `packages/database/prisma/schema/` and
redeploying **is** the migration. And `--accept-data-loss` means a destructive schema change —
a dropped column, a narrowed type — is applied without confirmation. Back up before deploying a
schema change, and review the diff with `prisma migrate diff` first.

The numbered SQL files in `packages/database/migrations/` are not applied by any container. They
are a development-time path only; see [development.md](development.md).

## Health checks

| Path | Purpose |
|---|---|
| `GET /health/live` | Liveness — the process is up |
| `GET /health/ready` | Readiness — Prisma can reach the database. This is what Compose probes |
| `GET /` | `{ message: "Welcome to the Glouton's API !" }` |

Both container healthchecks use a one-line `bun -e "fetch(…)"` rather than curl, which is not
installed in the alpine images.

A green backend `/health/ready` says nothing about the frontend. The frontend has its own
healthcheck against `/`, and that is the one a user actually hits — probe it, not just the API.

## Shutdown

The backend traps `SIGTERM` and `SIGINT` and closes the BullMQ queues before exiting, so in-flight
jobs are released rather than left stalled. Give the container a real stop timeout; a `SIGKILL`
leaves sessions that the `cleanupStalled` janitor only reconciles up to 30 minutes later.

## Persistent state

Two volumes. `postgres_data` holds everything durable. `redis_data` holds the BullMQ queues with
`appendonly yes` — losing it loses in-flight and scheduled jobs, including the 3-hour opportunity
scraper schedule, though `upsertScheduler` re-creates that on the next boot.
