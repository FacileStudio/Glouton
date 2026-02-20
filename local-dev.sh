#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Glouton Local Development Setup"
echo "=================================="
echo ""

check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo "❌ Error: $1 is not installed"
        echo "   Please install $1 and try again"
        exit 1
    fi
}

echo "📋 Checking prerequisites..."
check_command docker
check_command docker-compose
check_command bun

if ! docker info &> /dev/null; then
    echo "❌ Error: Docker daemon is not running"
    echo "   Please start Docker and try again"
    exit 1
fi

echo "✅ All prerequisites met"
echo ""

echo "🐳 Starting Docker services (PostgreSQL, Redis, MinIO)..."
docker-compose -f docker-compose.dev.yml up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
timeout=60
elapsed=0
while [ $elapsed -lt $timeout ]; do
    if docker-compose -f docker-compose.dev.yml ps | grep -q "unhealthy"; then
        sleep 2
        elapsed=$((elapsed + 2))
    else
        break
    fi
done

if [ $elapsed -ge $timeout ]; then
    echo "⚠️  Warning: Services may not be fully healthy yet"
    echo "   You can check status with: docker-compose -f docker-compose.dev.yml ps"
else
    echo "✅ All services are healthy"
fi

echo ""
echo "📦 Installing dependencies..."
bun install

echo ""
echo "🗄️  Running database migrations..."
if [ -f "./scripts/migrate.sh" ]; then
    bash ./scripts/migrate.sh
else
    echo "⚠️  Migration script not found, skipping..."
fi

echo ""
echo "✅ Local development environment is ready!"
echo ""
echo "📚 Next steps:"
echo "   1. Start the development servers:"
echo "      bun run dev"
echo ""
echo "   2. Access the applications:"
echo "      - Frontend: http://localhost:5173"
echo "      - Backend: http://localhost:3001"
echo "      - MinIO Console: http://localhost:9001 (minioadmin/minioadmin)"
echo ""
echo "   3. View Docker logs:"
echo "      docker-compose -f docker-compose.dev.yml logs -f"
echo ""
echo "   4. Stop services when done:"
echo "      docker-compose -f docker-compose.dev.yml down"
echo ""
echo "📖 For more information, see README-DEV.md"
