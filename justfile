# Quick setup for local development
setup:
    ./local-dev.sh

# Start all Docker services (PostgreSQL, Redis, MinIO)
docker-up:
    docker-compose -f docker-compose.dev.yml up -d

# Stop all Docker services
docker-down:
    docker-compose -f docker-compose.dev.yml down

# Stop Docker services and remove volumes
docker-clean:
    docker-compose -f docker-compose.dev.yml down -v

# View Docker logs (all services)
docker-logs:
    docker-compose -f docker-compose.dev.yml logs -f

# View Docker logs for specific service (usage: just docker-logs-service postgres)
docker-logs-service service:
    docker-compose -f docker-compose.dev.yml logs -f {{service}}

# Restart Docker services
docker-restart:
    docker-compose -f docker-compose.dev.yml restart

# Check Docker service status
docker-status:
    docker-compose -f docker-compose.dev.yml ps

# Run database migrations
migrate:
    bash scripts/migrate.sh

# Run development monorepo (frontend + backend)
dev:
    bun run dev

# Run backend only
dev-backend:
    cd apps/backend && bun run dev

# Run frontend only
dev-frontend:
    cd apps/frontend && bun run dev

# Build the monorepo
build:
    bun run build

# Typecheck the codebase
typecheck:
    bun run typecheck

# Lint the codebase
lint:
    bun run lint

# Format code
format:
    bun run format

# Clean and reinstall dependencies
clean:
    bun run clean
