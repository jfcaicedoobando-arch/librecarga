\set ON_ERROR_STOP on
-- Focalizado: sólo los permisos corregidos, sin datos de la base activa.
CREATE FUNCTION public.security_test_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION public.security_test_denied(command text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: %',label; RETURN; END;
  RAISE EXCEPTION 'FAIL: % did not reject',label;
END $$;
CREATE FUNCTION public.security_test_nested() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
  PERFORM public._resolver_proveedor_por_nombre('10000000-0000-4000-8000-000000000001','');
  SELECT * INTO r FROM public._refact_reps_bloqueantes('10000000-0000-4000-8000-000000000001');
  IF r.bloqueantes <> 0 OR r.en_verificacion <> 0 THEN RETURN false; END IF;
  PERFORM public._calcular_demoras_montos_contenedor(NULL,'10000000-0000-4000-8000-000000000001',NULL,0,'USD');
  BEGIN
    PERFORM public._assert_receptor_fiscal_valido('10000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  UPDATE public.auditoria_snapshots SET score=score WHERE false;
  RETURN true;
END $$;
SELECT public.security_test_assert(NOT EXISTS(
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('_resolver_proveedor_por_nombre','_refact_reps_bloqueantes',
    '_assert_receptor_fiscal_valido','_calcular_demoras_montos_contenedor')
  AND (has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE'))
),'four helpers deny public execution');
SELECT public.security_test_assert(has_function_privilege('authenticated','public.auditoria_capturar_snapshot(uuid)','EXECUTE'),
  'authorized snapshot capture remains callable');
SELECT public.security_test_assert(has_table_privilege('authenticated','public.auditoria_snapshots','SELECT'),
  'snapshot reading remains available');
SELECT public.security_test_assert(has_table_privilege('service_role','public.auditoria_snapshots','INSERT,UPDATE,DELETE'),
  'server snapshot writes remain available');
SET ROLE authenticated;
SELECT public.security_test_denied($q$SELECT public._resolver_proveedor_por_nombre('10000000-0000-4000-8000-000000000001','Proveedor')$q$,'direct supplier lookup rejected');
SELECT public.security_test_denied($q$SELECT public._refact_reps_bloqueantes('10000000-0000-4000-8000-000000000001')$q$,'direct payment counts rejected');
SELECT public.security_test_denied($q$SELECT public._assert_receptor_fiscal_valido('10000000-0000-4000-8000-000000000001')$q$,'direct tax lookup rejected');
SELECT public.security_test_denied($q$SELECT public._calcular_demoras_montos_contenedor(NULL,'10000000-0000-4000-8000-000000000001',NULL,0,'USD')$q$,'direct delay calculation rejected');
SELECT public.security_test_denied($q$INSERT INTO public.auditoria_snapshots(score) VALUES(100)$q$,'caller cannot insert audit score');
SELECT public.security_test_denied($q$UPDATE public.auditoria_snapshots SET score=100$q$,'caller cannot rewrite historical audit score');
SELECT public.security_test_denied($q$DELETE FROM public.auditoria_snapshots$q$,'caller cannot delete audit history');
SELECT public.security_test_assert(public.security_test_nested(),'owner calls and server writes survive revoked public access');
RESET ROLE;
-- No test functions are included in the regenerated schema reference.
DROP FUNCTION public.security_test_nested();
DROP FUNCTION public.security_test_denied(text,text);
DROP FUNCTION public.security_test_assert(boolean,text);