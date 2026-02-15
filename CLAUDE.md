# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Glouton** is a production-ready lead generation platform with automated web scraping, intelligent lead scoring, and real-time progress tracking. Built as a tRPC-based monorepo with Turborepo, featuring:

- 🔍 **Automated Lead Extraction** - Crawl websites and extract contact information
- 🎯 **Smart Lead Scoring** - Automatic classification (HOT/WARM/COLD) based on quality metrics
- 🚀 **Real-time Progress** - Live updates on hunt status via WebSocket
- 💼 **Technology Detection** - Identify tech stacks (React, Vue, WordPress, etc.)
- 📊 **Analytics Dashboard** - Comprehensive statistics and insights
- 🔒 **Enterprise Security** - SSRF protection, input validation, rate limiting
- ⚡ **Background Processing** - Async job queue with Redis and BullMQ
- 🗺️ **Local Business Hunting** - Google Maps integration for finding local businesses
- 📨 **Email Outreach** - SMTP integration for lead communication
- 🎯 **Opportunity Tracking** - Scrape and track opportunities from platforms like Upwork, Fiverr

**Tech Stack**:
- Full end-to-end type safety with tRPC
- Hono backend server running on Bun
- SvelteKit frontends (landing page + backoffice)
- Playwright/Puppeteer for web scraping
- Custom JWT authentication
- BullMQ + Redis for job queues
- Prisma ORM with PostgreSQL (multi-schema support)

## Package Manager

Use **Bun** exclusively for all package management and script execution.

## Development Commands

### Initial Setup
```bash
bun install
bun run dev:db:setup                     # Start PostgreSQL and push schema (recommended)

# Or run separately:
bun run dev:db                           # Start PostgreSQL and auto-configure .env files
cd packages/database && bun run db:push  # Push schema to database
```

**Note**: The `dev:db` script automatically:
- Starts PostgreSQL (via Docker or Homebrew)
- Creates the database if it doesn't exist
- Updates `DATABASE_URL` in `apps/backend/.env` and `packages/database/.env`

### Running Applications
```bash
bun run dev                              # Run all apps in parallel (Turborepo)
cd apps/backend && bun run dev           # Backend only (port 3001)
cd apps/frontend && bun run dev          # Frontend only (port 5173)
cd apps/backoffice && bun run dev        # Backoffice only (port 3002)
cd apps/mobile && bun run dev            # Expo dev server
cd apps/mobile && bun run ios            # iOS simulator
cd apps/mobile && bun run android        # Android emulator
```

### Database Operations
```bash
bun run dev:db                           # Start local PostgreSQL and auto-configure .env
bun run dev:db:setup                     # Start database + push schema (recommended)
bun run db:studio                        # Open Prisma Studio (from root)

cd packages/database
bun run db:generate                      # Generate Prisma client
bun run db:push                          # Push schema to database (dev)
bun run db:migrate:dev                   # Create and apply migration
bun run db:migrate:deploy                # Apply migrations (production)
bun run db:studio                        # Open Prisma Studio (from database package)
```

**Database Configuration**:
- The `dev:db` script detects your PostgreSQL installation (Docker or Homebrew)
- For Homebrew installations, it uses your macOS username (no password required)
- For Docker installations, it creates a container with credentials `postgres:postgres`
- The script automatically updates `DATABASE_URL` in both `apps/backend/.env` and `packages/database/.env`

### Build & Type Checking
```bash
bun run build                            # Build all apps (Turborepo)
bun run type-check                       # Type check all apps
turbo run type-check --filter=@repo/backend  # Type check specific app
```

### Linting & Formatting
```bash
bun run lint                             # Lint all apps
bun run format                           # Format with Prettier
```

### Environment Validation
```bash
cd apps/backend && bun run check-env     # Validate backend .env
cd apps/frontend && bun run check-env    # Validate frontend .env
```

## Architecture

### Monorepo Structure

- **`apps/`**: Independent applications
  - `backend`: Hono server with tRPC endpoints
  - `frontend`: SvelteKit landing page
  - `backoffice`: SvelteKit admin panel
  - `mobile`: Expo React Native app

