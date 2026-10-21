#!/usr/bin/env bash
# Base de datos de desarrollo en un Postgres local: migraciones, seeds, muestra real y emparejamiento.
#   DEV_DB_URL=postgresql://postgres@/comparacompra_dev?host=/tmp&port=54329 ./scripts/dev-db.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_URL="${ADMIN_URL:-postgresql://postgres@/postgres?host=/tmp&port=54329}"
DB="${DEV_DB_NAME:-comparacompra_dev}"
URL="${DEV_DB_URL:-postgresql://postgres@/$DB?host=/tmp&port=54329}"
psql "$ADMIN_URL" -q -c "drop database if exists $DB" -c "create database $DB"
psql "$URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/scripts/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql "$ROOT"/supabase/seeds/*.sql; do
  psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
cd "$ROOT/ingest"
SUPABASE_DB_URL="$URL" uv run python cli.py load-sample
SUPABASE_DB_URL="$URL" uv run python cli.py match
echo "DATABASE_URL=$URL"
