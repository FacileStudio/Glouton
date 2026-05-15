# Quick setup for local development
setup:
    ./local-dev.sh

# Start local infrastructure (PostgreSQL, Redis)
docker-up:
    DOMAIN=http://localhost:3000 ENCRYPTION_SECRET=local-dev-encryption-secret-change-me docker compose up -d postgres redis

# Stop all Docker services
docker-down:
    DOMAIN=http://localhost:3000 ENCRYPTION_SECRET=local-dev-encryption-secret-change-me docker compose down

# Stop Docker services and remove volumes
docker-clean:
    DOMAIN=http://localhost:3000 ENCRYPTION_SECRET=local-dev-encryption-secret-change-me docker compose down -v

# View Docker logs (all services)
docker-logs:
    DOMAIN=http://localhost:3000 ENCRYPTION_SECRET=local-dev-encryption-secret-change-me docker compose logs -f

# View Docker logs for specific service (usage: just docker-logs-service postgres)
docker-logs-service service:
    DOMAIN=http://localhost:3000 ENCRYPTION_SECRET=local-dev-encryption-secret-change-me docker compose logs -f {{service}}

# Restart Docker services
docker-restart:
    DOMAIN=http://localhost:3000 ENCRYPTION_SECRET=local-dev-encryption-secret-change-me docker compose restart

# Check Docker service status
docker-status:
    DOMAIN=http://localhost:3000 ENCRYPTION_SECRET=local-dev-encryption-secret-change-me docker compose ps

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