- **`packages/`**: Shared libraries
  - `@repo/database`: Prisma schema and client
  - `@repo/trpc`: tRPC router, procedures, context (server-only)
  - `@repo/trpc-client`: Universal tRPC client factory for web/mobile (client-only)
  - `@repo/auth`: Custom JWT authentication (server-only)
  - `@repo/auth-shared`: Shared auth utilities
  - `@repo/storage`: MinIO S3 service (server-only)
  - `@repo/storage-client`: File upload utilities for browser/React Native (client-only)
  - `@repo/stripe`: Stripe integration
  - `@repo/jobs`: BullMQ job queue system with Redis (server-only)
  - `@repo/scraper`: Web scraping with Playwright/Puppeteer (server-only)
  - `@repo/hunter`: Lead hunting business logic (server-only)
  - `@repo/audit`: Lead auditing and quality scoring (server-only)
  - `@repo/maps`: Google Maps integration for local business search (server-only)
  - `@repo/smtp`: Email outreach functionality (server-only)
  - `@repo/opportunity-scraper`: Scrape opportunities from job platforms (server-only)
  - `@repo/lead-sources`: Lead source integrations (server-only)
  - `@repo/logger`: Universal logging with Pino (server/client)
  - `@repo/env`: Zod environment validation
  - `@repo/types`: Shared TypeScript types
  - `@repo/crypto`: Encryption utilities
  - `@repo/i18n`: Internationalization with Svelte and React hooks
  - `@repo/ui`: Shared Svelte components
  - `@repo/utils`: Shared utility functions
  - `@repo/tsconfig`: Shared TypeScript configs

### tRPC Architecture

The tRPC setup follows a clean client/server separation:

**Server-side (`@repo/trpc`):**
The tRPC router is organized into **modular routers** located in `packages/trpc/src/modules/`:

- `auth`: Authentication (login, register, verify)
- `user`: User management
- `admin`: Admin dashboard and statistics
- `lead`: Lead management with sub-modules:
  - `query`: Search and filter leads
  - `hunt`: Start lead hunting sessions
  - `audit`: Audit lead quality
  - `import-export`: CSV import/export
  - `schemas`: Zod schemas for validation
- `huntRun`: Hunt session tracking and progress
- `opportunity`: Opportunity scraping and management
- `email`: Email outreach campaigns
- `contact`: Contact form submissions
- `stripe`: Payment processing
- `chat`: Messaging system

**Key files:**
- `packages/trpc/src/index.ts`: Main router combining all module routers (exports `AppRouter` type)
- `packages/trpc/src/trpc.ts`: Procedure definitions (public, protected, admin)
- `packages/trpc/src/context.ts`: tRPC context with auth, db, storage, stripe

**Procedures:**
- `publicProcedure`: No authentication required
- `protectedProcedure`: Requires valid JWT token
- `adminProcedure`: Requires admin role

**Module structure pattern:**
```
packages/trpc/src/modules/[module]/
  ├── router.ts      # tRPC router definition
  └── service.ts     # Business logic
```

**Client-side (`@repo/trpc-client`):**
Universal client factory compatible with SvelteKit, React Native, and any JavaScript environment:

```typescript
import { createUniversalTrpcClient } from '@repo/trpc-client';

const trpc = createUniversalTrpcClient({
  baseUrl: 'https://api.example.com/trpc',
  getToken: () => getAuthToken(),
  onUnauthorized: () => redirectToLogin()
});
```

Features:
- Type-safe proxy client using `AppRouter` type from `@repo/trpc`
- Automatic JWT token injection via `Authorization: Bearer` header
- Batch request support via `httpBatchLink`
- Custom 401 handling with `onUnauthorized` callback
- Works in browser, Node.js, and React Native

### Backend Architecture

**Main Entry Point** (`apps/backend/src/index.ts`):
1. `AuthManager` - JWT token management
2. `StorageService` - MinIO client
3. `StripeService` - Stripe API client
4. `QueueManager` - BullMQ job queue initialization
5. Hono app with CORS, logging middleware
6. WebSocket handler at `/ws` - Real-time hunt progress updates
7. Internal broadcast endpoint at `/internal/broadcast` - Worker communication
8. Stripe webhook handler at `/webhook`
9. tRPC handler at `/trpc/*`

