#!/usr/bin/env bash
# Local, focalizado: baseline existente + tabulador de comisiones de brokers; sin replay ni suites globales.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS
export PGSSLMODE=disable
WORK=$(mktemp -d /tmp/broker-tabulador.XXXXXX)
INITDB=$(readlink -f "$(command -v initdb)"); PG_CTL=$(readlink -f "$(command -v pg_ctl)")
run_pg() {
  if [[ "$(id -u)" = 0 ]]; then setpriv --reuid=1000 --regid=1000 --clear-groups "$@"; else "$@"; fi
}
if [[ "$(id -u)" = 0 ]]; then chown 1000:1000 "$WORK"; fi
cleanup() { test ! -f "$WORK/data/postmaster.pid" || run_pg "$PG_CTL" -D "$WORK/data" -m immediate -w stop >/dev/null; }
trap cleanup EXIT
run_pg "$INITDB" -D "$WORK/data" -A trust -U postgres > "$WORK/init.log"
run_pg "$PG_CTL" -D "$WORK/data" -l "$WORK/server.log" -o "-k '' -p 55482 -c listen_addresses='127.0.0.1'" -w start
export PGHOST=127.0.0.1 PGPORT=55482 PGUSER=postgres PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/rls/_ci_bootstrap.sql" > "$WORK/bootstrap.log" 2>&1
psql -X -v ON_ERROR_STOP=1 -c 'CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;' > "$WORK/extensions.log" 2>&1
{ printf 'SET check_function_bodies=false;\n'; tail -n +2 "$ROOT/supabase/schema/baseline.sql"; } > "$WORK/restore.sql"
psql -X -v ON_ERROR_STOP=1 -f "$WORK/restore.sql" > "$WORK/restore.log" 2>&1 || { tail -15 "$WORK/restore.log"; exit 1; }
psql -X -v ON_ERROR_STOP=1 -f "$ROOT/drizzle/migrations/0084_brokers_tabulador_comisiones.sql" > "$WORK/migration.log" 2>&1
psql -X -v ON_ERROR_STOP=1 -f "$ROOT/scripts/tests/fixtures/broker-tabulador.sql" 2>&1 | tee "$WORK/tests.log"; test "${PIPESTATUS[0]}" = 0
OUT="$WORK/baseline-after.sql"
if [[ "${1:-}" = --snapshot ]]; then OUT="$ROOT/supabase/schema/baseline.sql"; fi
bash "$ROOT/scripts/db/schema-snapshot.sh" "$OUT"
printf 'Evidencia local: %s\nSnapshot generado: %s\n' "$WORK" "$OUT"