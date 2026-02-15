#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

DB_URL=$1

if [ -z "$DB_URL" ]; then
  echo "Usage: $0 <DATABASE_URL>"
  exit 1
fi

MIGRATIONS_DIR="../packages/database/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Error: Migrations directory '$MIGRATIONS_DIR' not found."
  exit 1
fi

echo "Applying migrations from $MIGRATIONS_DIR to $DB_URL"

find "$MIGRATIONS_DIR" -name "*.sql" | sort | while read -r migration_file; do
  echo "Applying $migration_file..."
  psql "$DB_URL" -f "$migration_file"
  echo "Successfully applied $migration_file."
done

echo "All migrations applied successfully."
