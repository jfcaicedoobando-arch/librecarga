#!/usr/bin/env bash
# Sólo una base local VACÍA de pruebas; no crea ni toca cobros reales.
set -euo pipefail
if [[ "${PGHOST:-}" != "127.0.0.1" || "${PGDATABASE:-}" != lc_broker_test* ]]; then
  echo 'Usar PGHOST=127.0.0.1 y una base vacía PGDATABASE=lc_broker_test*'; exit 1
fi
export PGSSLMODE=disable
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
python3 - "$TEMP_DIR" <<'PY'
from pathlib import Path
import sys
out=Path(sys.argv[1])
text=Path('drizzle/migrations/0064_brokers_fase3_comisiones.sql').read_text()
start=text.index('CREATE FUNCTION public._broker_de_pago(')
end=text.index('-- KAM en cuenta',start)
(out/'owner.sql').write_text(text[start:end])
text=Path('drizzle/migrations/0084_brokers_tabulador_comisiones.sql').read_text()
start=text.index('CREATE FUNCTION public._broker_tabulador(')
end=text.index('CREATE FUNCTION public.crm_brokers_recalcular_comisiones()',start)
(out/'calculations.sql').write_text(text[start:end])
text=Path('supabase/migrations/20260722132715_463f05d5-b727-4d1c-8d98-1c43e6b2cf36.sql').read_text()
start=text.index('CREATE OR REPLACE FUNCTION public.convertir_a_mxn(')
end=text.index('$$;',text.index('AS $$',start))+3
(out/'convert.sql').write_text(text[start:end])
PY
psql -X -v ON_ERROR_STOP=1 \
  -f scripts/db/tests/broker-comision-exclusiva-fixture.sql \
  -f "$TEMP_DIR/convert.sql" -f "$TEMP_DIR/owner.sql" -f "$TEMP_DIR/calculations.sql" \
  -f drizzle/migrations/0089_brokers_comision_exclusiva_sin_kam.sql \
  -c 'CREATE TRIGGER trg_b00_comision_kam_broker BEFORE INSERT OR UPDATE ON public.comisiones_devengadas FOR EACH ROW EXECUTE FUNCTION public._comision_kam_broker(); CREATE TRIGGER trg_comision_broker_sync AFTER INSERT OR UPDATE ON public.comisiones_devengadas FOR EACH ROW EXECUTE FUNCTION public._comision_broker_sync();' \
  -f scripts/db/tests/broker-comision-exclusiva.sql \
  -f scripts/db/tests/security-membership-invoker.sql