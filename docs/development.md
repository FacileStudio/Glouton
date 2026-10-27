# Glouton — Development

Getting a working local Glouton, the two competing migration stories, and the checks to run
before you push.

## Prerequisites

- **Bun 1.2.0 or newer.** `mise.toml` and `packageManager` pin `bun@1.3.13`; the images build on `oven/bun:1.3.7`.
  The lockfile is `bun.lock` — no npm, yarn or pnpm
- **Docker**, for PostgreSQL 16 and Redis 7. Both are mandatory: the backend registers BullMQ
  workers at startup and validates the Redis configuration before serving
- **`mise`**, the task runner for this repo (`mise.toml`). `mise install` also sets up lefthook
- **`psql`** on `PATH` if you want to run `scripts/migrate.sh`

## Setup

```sh
docker compose up -d glouton-postgres glouton-redis
bun install
```

`mise run docker:up` does the same. Its siblings are `docker:down`, `docker:clean`,
`docker:logs`, `docker:restart` and `docker:status`.

The backend needs `DOMAIN`, `ENCRYPTION_SECRET` (32+ characters) and `DATABASE_URL` before it
will start. For local work:

```sh
export DOMAIN=http://localhost:3000
export ENCRYPTION_SECRET=local-dev-encryption-secret-change-me
export DATABASE_URL=postgresql://glouton:glouton@localhost:5432/glouton
```

See [configuration.md](configuration.md) for the rest.

## Running

```sh
mise run dev            # frontend and backend together, through Turborepo
mise run dev:backend    # backend only, port 3001
mise run dev:frontend   # frontend only, port 3000
```

`mise run dev` is `bun run dev`, which is `turbo run dev`. The `dev` and `build` tasks depend on
`check-env`, so a bad environment fails before either app comes up.

In development the Vite dev server proxies `/trpc`, `/auth/config`, `/auth/oidc` and `/docs/*`
to `BACKEND_URL`. In production the same list is proxied by
`apps/frontend/server.js`. **Keep the two lists in sync** — a route added to one and not the
other works in development and 404s in production.

Once running: the app is at <http://localhost:3000>, the API reference at
<http://localhost:3000/docs>, and the raw OpenAPI document at
<http://localhost:3000/docs/openapi.json>.

## Database: two migration stories

This repo has both, and they disagree. Know which one you are in.

**Raw SQL migrations** are the historical source of truth. Files live in
`packages/database/migrations/*.sql`, numbered `001_` through `016_`, applied in filename order:

```sh
bash scripts/migrate.sh "$DATABASE_URL"
```

The script takes the connection string as its **first argument** — it does not read
`DATABASE_URL` from the environment, and it resolves the migrations directory relative to its own
parent, so run it from the repo root.

**Prisma** owns the schema definition in `packages/database/prisma/schema/*.prisma`, with
`prisma.config.ts` at the repo root pointing at that directory:

```sh
cd packages/database
bun run prisma:generate    # regenerate the client
bun run prisma:push        # push the schema, development only
bun run prisma:studio      # browse the data
bun run prisma:migrate     # prisma migrate dev
```

The awkward part: the **backend container's start command runs `prisma:push
--accept-data-loss`**, not the SQL migrations. So a deployed Glouton reconciles itself to the
Prisma schema on every boot while the `.sql` files sit unused. Treat the Prisma schema as
authoritative for anything that ships, and keep the SQL files in step only if you rely on them
locally.

## Quality gate

There is no `scripts/check.sh` and no CI. lefthook runs the suite's shared commit checks from
`FacileStudio/hooks`. Run the quality checks yourself:

```sh
mise run typecheck    # turbo run typecheck — tsc for the backend, svelte-check for the frontend
mise run lint         # turbo run lint — eslint with --max-warnings 0
mise run format       # prettier over ts, tsx, md and json
mise run build        # turbo run build
```

There is no test suite. `scripts/test-performance.ts` is a manual benchmark, not a test.
`bun run cleanup:stuck-hunts` exists to reconcile hunt sessions that the automatic janitors did
not catch.

## Adding a tRPC procedure

1. Put the logic in `packages/trpc/src/modules/<module>/service.ts` — routers stay thin.
2. Add the procedure to that module's `router.ts` using `publicProcedure`,
   `protectedProcedure` or `adminProcedure`.
3. New top-level modules get registered on `appRouter` in `packages/trpc/src/index.ts`. The
   client picks up the types through the exported `AppRouter` with no further wiring.
4. If the procedure is scoped to a team, take an optional `teamId` and resolve it through
   `packages/trpc/src/utils/scope.ts` — that is the convention every existing module follows.

## Adding a background worker

1. Create `packages/jobs/src/workers/<name>/`.
2. Export it from `packages/jobs/src/workers/index.ts` so `createWorkers()` picks it up.
3. Add its queue to `apps/backend/src/config.ts`. Registration itself is automatic —
   `register-workers.ts` iterates whatever `createWorkers()` returns.

## Gotchas

- Package boundaries are enforced by convention only. `@repo/auth`, `@repo/trpc` and
  `@repo/jobs` are server-only; `@repo/trpc-client` is client-only; `@repo/types`,
  `@repo/utils` and `@repo/auth-shared` are isomorphic. Importing a server package into a
  Svelte component fails at build time, loudly but confusingly.
- Zod is `^3.24.1` everywhere in this repo. Do not upgrade one package to v4 in isolation.
- `packages/hunter` and `packages/lead-sources` contain no source. Do not try to import them.
- `HUNTER_API_KEY` is in the env schema but read nowhere. Setting it does nothing.
- The JWT is a bearer token with no refresh, valid 7 days. Its issuer and audience still default
  to `maxi-boilerplate-api` and `maxi-boilerplate-client`.