**Worker Process** (`apps/backend/src/workers.ts`):
Standalone Node.js process (runs separately from main backend) that processes background jobs:
- Runs in Node.js (not Bun) for Playwright compatibility
- Connects to Redis for job queue
- Broadcasts updates to WebSocket clients via internal endpoint
- Workers registered:
  - `lead-extraction`: Extract contact info from websites
  - `local-business-hunt`: Search Google Maps for local businesses
  - `lead-audit`: Audit and score lead quality
  - `opportunity-scraper`: Scrape job platforms (Upwork, Fiverr, etc.)
  - `opportunity-notifier`: Notify users of new opportunities

**Running Workers**:
```bash
cd apps/backend
bun run workers          # Start worker process (uses tsx for Node.js)
```

**Key Services** (`apps/backend/src/services/`):
- `browser-pool.ts`: Manages pool of Playwright browsers for scraping
- `websocket.ts`: WebSocket connection manager for real-time updates

### Environment Variables

Environment schemas are defined in `packages/env/src/index.ts`:
- `serverEnvSchema`: Backend-only variables (JWT secrets, Stripe keys, MinIO credentials)
- `publicEnvSchema`: Frontend-safe variables (API URLs)

Each app validates its environment on startup via `check-env` script using Zod.

**Required backend variables:**
- `ENCRYPTION_SECRET`: JWT encryption key
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`: Redis for job queue (can use Dragonfly for 25x performance)
- `BACKEND_URL`: Backend URL for worker communication (default: `http://localhost:3001`)
- `FRONTEND_URL`: For CORS
- `TRUSTED_ORIGINS`: Comma-separated allowed origins
- `STRIPE_SECRET_KEY`: Stripe API key (must start with `sk_`)
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook secret (must start with `whsec_`)
- `MINIO_ENDPOINT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET_NAME` (optional)
- `GOOGLE_MAPS_API_KEY`: For local business hunting (optional)
- `SMTP_*`: SMTP credentials for email outreach (optional)

See `apps/backend/.env.example` for complete reference.

### Prisma Multi-Schema Setup

Prisma schema is split into multiple files in `packages/database/prisma/schema/`:
- `base.prisma`: Database config (PostgreSQL)
- `user.prisma`, `account.prisma`, `session.prisma`: Auth models
- `lead.prisma`: Lead data model with audit fields and quality scoring
- `hunt-session-event.prisma`: Hunt session tracking
- `opportunity.prisma`: Job opportunity listings from platforms
- `opportunity-search.prisma`, `opportunity-view.prisma`: User interactions
- `email-outreach.prisma`: Email campaign tracking
- `audit.prisma`: Lead audit results
- `contact.prisma`, `stripe.prisma`, `media.prisma`, `room.prisma`, `message.prisma`: Other features

All schemas are automatically merged by Prisma.

**Development database:**
- Run `bun run dev:db` to start and configure a local PostgreSQL instance
- Database URL is configured via `DATABASE_URL` environment variable
- Default: `postgresql://fangafunk@localhost:5432/myapp`

**Production database:**
- Set `DATABASE_URL` in production environment to your PostgreSQL connection string
- Use `bun run db:migrate:deploy` to apply migrations

### Authentication Flow

Custom JWT-based authentication (not Better Auth):
1. User registers/logs in via `auth` tRPC router
2. Backend returns JWT token signed with `ENCRYPTION_SECRET`
3. Clients store token (localStorage for web, SecureStore for mobile)
4. Token sent in `Authorization: Bearer <token>` header
5. `createContext` verifies token and attaches user to context
6. Protected procedures check `ctx.user` via middleware

Authorization uses role-based access control via `@repo/auth-shared/hasAccess`.

### Stripe Integration

Stripe is integrated for payments:
- `packages/stripe`: Service wrapper around Stripe SDK
- `packages/trpc/src/modules/stripe`: tRPC router for checkout, subscriptions
- `apps/backend/src/handlers/stripe.ts`: Webhook handler for events
- Webhook endpoint: `POST /webhook` (validates signature with `STRIPE_WEBHOOK_SECRET`)

### Storage (S3/MinIO)

File uploads use MinIO (S3-compatible) with a clean client/server separation:

**Server-side (`@repo/storage`):**
- Bun S3Client wrapper for MinIO operations
- Generates pre-signed URLs for secure uploads
- Handles file deletion and metadata
- Used only in backend/tRPC context

