# Glouton

Lead generation platform with automated web scraping, intelligent lead scoring, and real-time progress tracking.

## Tech Stack

- **Monorepo**: Turborepo + Bun workspaces
- **Backend**: Hono + tRPC (port 3001)
- **Frontend**: SvelteKit + Svelte 5 + Tailwind CSS 4 (port 5173)
- **Database**: PostgreSQL (raw SQL migrations, not Prisma Migrate)
- **Queue**: BullMQ + Redis
- **Auth**: JWT with role-based access control
- **Language**: TypeScript throughout
- **Linting**: ESLint + Prettier (single quotes, no tabs, 100 print width)

## Commands

```bash
# Setup & run
just setup                # full local setup (Docker + deps + migrations)
just docker-up            # start PostgreSQL + Redis
just dev                  # start all services (bun run dev via Turbo)
just dev-backend          # backend only
just dev-frontend         # frontend only

# Database
just migrate              # apply SQL migrations
cd packages/database
bun run prisma:generate   # regenerate Prisma client
bun run prisma:studio     # open Prisma Studio

# Quality
bun run build             # build all packages
bun run typecheck         # type check everything
bun run lint              # lint everything
bun run format            # format with Prettier

# Maintenance
bun run cleanup:stuck-hunts   # fix stuck hunt sessions
bun run clean                 # nuke node_modules and reinstall
```

## Project Structure

```
apps/
  backend/       Hono + tRPC API server
  frontend/      SvelteKit application

packages/
  trpc/          tRPC routers and procedures (server-only)
  trpc-client/   Universal tRPC client factory (client-only)
  database/      PostgreSQL schema, Prisma client, migrations
  jobs/          BullMQ job queues and workers
  hunter/        Web scraping and crawling logic
  audit/         Website audit system with analyzers
  lead-sources/  Multi-provider lead extraction (Hunter, Apollo, Snov, etc.)
  auth/          JWT authentication (server-only)
  auth-shared/   Role-based access control (isomorphic)
  smtp/          Email sending
  logger/        Structured logging (Winston)
  maps/          Google Maps integration
  crypto/        Encryption utilities
  env/           Zod environment validation
  types/         Shared TypeScript types
  ui/            Shared Svelte components
  utils/         Shared utilities
  eslint-config/ Shared ESLint configuration
  tsconfig/      Shared TypeScript configs
```

## Architecture Notes

### tRPC Modules (`packages/trpc/src/modules/`)

Each module has `router.ts` (endpoints) and `service.ts` (business logic). Procedure levels:
- `publicProcedure` -- no auth
- `protectedProcedure` -- valid JWT required
- `adminProcedure` -- admin role required

### Background Jobs (`packages/jobs/`)

Hunt flow: user triggers hunt via tRPC -> HuntSession created in DB -> job added to BullMQ -> worker processes and emits progress -> WebSocket broadcasts updates -> results stored.

Workers live in `packages/jobs/src/workers/` (domain-finder, lead-extraction, lead-audit, local-business-hunt).

### Database

Migrations are raw SQL files in `packages/database/migrations/*.sql`, applied in order by `scripts/migrate.sh`. Do not use Prisma Migrate.

### WebSocket

Native Bun WebSocket in `apps/backend/src/handlers/websocket.ts`. Per-user connection tracking with `broadcastToUser()` and `broadcastToAll()`.

## Conventions

- **No `any` types** -- use `unknown` and narrow.
- **Zod** for all runtime validation.
- **Server/client separation** is strict: never import `@repo/auth`, `@repo/trpc`, or `@repo/jobs` in client code. Isomorphic packages: `@repo/types`, `@repo/utils`, `@repo/auth-shared`.
- **Environment variables**: backend validates in `apps/backend/src/env.ts`, frontend in `apps/frontend/src/lib/env.ts`, database in `packages/database/.env`.
- **Error handling**: use `TRPCError` with semantic codes (`UNAUTHORIZED`, `BAD_REQUEST`, `NOT_FOUND`).
- **Logging**: use `@repo/logger` with context -- `logger.info('[MODULE] Message', { data })`.
- **No test infrastructure** exists yet. When adding tests, use Bun's built-in test runner.

## Adding Things

**New tRPC endpoint**: create service in `packages/trpc/src/modules/[module]/service.ts`, add procedure to `router.ts`, export from `packages/trpc/src/index.ts`.

**New migration**: create `packages/database/migrations/00X_description.sql`, run `just migrate`.

**New job worker**: create in `packages/jobs/src/workers/[name]/`, register in `apps/backend/src/services/register-workers.ts`, add queue config in `apps/backend/src/config.ts`.

**New lead source**: implement `LeadSourceProvider` interface in `packages/lead-sources/src/providers/`, add to factory in `packages/lead-sources/src/factory.ts`.

## Deployment

```bash
# Full stack via Docker Compose
DOMAIN=https://glouton.facile.studio ENCRYPTION_SECRET=<secret> docker compose up -d
```

Required env vars: `DOMAIN` (public frontend URL) and `ENCRYPTION_SECRET` (min 32 chars). Compose wires `DATABASE_URL`, Redis, and the internal frontend-to-backend proxy automatically. The backend is not exposed publicly.

## Common Ports

| Service    | Port |
|------------|------|
| Frontend   | 5173 |
| Backend    | 3001 |
| PostgreSQL | 5432 |
| Redis      | 6379 |
