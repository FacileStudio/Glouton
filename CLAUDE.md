# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Glouton is a production-ready lead generation platform with automated web scraping, intelligent lead scoring, and real-time progress tracking. Built as a Turborepo monorepo with Bun, Hono, tRPC, SvelteKit, and BullMQ.

**Core Features:**
- Automated lead extraction from free sources (OpenStreetMap local business search)
- Background job processing with BullMQ and Redis
- Real-time WebSocket updates for hunt progress
- Intelligent lead scoring (HOT/WARM/COLD)
- Website audit system with speculative crawling
- Per-user SMTP configuration for email outreach
- JWT authentication with role-based access control

## Essential Commands

### Development

```bash
# Quick setup (starts Docker services, installs deps, runs migrations)
./local-dev.sh

# Start all services (frontend + backend)
bun run dev

# Start individual services
cd apps/backend && bun run dev     # Backend only (port 3001)
cd apps/frontend && bun run dev    # Frontend only (port 5173)
```

### Docker Services (PostgreSQL, Redis)

```bash
DOMAIN=http://localhost:3000 ENCRYPTION_SECRET=local-dev-encryption-secret-change-me docker compose up -d postgres redis
DOMAIN=http://localhost:3000 ENCRYPTION_SECRET=local-dev-encryption-secret-change-me docker compose down
DOMAIN=http://localhost:3000 ENCRYPTION_SECRET=local-dev-encryption-secret-change-me docker compose logs -f
```

### Database

```bash
# Run migrations manually
bash scripts/migrate.sh

# Prisma commands (from packages/database)
cd packages/database
bun run prisma:generate    # Generate Prisma client
bun run prisma:migrate     # Create migration
bun run prisma:push        # Push schema changes
bun run prisma:studio      # Open Prisma Studio
```

**Important:** Migrations are SQL files in `packages/database/migrations/`, applied in order by `scripts/migrate.sh`.

### Build & Type Checking

```bash
bun run build              # Build all packages
bun run typecheck          # Type check all packages
bun run lint               # Lint all packages
bun run format             # Format code with Prettier
```

### Maintenance

```bash
bun run cleanup:stuck-hunts    # Clean up stuck hunt sessions
bun run clean                  # Clean and reinstall dependencies
```

## Architecture

### Monorepo Structure

**Apps:**
- `apps/backend/` - Hono + tRPC API server (port 3001)
- `apps/frontend/` - SvelteKit application (port 5173)

**Key Packages:**
- `packages/trpc/` - tRPC routers and procedures (server-only)
- `packages/trpc-client/` - Universal tRPC client factory (client-only)
- `packages/database/` - PostgreSQL schema, migrations, Prisma client
- `packages/jobs/` - BullMQ job queues and workers
- `packages/maps/` - OpenStreetMap business search (Overpass/Nominatim)
- `packages/audit/` - Website audit system with analyzers
- `packages/auth/` - JWT authentication (server-only)
- `packages/auth-shared/` - Role-based access control (isomorphic)
- `packages/smtp/` - Email sending utilities
- `packages/courrier/` - Courrier client (Registre refresh + token exchange, send, search, contacts)
- `packages/logger/` - Structured logging
- `packages/types/` - Shared TypeScript types
- UI comes from `@facile/muse` (pinned in `apps/frontend/package.json`), the shared Facile design system
- `packages/utils/` - Shared utility functions

### tRPC API Structure

**Modules** (`packages/trpc/src/modules/`):
- `auth/` - Login, register, token refresh
- `user/` - User management
- `lead/` - Lead operations (CRUD, hunt, audit)
- `email/` - Email outreach

**Procedures:**
- `publicProcedure` - No authentication required
- `protectedProcedure` - Requires valid JWT
- `adminProcedure` - Requires admin role

**Service Layer:** Business logic lives in `service.ts` files, not directly in routers.

### Background Jobs Architecture

**Job System** (`packages/jobs/`):
- `queue-manager.ts` - BullMQ queue manager with Redis
- `workers/` - Job processors for hunts and audits
  - `opportunity-scraper/` - Freelance missions scraping (free public sources)
  - `csv-import/` - CSV lead import
  - `lead-audit/` - Website audit jobs
  - `local-business-hunt/` - OpenStreetMap business search

**Job Flow:**
1. User triggers hunt via `lead.hunt.startLocalBusiness` tRPC mutation
2. Backend creates `HuntSession` in database
3. Job added to BullMQ queue
4. Worker processes job, emits progress events
5. Real-time updates sent via WebSocket
6. Results stored in database, session marked complete

**Events:** `apps/backend/src/services/events.ts` - Event broadcasting to WebSocket clients

### Database Schema

**PostgreSQL with native migrations** (not Prisma Migrate):
- Migrations in `packages/database/migrations/*.sql`
- Applied sequentially by `scripts/migrate.sh`
- 20+ tables: User, Lead, HuntSession, AuditSession, Email, etc.
- 13 enums: UserRole, LeadStatus, HuntStatus, etc.

