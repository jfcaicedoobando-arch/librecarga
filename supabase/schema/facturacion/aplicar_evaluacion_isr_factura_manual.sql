-- The invoker capture writes through RLS first. This RPC may only freeze an eligible
-- draft using the values already stored by that writer and the current tenant profile.
CREATE OR REPLACE FUNCTION public.aplicar_evaluacion_isr_factura_manual(p_factura_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_org uuid := public.org_scope();
  v_uid uuid := auth.uid();
  v_factura public.facturas;
  v_cliente public.clientes;
  v_lineas jsonb;
  v_calculo jsonb;
  v_snapshot jsonb;
  v_bloque jsonb;
  v_ret_iva numeric;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF NOT public._isr_documento_habilitado(v_org) THEN RETURN; END IF;
  -- Match both the invoice and line writer policies for an evaluated manual draft.
  IF NOT (public.has_any_role_efectivo(v_uid, ARRAY['admin','admin_org','operador','contador','super_admin']::public.app_role[])
    AND (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'operador')
      OR public.has_role(v_uid,'contador') OR public.has_role(v_uid,'super_admin'))) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_factura FROM public.facturas WHERE id = p_factura_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND OR v_factura.deleted_at IS NOT NULL OR v_factura.origen <> 'manual'
    OR v_factura.estado <> 'Borrador' OR v_factura.proforma_id IS NOT NULL OR v_factura.embarque_id IS NOT NULL
    OR v_factura.sustituye_a IS NOT NULL OR v_factura.snapshot_emision IS NOT NULL
    OR v_factura.facturapi_id IS NOT NULL OR v_factura.facturapi_pendiente_id IS NOT NULL
    OR v_factura.uuid_fiscal IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;
  IF v_factura.evaluacion_fiscal IS NOT NULL THEN RETURN; END IF;
  SELECT * INTO v_cliente FROM public.clientes WHERE id = v_factura.cliente_id AND organization_id = v_org
    AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND OR nullif(upper(btrim(v_factura.rfc_cliente)), '') IS DISTINCT FROM nullif(upper(btrim(v_cliente.rfc)), '') THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;

  PERFORM c.id FROM public.conceptos_factura c WHERE c.factura_id = p_factura_id AND c.deleted_at IS NULL
    ORDER BY c.id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.conceptos_factura c WHERE c.factura_id = p_factura_id AND c.deleted_at IS NULL AND (
    c.organization_id <> v_org OR c.moneda <> v_factura.moneda OR c.proforma_id_origen IS NOT NULL OR c.embarque_id IS NOT NULL
    OR c.origen_fiscal IS NOT NULL OR c.tasa_ret_iva NOT BETWEEN 0 AND 1
    OR (c.tipo_iva IN ('no_objeto','exento','tasa_0') AND c.tasa_ret_iva <> 0)
  )) THEN RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id', c.id, 'cantidad', c.cantidad, 'precio_unitario', c.precio_unitario,
    'moneda', c.moneda, 'tipo_iva', c.tipo_iva, 'tasa_iva_aplicada', c.tasa_iva_aplicada) ORDER BY c.id)
  INTO v_lineas FROM public.conceptos_factura c WHERE c.factura_id = p_factura_id AND c.deleted_at IS NULL;
  IF v_lineas IS NULL THEN RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514'; END IF;

  v_calculo := public._evaluar_documento_isr_resico(v_org, v_cliente.id, v_lineas);
  v_snapshot := v_calculo->'snapshot';
  v_bloque := v_snapshot#>'{bloques,0}';
  IF v_snapshot->>'estado' IS DISTINCT FROM 'confirmado' OR (v_bloque->>'total')::numeric <= 0 THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;
  -- The commercial evaluator calculates ISR. Existing IVA withholding in a
  -- manual draft keeps its own rate and uses the same 0070 grouped arithmetic.
  SELECT t.ret_iva INTO v_ret_iva FROM public._totales_factura_resico_agrupados(p_factura_id) t;
  v_bloque := v_bloque || jsonb_build_object(
    'ret_iva', v_ret_iva, 'total', (v_bloque->>'total')::numeric - v_ret_iva);
  IF (v_bloque->>'total')::numeric <= 0 THEN RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514'; END IF;
  v_snapshot := v_snapshot || jsonb_build_object('factura_id', p_factura_id, 'bloques', jsonb_build_array(v_bloque),
    'emisor', v_calculo#>'{conceptos,0,evaluacion_fiscal,emisor}',
    'receptor', (v_calculo#>'{conceptos,0,evaluacion_fiscal,receptor}') || jsonb_build_object('regimen_fiscal', v_cliente.regimen_fiscal));

  UPDATE public.facturas SET evaluacion_fiscal = v_snapshot WHERE id = p_factura_id AND organization_id = v_org;
  UPDATE public.conceptos_factura c
  SET tasa_ret_isr = (l->>'tasa_ret_isr')::numeric,
      total = (l#>>'{evaluacion_fiscal,base}')::numeric,
      origen_fiscal = jsonb_build_object('captura_id', c.id, 'evaluacion', l->'evaluacion_fiscal')
  FROM jsonb_array_elements(v_calculo->'conceptos') l
  WHERE c.factura_id = p_factura_id AND c.organization_id = v_org AND c.id = (l->>'id')::uuid AND c.deleted_at IS NULL;
  IF NOT EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = p_factura_id AND f.organization_id = v_org
    AND (f.subtotal, f.iva, f.ret_isr, f.ret_iva, f.total) =
      ((v_bloque->>'subtotal')::numeric, (v_bloque->>'iva')::numeric, (v_bloque->>'ret_isr')::numeric,
       (v_bloque->>'ret_iva')::numeric, (v_bloque->>'total')::numeric)) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_evaluacion_isr_factura_manual(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.aplicar_evaluacion_isr_factura_manual(uuid) TO authenticated;
