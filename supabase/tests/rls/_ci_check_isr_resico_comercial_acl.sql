DO $$
DECLARE
  fn text;
  oid_fn regprocedure;
  rol text;
  esperado boolean;
  privilegio text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public._isr_documento_habilitado(uuid)',
    'public._isr_snapshot_documento(uuid,uuid,text,jsonb)',
    'public._evaluar_documento_isr_resico(uuid,uuid,jsonb)',
    'public.evaluar_documento_isr_resico(uuid,uuid,jsonb,uuid,uuid)',
    'public.obtener_evaluacion_fiscal_embarque(uuid)',
    'public.revisar_cotizacion_fiscal(uuid,text,text)',
    'public.validar_cotizacion_fiscal_envio(uuid,text,uuid)'
  ]) LOOP
    oid_fn := to_regprocedure(fn);
    IF oid_fn IS NULL OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=oid_fn AND proowner='postgres'::regrole) THEN
      RAISE EXCEPTION 'CI_ISR_COMERCIAL_ACL: missing function or owner %', fn;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid=oid_fn AND a.grantee=0) THEN
      RAISE EXCEPTION 'CI_ISR_COMERCIAL_ACL: PUBLIC execute on %', fn;
    END IF;
    FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      esperado := (rol='authenticated' AND fn IN (
        'public.evaluar_documento_isr_resico(uuid,uuid,jsonb,uuid,uuid)',
        'public.obtener_evaluacion_fiscal_embarque(uuid)', 'public.revisar_cotizacion_fiscal(uuid,text,text)'
      )) OR (rol='service_role' AND fn='public.validar_cotizacion_fiscal_envio(uuid,text,uuid)');
      IF has_function_privilege(rol, oid_fn, 'EXECUTE') IS DISTINCT FROM esperado THEN
        RAISE EXCEPTION 'CI_ISR_COMERCIAL_ACL: unexpected execute on % for %', fn, rol;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.cotizacion_revisiones_fiscales')
    AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'CI_ISR_COMERCIAL_ACL: review table must enforce RLS';
  END IF;
  FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH privilegio IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      esperado := privilegio='SELECT' AND rol<>'anon';
      IF has_table_privilege(rol, 'public.cotizacion_revisiones_fiscales', privilegio) IS DISTINCT FROM esperado THEN
        RAISE EXCEPTION 'CI_ISR_COMERCIAL_ACL: unexpected % on review table for %', privilegio, rol;
      END IF;
    END LOOP;
  END LOOP;
END
$$;
