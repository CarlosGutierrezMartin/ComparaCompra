#!/usr/bin/env bash
# Aplica las migraciones y ejecuta los tests pgTAP contra un Postgres local sin Docker.
# Requiere Postgres 16+ con pgvector y pgTAP instalados. En CI se usa `supabase test db`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DATA="${PGDATA_TEST:-/tmp/comparacompra-pg}"
PORT="${PGPORT_TEST:-54329}"
run_pg() { if [ "$(id -u)" = "0" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

if [ ! -f "$DATA/PG_VERSION" ]; then
  mkdir -p "$DATA"; [ "$(id -u)" = "0" ] && chown postgres "$DATA"
  run_pg "$PGBIN/initdb -D $DATA -U postgres -A trust >/dev/null"
fi
if ! run_pg "$PGBIN/pg_ctl -D $DATA status >/dev/null 2>&1"; then
  run_pg "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp' -l $DATA/log -w start >/dev/null"
fi
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "drop database if exists comparacompra_test" -c "create database comparacompra_test"
$PSQL -d comparacompra_test -f "$ROOT/supabase/tests/local/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -d comparacompra_test -f "$f"; done
for f in "$ROOT"/supabase/seeds/*.sql; do $PSQL -d comparacompra_test -f "$f"; done
$PSQL -d comparacompra_test -c "create extension if not exists pgtap"
fail=0
for t in "$ROOT"/supabase/tests/database/*.sql; do
  out="$($PSQL -d comparacompra_test -At -f "$t" 2>&1)" || { echo "$out"; fail=1; continue; }
  echo "$out" | grep -E "^(not ok|ok|#)" || true
  if echo "$out" | grep -qE "^not ok|Looks like"; then fail=1; fi
done
exit $fail
