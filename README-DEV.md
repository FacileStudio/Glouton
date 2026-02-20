# Glouton - Local Development Guide

This guide will help you set up Glouton for local development on your machine.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Docker Desktop** (or Docker Engine + Docker Compose)
- **Bun** (v1.2.0 or higher) - [Install Bun](https://bun.sh)
- **Node.js** (v18.0.0 or higher)

## Quick Start

The fastest way to get started is using the automated setup script:

```bash
./local-dev.sh
```

This script will:
1. Check prerequisites (Docker, Bun)
2. Start Docker services (PostgreSQL, Redis, MinIO)
3. Install dependencies
4. Run database migrations
5. Display next steps

Then start the development servers:

```bash
bun run dev
```

## Manual Setup

If you prefer to set up manually:

### 1. Start Docker Services

```bash
docker-compose -f docker-compose.dev.yml up -d
```

This starts:
- **PostgreSQL** on `localhost:5432`
- **Redis** on `localhost:6379`
- **MinIO** on `localhost:9000` (console on `9001`)

### 2. Install Dependencies

```bash
bun install
```

### 3. Run Database Migrations

```bash
bash scripts/migrate.sh
```

### 4. Start Development Servers

```bash
bun run dev
```

This starts both frontend and backend in parallel using Turborepo.

## Environment Configuration

All `.env` files have been configured for local development with Docker:

### Backend (`apps/backend/.env`)
- `DATABASE_URL` - PostgreSQL connection (docker)
- `REDIS_HOST/PORT` - Redis connection
- `MINIO_ENDPOINT` - MinIO S3 storage
- `SMTP_*` - Email configuration (update with your credentials)
- `HUNTER_API_KEY` - Hunter.io API key (optional)

### Frontend (`apps/frontend/.env`)
- `VITE_API_URL` - Backend API endpoint
- `PORT` - Frontend dev server port (5173)

### Database (`packages/database/.env`)
- `DATABASE_URL` - For running migrations

## Development Workflow

### Start Everything

```bash
bun run dev
```

Access the applications:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- MinIO Console: http://localhost:9001

### Individual Services

Start services individually if needed:

```bash
cd apps/backend && bun run dev     # Backend only (port 3001)
cd apps/frontend && bun run dev    # Frontend only (port 5173)
```

### Database Management

```bash
bash scripts/start-db-dev.sh       # Start PostgreSQL container
bash scripts/migrate.sh            # Run migrations
```

### Type Checking

```bash
bun run typecheck                  # Check all packages
cd apps/backend && bun run typecheck   # Backend only
cd apps/frontend && bun run check      # Frontend only
```

### Linting

```bash
bun run lint                       # Lint all packages
```

### Building

```bash
bun run build                      # Build all packages
```

## Docker Services

### PostgreSQL

```bash
Container: glouton-dev-postgres
Port: 5432
User: postgres
Password: postgres
Database: myapp
```

### Redis

```bash
Container: glouton-dev-redis
Port: 6379
```

### MinIO

```bash
Container: glouton-dev-minio
API Port: 9000
Console Port: 9001
User: minioadmin
Password: minioadmin
```

Access MinIO console at http://localhost:9001

## Docker Commands

### View Logs

```bash
docker-compose -f docker-compose.dev.yml logs -f
docker-compose -f docker-compose.dev.yml logs -f postgres    # Specific service
```

### Stop Services

```bash
docker-compose -f docker-compose.dev.yml down
```

### Stop and Remove Volumes

```bash
docker-compose -f docker-compose.dev.yml down -v
```

### Restart Services

```bash
docker-compose -f docker-compose.dev.yml restart
```

### Check Service Status

```bash
docker-compose -f docker-compose.dev.yml ps
```

## Troubleshooting

### Port Already in Use

If you get port conflicts, check what's using the ports:

```bash
lsof -i :5432    # PostgreSQL
lsof -i :6379    # Redis
lsof -i :9000    # MinIO
lsof -i :3001    # Backend
lsof -i :5173    # Frontend
```

### Docker Services Not Starting

Check Docker logs:

```bash
docker-compose -f docker-compose.dev.yml logs
```

### Database Connection Issues

Ensure PostgreSQL is healthy:

```bash
docker exec -it glouton-dev-postgres pg_isready -U postgres
```

Connect to database:

```bash
docker exec -it glouton-dev-postgres psql -U postgres -d myapp
```

### Redis Connection Issues

Test Redis:

```bash
docker exec -it glouton-dev-redis redis-cli ping
```

### Clean Slate

If you need to start fresh:

```bash
docker-compose -f docker-compose.dev.yml down -v    # Remove containers and volumes
rm -rf node_modules                                # Remove dependencies
bun install                                        # Reinstall
./local-dev.sh                                     # Run setup again
```

## Project Structure

```
Glouton/
├── apps/
│   ├── backend/              # Hono + tRPC API (port 3001)
│   └── frontend/             # SvelteKit app (port 5173)
├── packages/                 # 21 shared packages
│   ├── auth/                 # JWT authentication
│   ├── database/             # Database schema & migrations
│   ├── hunter/               # Web scraping logic
│   ├── jobs/                 # BullMQ job queues
│   ├── trpc/                 # tRPC routers
│   └── ...
├── docker-compose.dev.yml    # Development services
├── docker-compose.yml        # Production deployment
├── local-dev.sh              # Automated setup script
└── turbo.json                # Turborepo configuration
```

## Key Features

- **Monorepo** - Turborepo for task orchestration
- **Type Safety** - End-to-end TypeScript with tRPC
- **Job Queue** - BullMQ with Redis for async tasks
- **Lead Generation** - Multi-source web scraping (8+ providers)
- **Email Outreach** - SMTP integration
- **File Storage** - MinIO (S3-compatible)
- **Authentication** - JWT-based auth with role-based access

## API Development

### tRPC Procedures

Located in `packages/trpc/src/modules/`:

- `auth/` - Login, register, verify
- `user/` - User management
- `lead/` - Lead operations, hunting, auditing
- `email/` - Email outreach

### Database Schema

Migrations in `packages/database/migrations/`:

- 20+ tables (User, Lead, HuntSession, etc.)
- 13 enums (UserRole, LeadStatus, etc.)
- Full-text search indexes
- Comprehensive relationships

## Additional Scripts

```bash
bun run clean                  # Clean and reinstall
bun run format                 # Format code
bun run cleanup:stuck-hunts    # Maintenance utility
```

## Environment Variables Reference

### Required for Development

- `DATABASE_URL` - Already configured for Docker
- `REDIS_HOST/PORT` - Already configured
- `ENCRYPTION_SECRET` - Already set (dev value)

### Optional API Keys

Add these to `apps/backend/.env` if you need them:

```bash
HUNTER_API_KEY=your_key
APOLLO_API_KEY=your_key
SNOV_API_KEY=your_key
HASDATA_API_KEY=your_key
CONTACTOUT_API_KEY=your_key
GOOGLE_MAPS_API_KEY=your_key
```

### Email Configuration

Update SMTP settings in `apps/backend/.env`:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
```

For Gmail, use [App Passwords](https://support.google.com/accounts/answer/185833).

## Production Deployment

For production deployment using the full stack:

```bash
docker-compose up -d
```

This builds and runs both frontend and backend in production mode.

## Need Help?

- Check the main README.md for project overview
- Review package-specific READMEs in `packages/*/README.md`
- Check Turborepo docs: https://turbo.build
- Check tRPC docs: https://trpc.io
- Check SvelteKit docs: https://kit.svelte.dev