**Client-side (`@repo/storage-client`):**
- Browser and React Native compatible upload functions
- `uploadFile(file, presignedUrl, options)`: Upload with progress tracking via XMLHttpRequest
- `uploadFileSimple(file, presignedUrl)`: Simple fetch-based upload
- Type-safe error handling with `UploadError`
- No server dependencies or credentials

**Upload flow:**
1. Client requests pre-signed URL via `trpc.media.getUploadUrl.mutate()`
2. Server generates pre-signed URL (valid 15 minutes) with `storage.client.file(key).presign()`
3. Client uploads directly to S3 using `@repo/storage-client`
4. Client confirms upload via tRPC mutation (e.g., `media.updateAvatar`)

**Configuration:**
- Configured via `MINIO_*` environment variables
- See `packages/trpc/src/modules/media/router.ts` for endpoints

### Internationalization (i18n)

The boilerplate includes a universal i18n system compatible with both SvelteKit and React Native:

**Package (`@repo/i18n`):**
- Type-safe translations with autocomplete
- Nested translation keys (`common.buttons.save`)
- Interpolation support (`{{variable}}`)
- Automatic browser locale detection
- localStorage persistence
- Zero runtime dependencies

**Supported locales:**
- `en` - English (default)
- `fr` - French

**SvelteKit usage:**
```typescript
import { i18n } from '@repo/i18n/svelte';

// In template
{$i18n.t('auth.login.title')}

// Change locale
i18n.setLocale('fr');
```

**React Native usage:**
```typescript
import { useI18n } from '@repo/i18n/react';

const { t, locale, setLocale } = useI18n();

// In component
<Text>{t('auth.login.title')}</Text>

// Change locale
setLocale('fr');
```

**Adding translations:**
1. Add to `packages/i18n/src/locales/en.ts` (source of truth)
2. Add to `packages/i18n/src/locales/fr.ts` (TypeScript enforces same structure)
3. Use via `t('your.new.key')`

**Adding new locales:**
See `packages/i18n/README.md` for detailed instructions.

### Job Queue System (BullMQ + Redis)

The boilerplate includes a robust job queue system for background processing using BullMQ and Redis:

**Package (`@repo/jobs`):**
- Type-safe job definitions with generic data types
- Multiple queue support (email, media, reports, etc.)
- Job scheduling with cron expressions
- Priority queues and retry logic with backoff strategies
- Progress tracking and metrics
- Rate limiting and concurrency control

**Prerequisites:**
- Redis server running locally or remotely
- Environment variables configured (`REDIS_HOST`, `REDIS_PORT`, etc.)

**Setting up Redis:**
```bash
# Docker
docker run -d --name redis -p 6379:6379 redis:alpine

# Homebrew
brew install redis
brew services start redis
```

**Basic usage:**
```typescript
import { QueueManager, createJobConfig, type JobDefinition } from '@repo/jobs';

// Initialize queue manager
const config = createJobConfig({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

const queueManager = new QueueManager(config);

// Define a job
const sendEmailJob: JobDefinition<{ to: string; subject: string }, void> = {
  name: 'send-email',
  processor: async (job) => {
    const { to, subject } = job.data;
    // Send email logic
    await job.updateProgress(100);
  },
  options: {
    concurrency: 5,
  },
};

// Register worker
queueManager.registerWorker('email', sendEmailJob);

// Add job to queue
await queueManager.addJob('email', 'send-email', {
  to: 'user@example.com',
  subject: 'Welcome!',
});
```

**Integration with tRPC:**
1. Initialize `QueueManager` in backend startup
2. Add to tRPC context in `packages/trpc/src/context.ts`
3. Use in procedures: `ctx.jobs.addJob(...)`

**Advanced features:**
- Scheduled jobs with cron: `JobScheduler.scheduleJob()`
- Delayed jobs: `addJob(..., { delay: 60000 })`
- Priority queues: `addJob(..., { priority: JobPriorities.HIGH })`
- Bulk operations: `addBulkJobs()`
- Queue metrics: `getQueueMetrics()`

See `packages/jobs/README.md` and `packages/jobs/examples/` for detailed documentation and examples.

### Lead Generation System

**Core Workflow:**