**Key Tables:**
- `User` - Auth, per-user SMTP config
- `Lead` - Extracted leads with scoring
- `HuntSession` - Hunt job tracking (status, progress, metadata)
- `AuditSession` - Website audit tracking
- `Email` - Email outreach tracking

### Lead Extraction System

**OpenStreetMap only** (`packages/maps/`):
- Free, no API key required (Overpass API + Nominatim geocoding)
- Deduplication and quality scoring

### Audit System

**Website Analyzer** (`packages/audit/`):
- `auditor.ts` - Main audit orchestrator
- `analyzers/` - Specialized analyzers:
  - Technology detection (React, Vue, WordPress, etc.)
  - SEO analysis (meta tags, structured data)
  - Performance metrics
  - Security checks (HTTPS, headers)
  - Accessibility analysis
- Speculative path crawling for thorough coverage

### WebSocket Real-time Updates

**Implementation** (`apps/backend/src/handlers/websocket.ts`):
- Native Bun WebSocket support
- Per-user connection tracking
- Event broadcasting: `broadcastToUser()`, `broadcastToAll()`
- Used for hunt progress, audit updates, notifications

**Event Types:**
- `hunt:progress` - Hunt job progress updates
- `audit:progress` - Audit job progress updates
- `lead:new` - New lead extracted

## Development Workflow

### Adding a New tRPC Endpoint

1. Create service in `packages/trpc/src/modules/[module]/service.ts`
2. Add procedure to `packages/trpc/src/modules/[module]/router.ts`
3. Export router from `packages/trpc/src/index.ts`
4. Client automatically gets types via `@repo/trpc-client`

### Adding a Database Migration

1. Create `packages/database/migrations/00X_description.sql`
2. Write SQL (follow existing migration patterns)
3. Run `bash scripts/migrate.sh` to apply

**Do not use Prisma Migrate** - this project uses raw SQL migrations.

### Adding a Background Job Worker

1. Create worker in `packages/jobs/src/workers/[name]/`
2. Define job processor with `createJobProcessor()`
3. Register in `apps/backend/src/services/register-workers.ts`
4. Add queue to `apps/backend/src/config.ts`

## Important Conventions

### Type Safety
- End-to-end type safety via tRPC
- No `any` types - use `unknown` and narrow
- Zod for runtime validation

### Package Separation
- **Server-only:** `@repo/auth`, `@repo/trpc`, `@repo/jobs`
- **Client-only:** `@repo/trpc-client`
- **Isomorphic:** `@repo/types`, `@repo/utils`, `@repo/auth-shared`

Never import server packages in client code.

### Environment Variables
- Backend: `apps/backend/.env` (validated by `src/env.ts`)
- Frontend: `apps/frontend/.env` (validated by `src/lib/env.ts`)
- Database: `packages/database/.env` (for migrations)
- Run `bun run check-env` to validate

### Error Handling
- Use tRPC's `TRPCError` with codes: `UNAUTHORIZED`, `BAD_REQUEST`, `NOT_FOUND`, etc.
- Log errors with `@repo/logger`
- Return user-friendly messages

### Logging
- Use `@repo/logger` (Winston-based)
- Levels: `debug`, `info`, `warn`, `error`
- Include context: `logger.info('[MODULE] Message', { data })`

## Testing

No test infrastructure currently exists. When adding tests:
- Use Bun's built-in test runner
- Test services independently from tRPC procedures
- Mock database and external APIs

## Production Deployment

```bash
# Full stack (frontend + backend + services)
docker-compose up -d

# Backend only
cd apps/backend
bun run build
bun run dist/index.js
```

**Required Environment Variables:**
- `DOMAIN` - public frontend URL, for example `https://glouton.facile.studio`
- `ENCRYPTION_SECRET` - JWT signing (min 32 chars)

Compose wires `DATABASE_URL`, Redis, and the internal frontend-to-backend proxy automatically. The backend is not exposed publicly.

## Common Issues

**Port conflicts:**
```bash
lsof -i :3001    # Backend
lsof -i :5173    # Frontend
lsof -i :5432    # PostgreSQL
lsof -i :6379    # Redis
```

**Redis connection issues:**
- Ensure Docker container is running: `docker ps | grep redis`
- Check logs: `DOMAIN=http://localhost:3000 ENCRYPTION_SECRET=local-dev-encryption-secret-change-me docker compose logs redis`

**Database migrations not applied:**
- Verify `DATABASE_URL` in `packages/database/.env`
- Manually run: `bash scripts/migrate.sh`

**Stuck hunts:**
- Run cleanup: `bun run cleanup:stuck-hunts`
- Check job queue: View Redis via `redis-cli`

## Key Files to Know

- `apps/backend/src/index.ts` - Backend entry point
- `apps/backend/src/config.ts` - Job queue configuration
- `apps/backend/src/services/register-workers.ts` - Worker registration
- `packages/trpc/src/index.ts` - tRPC router composition
- `packages/jobs/src/queue-manager.ts` - BullMQ setup
- `packages/database/migrations/` - Database schema
- `turbo.json` - Turborepo task configuration
- `mise.toml` - Common development tasks
