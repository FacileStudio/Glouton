# Run development monorepo
dev:
    bun run dev

# Build the monorepo
build:
    bun run build

# Typecheck the codebase
typecheck:
    bun run typecheck

# Lint the codebase
lint:
    bun run lint

# Run MinIO server
minio:
    ./scripts/start-minio.sh

# Configure MinIO server
config-minio:
    ./scripts/alias-minio.sh
    ./scripts/allow-minio.sh

# Start Dev DB
db:
    ./scripts/start-db-dev.sh
