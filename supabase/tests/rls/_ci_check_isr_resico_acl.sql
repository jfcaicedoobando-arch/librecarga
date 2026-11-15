-- Assert canonical permissions before and after blanket harness grants.
DO $$
DECLARE sig text; fn oid; r text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    '_evaluar_isr_resico(uuid,uuid,text,numeric,numeric,text)',
    'evaluar_isr_resico(uuid,uuid,text,numeric,numeric,text)',
    '_isr_guard_concepto()', '_isr_guard_cotizacion()', '_isr_guard_padre()',
    '_isr_guard_conversion_factura()'
  ] LOOP
    fn:=to_regprocedure('public.'||sig);
    IF fn IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=fn AND prosecdef
      AND proowner='postgres'::regrole AND proconfig=ARRAY['search_path=pg_catalog, public, pg_temp']) THEN
      RAISE EXCEPTION 'CI_ISR_ACL: missing or invalid function %',sig;
    END IF;
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_function_privilege(r,fn,'EXECUTE') IS DISTINCT FROM
        (r='authenticated' AND sig='evaluar_isr_resico(uuid,uuid,text,numeric,numeric,text)') THEN
        RAISE EXCEPTION 'CI_ISR_ACL: unexpected privilege % %',r,sig;
      END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=fn AND a.grantee=0) THEN
      RAISE EXCEPTION 'CI_ISR_ACL: PUBLIC execution %',sig;
    END IF;
  END LOOP;
END;
$$;
