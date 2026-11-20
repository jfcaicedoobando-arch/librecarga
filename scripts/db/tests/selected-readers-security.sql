-- Sólo base local aislada con esquema real y definiciones vivas previas.
-- psql -v candidate=/ruta/al/ajuste.sql -f scripts/db/tests/selected-readers-security.sql
BEGIN;
\ir selected-readers-security-fixture.sql
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE reader_before AS SELECT
 public.calcular_demoras_embarque('00000000-0000-0000-0000-000000000012') AS demora,
 public.pago_detalle('cobro','00000000-0000-0000-0000-000000000041') AS pago;
RESET ROLE;
\i :candidate
SET LOCAL ROLE authenticated;
-- 1–2. Respuestas e importes de un usuario legítimo son idénticos.
DO $$ BEGIN
 IF public.calcular_demoras_embarque('00000000-0000-0000-0000-000000000012') IS DISTINCT FROM (SELECT demora FROM reader_before) THEN RAISE EXCEPTION 'Cambió cálculo de demoras'; END IF;
 IF public.pago_detalle('cobro','00000000-0000-0000-0000-000000000041') IS DISTINCT FROM (SELECT pago FROM reader_before) THEN RAISE EXCEPTION 'Cambió detalle del cobro'; END IF;
 IF (SELECT demora->>'total_costo' FROM reader_before)::numeric<>300 OR (SELECT demora->>'total_venta_usd' FROM reader_before)::numeric<>60 THEN RAISE EXCEPTION 'Fixture debe calcular MXN 300 de costo y USD 60 de venta'; END IF;
END $$;
-- 3. Embarque ajeno y embarque inexistente devuelven el mismo resultado no sensible.
DO $$ BEGIN
 IF public.calcular_demoras_embarque('00000000-0000-0000-0000-000000000022') IS DISTINCT FROM public.calcular_demoras_embarque('ffffffff-ffff-ffff-ffff-ffffffffffff') THEN RAISE EXCEPTION 'Se revela embarque ajeno'; END IF;
END $$;
-- 4. RLS del detalle impide leer cobros ajenos.
DO $$ BEGIN
 BEGIN
  PERFORM public.pago_detalle('cobro','00000000-0000-0000-0000-000000000051');
  RAISE EXCEPTION 'Leyó cobro ajeno';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'LC_PAGO_DETALLE_NO_ENCONTRADO:%' THEN RAISE; END IF;
 END;
END $$;
-- 5. Recalcular no duplica los conceptos activos.
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.conceptos_costo WHERE embarque_id='00000000-0000-0000-0000-000000000012' AND origen='demoras_auto' AND deleted_at IS NULL)<>1
 OR (SELECT count(*) FROM public.conceptos_venta WHERE embarque_id='00000000-0000-0000-0000-000000000012' AND origen='demoras_auto' AND deleted_at IS NULL)<>1 THEN RAISE EXCEPTION 'Demoras duplicadas'; END IF;
 IF EXISTS(SELECT 1 FROM public.conceptos_costo WHERE organization_id='00000000-0000-0000-0000-000000000020') THEN RAISE EXCEPTION 'Modificó otra empresa'; END IF;
END $$;
-- 6. El disparador real de fechas de contenedor mantiene el recálculo.
SET LOCAL ROLE authenticated;
UPDATE public.embarque_contenedores SET fecha_devolucion='2026-11-07' WHERE id='00000000-0000-0000-0000-000000000034';
RESET ROLE;
DO $$ BEGIN
 IF (SELECT sum(monto) FROM public.conceptos_costo WHERE embarque_id='00000000-0000-0000-0000-000000000012' AND origen='demoras_auto' AND deleted_at IS NULL)<>400 THEN RAISE EXCEPTION 'Disparador dejó de recalcular'; END IF;
END $$;
-- 7. El usuario de B conserva acceso a su propio embarque y cobro.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.calcular_demoras_embarque('00000000-0000-0000-0000-000000000022') ? 'error' THEN RAISE EXCEPTION 'Bloqueó embarque propio'; END IF;
 IF public.pago_detalle('cobro','00000000-0000-0000-0000-000000000051')->'pago'->>'monto'<>'116' THEN RAISE EXCEPTION 'Bloqueó cobro propio'; END IF;
END $$;
RESET ROLE;
-- 8–9. Superadministración respeta la empresa activa de la misma forma que RLS.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF NOT (public.calcular_demoras_embarque('00000000-0000-0000-0000-000000000022') ? 'error') THEN RAISE EXCEPTION 'Superadmin fuera de empresa activa'; END IF;
 IF public.calcular_demoras_embarque('00000000-0000-0000-0000-000000000012') ? 'error' THEN RAISE EXCEPTION 'Superadmin perdió empresa activa'; END IF;
 BEGIN
  PERFORM public.pago_detalle('cobro','00000000-0000-0000-0000-000000000051');
  RAISE EXCEPTION 'Superadmin leyó cobro fuera de empresa activa';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'LC_PAGO_DETALLE_NO_ENCONTRADO:%' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
-- 10. Las seis variantes conservan validación y no exponen registros inexistentes.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['cobro','pago','anticipo','devolucion_anticipo','lote','lote_cobro'] LOOP
  BEGIN
   PERFORM public.pago_detalle(t,'ffffffff-ffff-ffff-ffff-ffffffffffff');
   RAISE EXCEPTION 'Tipo % expuso registro inexistente',t;
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT LIKE 'LC_PAGO_DETALLE_NO_ENCONTRADO:%' THEN RAISE; END IF;
  END;
 END LOOP;
END $$;
RESET ROLE;
-- 11–12. Sin acceso anónimo; no se eliminan permisos legítimos de ejecución.
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.calcular_demoras_embarque('00000000-0000-0000-0000-000000000012'); RAISE EXCEPTION 'Anon accedió a demoras'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.pago_detalle('cobro','00000000-0000-0000-0000-000000000041'); RAISE EXCEPTION 'Anon accedió a pago'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT has_function_privilege('authenticated','public.calcular_demoras_embarque(uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.pago_detalle(text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.calcular_demoras_embarque(uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.pago_detalle(text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'ACL legítima perdida'; END IF;
END $$;
ROLLBACK;
SELECT '12 verificaciones focalizadas correctas' AS resultado;