1. **Hunt Initiation** - User starts a hunt via `trpc.lead.hunt.startHunt`
   - Creates hunt session in database
   - Enqueues background jobs based on hunt type
   - Returns session ID for progress tracking

2. **Background Processing** - Workers process jobs asynchronously
   - `local-business-hunt`: Google Maps search → Extract businesses → Queue lead extractions
   - `lead-extraction`: Scrape website → Extract contact info → Save to database
   - `lead-audit`: Analyze lead quality → Score (HOT/WARM/COLD) → Update lead

3. **Real-time Updates** - WebSocket broadcasts progress to frontend
   - Workers call `globalThis.broadcastToUser()` to send updates
   - Frontend receives live progress via WebSocket connection
   - UI updates without polling

4. **Lead Scoring Algorithm** (`@repo/audit`)
   - Email quality check (generic vs personal)
   - Phone number extraction
   - Technology stack detection
   - Website quality assessment
   - WHOIS domain age analysis
   - Final score: HOT (high quality), WARM (medium), COLD (low)

**Key Packages:**

- `@repo/scraper`: Core web scraping with Playwright/Puppeteer
  - Browser pool management (20 browsers, 15 pages each)
  - Stealth mode to avoid detection
  - Redis caching for deduplication
  - SSRF protection and URL validation

- `@repo/audit`: Lead quality scoring
  - Fast fetch attempt → Browser fallback if needed
  - Email extraction from contact pages
  - Technology detection (React, Vue, WordPress, etc.)
  - WHOIS lookups for domain age

- `@repo/maps`: Google Maps integration
  - Search local businesses by query and location
  - Extract business details (name, address, phone, website)
  - Pagination support for large result sets

- `@repo/hunter`: Lead hunting orchestration
  - Coordinates hunt sessions
  - Manages job dependencies

**Performance Optimizations:**

- BullMQ concurrency: 100 for I/O-bound scraping tasks
- Browser pool: 20 browsers with 15 pages per browser
- Batch operations: 50-1000 leads per batch for database inserts
- Redis caching to avoid duplicate scrapes
- Database indexes on frequently queried fields

See `OPTIMIZATION_GUIDE.md` and `MIGRATION_GUIDE.md` for detailed performance tuning.

## Development Patterns

### Adding a New tRPC Module

1. Create module directory: `packages/trpc/src/modules/[module]/`
2. Create `service.ts` with business logic
3. Create `router.ts` with tRPC procedures
4. Import and add to `appRouter` in `packages/trpc/src/index.ts`

Example:
```typescript
// packages/trpc/src/modules/todo/router.ts
import { router, publicProcedure } from '../../trpc';
import { z } from 'zod';

export const todoRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.todo.findMany();
  }),
  create: publicProcedure
    .input(z.object({ title: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.todo.create({ data: input });
    }),
});

// packages/trpc/src/index.ts
import { todoRouter } from './modules/todo/router';

export const appRouter = router({
  // ...existing routers
  todo: todoRouter,
});
```

### Adding a Prisma Model

1. Create new schema file in `packages/database/prisma/schema/[model].prisma`
2. Define model (it will auto-merge with base config)
3. Run `bun run db:push` or `bun run db:migrate:dev`
4. Prisma client auto-regenerates with new model

### Adding Environment Variables

1. Add to schema in `packages/env/src/index.ts`
2. Update `.env.example` in relevant app(s)
3. `check-env` script will validate on startup

## Common Development Tasks

### Starting Redis

Redis is required for the job queue system:

```bash
# Using Docker (recommended)
docker run -d --name redis -p 6379:6379 redis:alpine

# Or use Dragonfly for 25x better performance
docker run -d --name dragonfly -p 6379:6379 docker.dragonflydb.io/dragonflydb/dragonfly

# Or Homebrew
brew install redis
brew services start redis
```

### Running the Full Stack

For lead generation features to work, you need to run both the backend and Rust workers:

```bash
# Start all apps including backend with Rust workers (default)
bun run dev

# The backend will automatically start both:
# - Main API server (Bun) on port 3001
# - Rust worker process for background jobs (10-15x faster than Node.js)
```

### Debugging Rust Workers

Rust workers run in a separate process for optimal performance:

