DO $$
DECLARE
  fn text;
  oid_fn regprocedure;
  rol text;
  esperado boolean;
  privilegio text;
  tabla text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public._isr_documento_habilitado(uuid)',
    'public._isr_snapshot_documento(uuid,uuid,text,jsonb)',
    'public._evaluar_documento_isr_resico(uuid,uuid,jsonb)',
    'public.evaluar_documento_isr_resico(uuid,uuid,jsonb,uuid,uuid)',
    'public.obtener_evaluacion_fiscal_embarque(uuid)',
    'public.revisar_cotizacion_fiscal(uuid,text,text)',
    'public.validar_cotizacion_fiscal_envio(uuid,text,uuid)',
    'public._isr_base_revision_venta(jsonb)',
    'public._isr_plan_revision_embarque(uuid,uuid,jsonb)',
    'public.preparar_revision_fiscal_embarque(uuid,uuid,jsonb,timestamptz)',
    'public._isr_concepto_proforma_normal(jsonb)', 'public._isr_snapshot_proforma_normal(uuid,uuid,uuid,uuid[])',
    'public._isr_guard_proforma_normal()', 'public._isr_validar_vinculo_proforma_normal(jsonb,jsonb)',
    'public._liberar_conceptos_proforma_portal(uuid,uuid)', 'public._h14_lock_grafo_baja_embarque(uuid,boolean)',
    'public._isr_armar_consolidacion_proformas(uuid[],uuid,uuid,uuid)',
    'public._isr_guard_concepto_consolidado()', 'public._isr_insertar_grupos_consolidacion(uuid,uuid,uuid,jsonb)',
    'public._isr_consolidar_proformas(uuid,uuid,uuid,uuid[])', 'public.aprobar_ajuste_consolidacion_proforma(uuid,text)',
    'public._isr_validar_conversion_proforma(uuid)', 'public._isr_insertar_conceptos_factura(uuid,uuid,uuid,boolean,public.moneda)',
    'public._isr_convertir_proforma_a_facturas(uuid,uuid,text,text,text,integer,text,date)',
    'public._isr_guard_borrador_convertido()', 'public._isr_guard_concepto_factura_convertida()',
    'public._isr_revisar_factura_emision(uuid)', 'public.aplicar_evaluacion_isr_factura_manual(uuid)',
    'public.prevalidar_emision_isr_factura(uuid)',
    'public._isr_validar_estado_timbrado_factura(public.facturas,public.facturas)',
    'public.reservar_timbrado_isr(uuid,uuid,jsonb,jsonb)',
    'public.registrar_resultado_timbrado_isr(uuid,text,text,jsonb)'
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
        'public.obtener_evaluacion_fiscal_embarque(uuid)', 'public.revisar_cotizacion_fiscal(uuid,text,text)',
        'public.preparar_revision_fiscal_embarque(uuid,uuid,jsonb,timestamptz)',
        'public.aprobar_ajuste_consolidacion_proforma(uuid,text)', 'public.aplicar_evaluacion_isr_factura_manual(uuid)',
        'public.prevalidar_emision_isr_factura(uuid)'
      )) OR (rol='service_role' AND fn IN ('public.validar_cotizacion_fiscal_envio(uuid,text,uuid)',
        'public.reservar_timbrado_isr(uuid,uuid,jsonb,jsonb)', 'public.registrar_resultado_timbrado_isr(uuid,text,text,jsonb)'));
      IF has_function_privilege(rol, oid_fn, 'EXECUTE') IS DISTINCT FROM esperado THEN
        RAISE EXCEPTION 'CI_ISR_COMERCIAL_ACL: unexpected execute on % for %', fn, rol;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH tabla IN ARRAY ARRAY['public.cotizacion_revisiones_fiscales','public.embarque_revisiones_fiscales',
    'public.proforma_liberaciones_portal','public.intentos_timbrado_isr'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass(tabla) AND relrowsecurity AND relforcerowsecurity) THEN
      RAISE EXCEPTION 'CI_ISR_COMERCIAL_ACL: % must enforce RLS', tabla;
    END IF;
    FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      FOREACH privilegio IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
        esperado := privilegio='SELECT' AND rol<>'anon'
          AND tabla NOT IN ('public.proforma_liberaciones_portal','public.intentos_timbrado_isr');
        IF has_table_privilege(rol, tabla, privilegio) IS DISTINCT FROM esperado THEN
          RAISE EXCEPTION 'CI_ISR_COMERCIAL_ACL: unexpected % on % for %', privilegio, tabla, rol;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END
$$;
