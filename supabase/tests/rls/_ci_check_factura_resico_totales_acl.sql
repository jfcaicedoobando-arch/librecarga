DO $$
DECLARE signature text; fn oid; client_role text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public._totales_factura_resico_agrupados(uuid)',
    'public.recalc_factura_totales(uuid)',
    'public.guard_factura_totales_conceptos()'
  ] LOOP
    fn:=to_regprocedure(signature);
    IF fn IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=fn
      AND NOT prosecdef AND proowner='postgres'::regrole
      AND proconfig=CASE WHEN signature LIKE 'public._totales_%'
        THEN ARRAY['search_path=pg_catalog, public, pg_temp'] ELSE ARRAY['search_path=public'] END) THEN
      RAISE EXCEPTION 'CI_RESICO_TOTALES_ACL: invalid invoker metadata %',signature;
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_function_privilege(client_role,fn,'EXECUTE') IS DISTINCT FROM (client_role<>'anon') THEN
        RAISE EXCEPTION 'CI_RESICO_TOTALES_ACL: unexpected EXECUTE % %',signature,client_role;
      END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=fn AND a.grantee=0) THEN
      RAISE EXCEPTION 'CI_RESICO_TOTALES_ACL: public execution %',signature;
    END IF;
  END LOOP;
END;
$$;
