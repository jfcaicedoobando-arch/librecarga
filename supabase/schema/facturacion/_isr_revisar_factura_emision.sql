-- Called after scope/role authorization. Returns the expected PAC identity
-- and document totals for the emission reservation without revealing credentials.
CREATE OR REPLACE FUNCTION public._isr_revisar_factura_emision(p_factura_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_factura public.facturas;
  v_perfil public.perfiles_fiscales_emisor;
  v_cred public.facturapi_credenciales;
  v_cliente public.clientes;
  v_documento jsonb;
  v_lineas jsonb;
  v_ahora jsonb;
  v_evaluacion jsonb;
  v_bloque jsonb;
  v_totales record;
BEGIN
  SELECT * INTO STRICT v_factura FROM public.facturas WHERE id = p_factura_id AND deleted_at IS NULL;
  IF v_factura.evaluacion_fiscal IS NULL THEN
    IF public._isr_documento_habilitado(v_factura.organization_id) THEN
      RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;

  v_documento := v_factura.evaluacion_fiscal;
  v_bloque := v_documento#>'{bloques,0}';
  SELECT * INTO v_cred FROM public.facturapi_credenciales WHERE organization_id = v_factura.organization_id;
  SELECT * INTO v_perfil FROM public.perfiles_fiscales_emisor WHERE organization_id = v_factura.organization_id
    AND ambiente = v_cred.ambiente ORDER BY version DESC LIMIT 1;
  SELECT * INTO v_cliente FROM public.clientes WHERE organization_id = v_factura.organization_id
    AND id = v_factura.cliente_id AND deleted_at IS NULL;
  IF NOT public._isr_documento_habilitado(v_factura.organization_id)
    OR v_factura.estado <> 'Borrador' OR v_factura.facturapi_id IS NOT NULL OR v_factura.uuid_fiscal IS NOT NULL
    OR v_factura.snapshot_emision IS NOT NULL OR v_factura.facturapi_pendiente_id IS NOT NULL
    OR v_documento->>'estado' IS DISTINCT FROM 'confirmado'
    OR v_documento->>'organization_id' IS DISTINCT FROM v_factura.organization_id::text
    OR v_documento->>'cliente_id' IS DISTINCT FROM v_factura.cliente_id::text
    OR v_documento->>'ambiente' IS DISTINCT FROM v_cred.ambiente
    OR v_documento->>'perfil_id' IS DISTINCT FROM v_perfil.id::text
    OR v_documento->>'perfil_version' IS DISTINCT FROM v_perfil.version::text
    OR v_cred.facturapi_org_id IS NULL OR v_cred.facturapi_org_id IS DISTINCT FROM v_perfil.facturapi_org_id
    OR v_bloque->>'moneda' IS DISTINCT FROM v_factura.moneda::text OR v_cliente.id IS NULL
    OR v_documento#>>'{receptor,rfc}' IS DISTINCT FROM upper(btrim(v_cliente.rfc))
    OR v_documento#>>'{receptor,rfc}' IS DISTINCT FROM upper(btrim(v_factura.rfc_cliente))
    OR (v_documento->'receptor' ? 'regimen_fiscal'
      AND v_documento#>>'{receptor,regimen_fiscal}' IS DISTINCT FROM v_cliente.regimen_fiscal) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', c.id, 'cantidad', c.cantidad, 'precio_unitario', c.precio_unitario,
    'moneda', c.moneda, 'tipo_iva', c.tipo_iva, 'tasa_iva_aplicada', c.tasa_iva_aplicada) ORDER BY c.id)
  INTO v_lineas FROM public.conceptos_factura c WHERE c.factura_id = p_factura_id AND c.deleted_at IS NULL;
  IF v_lineas IS NULL THEN RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514'; END IF;
  v_ahora := public._evaluar_documento_isr_resico(v_factura.organization_id, v_factura.cliente_id, v_lineas);
  v_evaluacion := v_ahora->'snapshot';
  IF v_evaluacion->>'estado' IS DISTINCT FROM 'confirmado'
    OR (v_evaluacion->>'regla_version',v_evaluacion->>'precision_version')
      IS DISTINCT FROM (v_documento->>'regla_version', v_documento->>'precision_version')
    OR v_ahora#>'{conceptos,0,evaluacion_fiscal,emisor}' IS DISTINCT FROM v_documento->'emisor'
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_ahora->'conceptos') l JOIN public.conceptos_factura c ON c.id = (l->>'id')::uuid
      WHERE c.organization_id <> v_factura.organization_id OR c.moneda <> v_factura.moneda
        OR c.tasa_ret_isr IS DISTINCT FROM (l->>'tasa_ret_isr')::numeric
        OR c.monto_ret_isr IS DISTINCT FROM (l->>'monto_ret_isr')::numeric
        OR ((c.origen_fiscal->'evaluacion') - ARRAY['emisor','receptor'])
           IS DISTINCT FROM ((l->'evaluacion_fiscal') - ARRAY['emisor','receptor'])
    ) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_totales FROM public._totales_factura_resico_agrupados(p_factura_id);
  IF (v_factura.subtotal, v_factura.iva, v_factura.ret_isr, v_factura.ret_iva, v_factura.total)
    IS DISTINCT FROM ((v_bloque->>'subtotal')::numeric, (v_bloque->>'iva')::numeric,
      (v_bloque->>'ret_isr')::numeric, (v_bloque->>'ret_iva')::numeric, (v_bloque->>'total')::numeric)
    OR (v_totales.subtotal, v_totales.iva, v_totales.ret_isr, v_totales.ret_iva)
      IS DISTINCT FROM (v_factura.subtotal, v_factura.iva, v_factura.ret_isr, v_factura.ret_iva) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object('factura_id', p_factura_id, 'organization_id', v_factura.organization_id,
    'ambiente', v_cred.ambiente, 'credenciales_actualizadas_at', v_cred.updated_at,
    'perfil_id', v_perfil.id, 'perfil_version', v_perfil.version,
    'conceptos_fingerprint', v_documento->'conceptos_fingerprint', 'totales', v_bloque,
    'emisor', jsonb_build_object('facturapi_org_id', v_perfil.facturapi_org_id,
      'rfc', v_perfil.rfc, 'regimen_fiscal', v_perfil.regimen_fiscal, 'codigo_postal', v_perfil.codigo_postal),
    'receptor', jsonb_build_object('rfc', upper(btrim(v_cliente.rfc)), 'regimen_fiscal', v_cliente.regimen_fiscal));
END;
$$;