```bash
# View worker logs in the dev output (look for [rust-workers] prefix)
bun run dev

# Or run Rust workers standalone for debugging
cd packages/rust-workers
cargo run --bin lead-audit-worker

# For detailed logs with backtrace
RUST_BACKTRACE=1 cargo run --bin lead-audit-worker
```

### Monitoring Background Jobs

```bash
# Check BullMQ queue metrics via tRPC
# Or inspect Redis directly
redis-cli
> KEYS bull:*
> HGETALL bull:hunt:active
```

### Cleaning Up Stuck Jobs

```bash
# Cancel stuck hunt sessions
bun run cleanup:stuck-hunts

# Or use the provided scripts
bun run scripts/cleanup-stuck-hunts.ts
bun run scripts/cancel-stuck-audits.ts
bun run scripts/clear-active-jobs.ts
```

### Database Seeding

```bash
cd packages/database
bun run db:seed
```

### Viewing Real-time Logs

The application uses `@repo/logger` with Pino for structured logging:

```bash
# Logs are output in JSON format by default
# Pipe through pino-pretty for readable output (already configured in dev)
```

## Testing

Currently no test infrastructure is set up (see TODO.md).

## Turborepo Task Dependencies

Defined in `turbo.json`:
- `build`: Depends on `db:generate` and `check-env`
- `dev`: Depends on `db:generate` and `check-env`
- `type-check`: Depends on `db:generate`

This ensures Prisma client is generated before builds/dev runs.

## Architecture Notes

### Why Two Processes (Bun + Rust)?

The backend runs in two separate processes:

1. **Main API Server** (Bun) - `apps/backend/src/index.ts`
   - Handles HTTP requests (tRPC, webhooks, WebSocket)
   - Fast startup and better performance for API responses
   - Initializes job queues but doesn't process them

2. **Worker Process** (Rust) - `packages/rust-workers/`
   - Processes background jobs from Redis queue (BullMQ v5 compatible)
   - **10-15x faster** than Node.js/TypeScript workers
   - **10x lower memory usage** thanks to Rust's ownership model
   - **No GC pauses** for consistent performance
   - Uses Chromiumoxide for browser automation
   - Communicates with main server via internal HTTP endpoint

This separation allows:
- Main API to restart quickly without affecting running jobs
- Workers to scale independently
- Better resource isolation
- Optimal performance for CPU-intensive web scraping
- More reliable timeout handling

### WebSocket Architecture

Real-time updates use native WebSocket (not Socket.io):

- Main server manages WebSocket connections
- Workers send updates via internal `/internal/broadcast` endpoint
- Frontend receives live hunt progress without polling
- Connection stored per user ID for targeted broadcasts

### Security Considerations

- SSRF protection: URL validation before scraping
- Rate limiting on scraping workers
- Input validation with Zod schemas
- JWT authentication for all protected routes
- Environment variable validation on startup

## Performance Notes

The system has been optimized for high-throughput lead generation:

- **Concurrency**: 100 parallel scraping jobs (I/O-bound)
- **Browser Pool**: 20 browsers × 15 pages = 300 concurrent page loads
- **Batch Inserts**: 1000 leads per database batch
- **Caching**: Redis caching for duplicate URL prevention
- **Database**: Indexes on frequently queried fields

For detailed optimization guide, see `OPTIMIZATION_GUIDE.md`.

Potential speedup from default settings: **10-20x faster**

## Project Status

This project has evolved from a boilerplate into a full-featured lead generation platform. Core features implemented:

✅ **Completed:**
- Lead extraction from websites
- Local business hunting via Google Maps
- Lead quality scoring and auditing
- Real-time WebSocket updates
- Background job processing
- Email outreach system
- Opportunity scraping from job platforms
- CSV import/export
- Admin dashboard with statistics

⚠️ **Partially Implemented:**
- Stripe integration (boilerplate code present, not used)
- MinIO storage (boilerplate code present, not used)
- Mobile app (boilerplate code, not integrated with lead features)

📋 **TODO:**
- Testing infrastructure
- Email verification
- OAuth providers
- 2FA
- Rate limiting on API endpoints
- Advanced analytics
- Multi-tenancy

## Known Issues

- Workers must run in Node.js (Playwright compatibility)
- High CPU usage during large hunt sessions (expected for web scraping)
- Stuck jobs require manual cleanup (scripts provided)

See migration guides and optimization docs for production deployment recommendations.
