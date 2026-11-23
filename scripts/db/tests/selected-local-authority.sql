-- Sólo base local aislada; devuelve todos los cambios y conserva importes.
-- psql -v candidate=/ruta/al/ajuste.sql -f scripts/db/tests/selected-local-authority.sql
BEGIN;
\ir selected-local-authority-fixture.sql
CREATE FUNCTION pg_temp.proforma_capture() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb; BEGIN
 BEGIN
  SELECT jsonb_build_object('subtotal',t.subtotal_mxn,'iva',t.iva_mxn,'total',t.total_mxn) INTO r
  FROM public.crear_proforma_atomica('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000011','Cliente A','ELIMP00001','',ARRAY['00000000-0000-0000-0000-000000000064'::uuid],0,0,0,100,0,100,'','',15,0,'{}'::jsonb) t;
  RAISE EXCEPTION 'Revertir caso temporal' USING ERRCODE='PT900';
 EXCEPTION WHEN SQLSTATE 'PT900' THEN NULL; END;
 RETURN r;
END $$;
CREATE FUNCTION pg_temp.delete_capture() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb; BEGIN
 BEGIN
  r:=public.eliminar_pago_cliente('00000000-0000-0000-0000-000000000041','Prueba aislada');
  RAISE EXCEPTION 'Revertir caso temporal' USING ERRCODE='PT900';
 EXCEPTION WHEN SQLSTATE 'PT900' THEN NULL; END;
 RETURN r;
END $$;
CREATE FUNCTION pg_temp.link_capture() RETURNS text LANGUAGE plpgsql AS $$ BEGIN
 BEGIN
  PERFORM public.crm_vincular_cotizacion('00000000-0000-0000-0000-000000000062','{}',NULL,'ffffffff-ffff-ffff-ffff-ffffffffffff');
 EXCEPTION WHEN SQLSTATE '22023' THEN RETURN SQLERRM; END;
 RAISE EXCEPTION 'Se esperaba origen no elegible';
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE before_authority AS SELECT
 (SELECT jsonb_agg(x) FROM public.obtener_costos_cotizacion_version('00000000-0000-0000-0000-000000000062') x) AS costos,
 (SELECT jsonb_agg(x) FROM public.obtener_costos_cotizacion_version('00000000-0000-0000-0000-000000000062',0) x) AS historicos,
 pg_temp.proforma_capture() AS proforma,
 NULL::jsonb AS pago,
 public.duplicar_embarque_completo('00000000-0000-0000-0000-000000000012','[]',NULL) AS duplicado,
 pg_temp.link_capture() AS vinculo;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}',true);
UPDATE before_authority SET pago=pg_temp.delete_capture();
RESET ROLE;
-- Reproduce un rol global de mayor privilegio que la membresía efectiva local.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.obtener_costos_cotizacion_version('00000000-0000-0000-0000-000000000062'))<>1 THEN RAISE EXCEPTION 'No reproduce lector de costos amplio'; END IF;
 PERFORM pg_temp.proforma_capture();
 PERFORM pg_temp.delete_capture();
 PERFORM public.duplicar_embarque_completo('00000000-0000-0000-0000-000000000012','[]',NULL);
 PERFORM pg_temp.link_capture();
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000006","role":"authenticated"}',true);
SELECT pg_temp.link_capture();
RESET ROLE;
\i :candidate
-- 1–6. La autoridad legítima y los resultados monetarios se conservan.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT jsonb_agg(x) FROM public.obtener_costos_cotizacion_version('00000000-0000-0000-0000-000000000062') x) IS DISTINCT FROM (SELECT costos FROM before_authority) THEN RAISE EXCEPTION 'Cambió costo actual autorizado'; END IF;
 IF (SELECT jsonb_agg(x) FROM public.obtener_costos_cotizacion_version('00000000-0000-0000-0000-000000000062',0) x) IS DISTINCT FROM (SELECT historicos FROM before_authority) THEN RAISE EXCEPTION 'Cambió costo histórico autorizado'; END IF;
 IF pg_temp.proforma_capture() IS DISTINCT FROM (SELECT proforma FROM before_authority) OR (SELECT proforma->>'total' FROM before_authority)::numeric<>100 THEN RAISE EXCEPTION 'Cambió proforma monetaria'; END IF;
 IF public.duplicar_embarque_completo('00000000-0000-0000-0000-000000000012','[]',NULL) IS DISTINCT FROM (SELECT duplicado FROM before_authority) THEN RAISE EXCEPTION 'Cambió entrada autorizada de duplicación'; END IF;
 IF pg_temp.link_capture() IS DISTINCT FROM (SELECT vinculo FROM before_authority) THEN RAISE EXCEPTION 'Cambió validación comercial autorizada'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}',true);
DO $$ BEGIN
 IF pg_temp.delete_capture() IS DISTINCT FROM (SELECT pago FROM before_authority) THEN RAISE EXCEPTION 'Cambió reversión autorizada'; END IF;
END $$;
RESET ROLE;
-- 7–11. Un rol global no sustituye las cinco autorizaciones de membresía local.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.obtener_costos_cotizacion_version('00000000-0000-0000-0000-000000000062'); RAISE EXCEPTION 'Costos no protegidos'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM pg_temp.proforma_capture(); RAISE EXCEPTION 'Proforma no protegida'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM pg_temp.delete_capture(); RAISE EXCEPTION 'Pago no protegido'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.duplicar_embarque_completo('00000000-0000-0000-0000-000000000012','[]',NULL); RAISE EXCEPTION 'Duplicación no protegida'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000006","role":"authenticated"}',true);
DO $$ BEGIN
 BEGIN PERFORM pg_temp.link_capture(); RAISE EXCEPTION 'Vínculo no protegido'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- 12. Las pruebas de escritura no dejaron documentos ni pagos alterados.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.proformas) THEN RAISE EXCEPTION 'Se dejó una proforma temporal'; END IF;
 IF EXISTS(SELECT 1 FROM public.pagos_factura WHERE deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'Se alteró un pago'; END IF;
END $$;
ROLLBACK;
\echo '12 verificaciones de autoridad local: OK'