#!/usr/bin/env bash
# Aislado: PostgreSQL efímero local, sin usar conexión ni credenciales del proyecto.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${TEST_PG_PORT:-55479}"
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT >= 1024 && PORT <= 65535 )) || exit 2
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS
export PGSSLMODE=disable
WORK="$(mktemp -d /tmp/embarque-margen-pg.XXXXXX)"
INITDB="$(readlink -f "$(command -v initdb)")"
PG_CTL="$(readlink -f "$(command -v pg_ctl)")"
run_pg() {
  if [[ "$(id -u)" = 0 ]]; then setpriv --reuid=1000 --regid=1000 --clear-groups "$@"; else "$@"; fi
}
if [[ "$(id -u)" = 0 ]]; then chown 1000:1000 "$WORK"; fi
cleanup() { if [[ -f "$WORK/data/postmaster.pid" ]]; then run_pg "$PG_CTL" -D "$WORK/data" -m immediate -w stop > /dev/null; fi; }
trap cleanup EXIT
run_pg "$INITDB" -D "$WORK/data" -A trust -U postgres > "$WORK/init.log"
run_pg "$PG_CTL" -D "$WORK/data" -l "$WORK/server.log" -o "-k '' -p $PORT -c listen_addresses='127.0.0.1'" -w start
psql -X -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "$ROOT/scripts/tests/fixtures/embarque-margen-borrador.sql" | tee "$WORK/results.log"
# Dos conexiones reales: edición sostiene el mutex; aprobación debe leer después del commit y rechazar lo obsoleto.
sql() { psql -X -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
sql -Atc "SELECT public._embarque_snapshot_margen('20000000-0000-0000-0000-000000000003')" > "$WORK/snapshot.json"
cat > "$WORK/editor.sql" <<SQL
BEGIN;
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000001',true), set_config('test.org','00000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
UPDATE conceptos_costo SET monto=1910 WHERE embarque_id='20000000-0000-0000-0000-000000000003';
\! touch $WORK/editor-locked
SELECT pg_sleep(1);
COMMIT;
SQL
sql -f "$WORK/editor.sql" > "$WORK/editor.log" 2>&1 & editor_pid=$!
for _ in {1..100}; do [[ -f "$WORK/editor-locked" ]] && break; sleep 0.02; done
[[ -f "$WORK/editor-locked" ]] || { wait "$editor_pid"; exit 1; }
if sql -v snapshot="$(cat "$WORK/snapshot.json")" > "$WORK/approval-race.log" 2>&1 <<'SQL'
\set VERBOSITY verbose
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000002',false),set_config('test.org','00000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
SELECT aprobar_margen_embarque('20000000-0000-0000-0000-000000000003', :'snapshot'::jsonb,'Caso especial aprobado');
SQL
then echo 'FAIL: concurrent stale approval accepted'; exit 1; fi
wait "$editor_pid"
grep -q '40001.*LC_EMBARQUE_MARGEN_CONFLICTO' "$WORK/approval-race.log"
echo 'PASS: edición concurrente termina antes de aprobar y rechaza snapshot obsoleto' | tee -a "$WORK/results.log"
printf 'Evidencia local: %s\n' "$WORK/results.log"
