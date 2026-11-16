CREATE OR REPLACE FUNCTION public.reservar_nota_credito_isr(
  p_nota_id uuid, p_organization_id uuid, p_actor uuid, p_updated_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_nota public.factura_notas_credito;
  v_factura public.facturas;
  v_totales record;
  v_intento public.intentos_nota_credito_isr;
  v_esperado jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor IS NULL OR NOT public.has_any_role_in_org_exact(
    p_actor, ARRAY['admin','admin_org','contador']::public.app_role[], p_organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_nota FROM public.factura_notas_credito
  WHERE id = p_nota_id AND organization_id = p_organization_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_nota.estado NOT IN ('Borrador','Aprobada')
    OR v_nota.updated_at IS DISTINCT FROM p_updated_at OR v_nota.uuid_fiscal IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_NC_FACTURA' USING ERRCODE = '23514';
  END IF;
  IF v_nota.facturapi_id IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_INTENTO_ACTIVO' USING ERRCODE = '23505';
  END IF;
  SELECT * INTO v_factura FROM public.facturas
  WHERE id = v_nota.factura_id AND organization_id = p_organization_id AND deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND OR v_factura.evaluacion_fiscal IS NULL OR v_factura.uuid_fiscal IS NULL
    OR v_factura.ambiente IS NULL OR v_factura.snapshot_emision->'evaluacion_fiscal' IS NULL
    OR nullif(v_factura.snapshot_emision#>>'{organizacion_snapshot,facturapi_org_id}','') IS NULL
    OR COALESCE(v_nota.uso_cfdi,'G02') <> 'G02' THEN
    RAISE EXCEPTION 'LC_ISR_NC_FACTURA' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_totales FROM public._isr_totales_nota_credito(v_nota.conceptos);
  IF v_totales.total IS DISTINCT FROM v_nota.monto THEN
    RAISE EXCEPTION 'LC_ISR_NC_TOTAL' USING ERRCODE = '23514';
  END IF;
  v_esperado := jsonb_build_object(
    'tipo','E','nota_id',v_nota.id,'organization_id',v_nota.organization_id,'factura_uuid',upper(v_factura.uuid_fiscal),
    'ambiente',v_factura.ambiente,'emisor',v_factura.snapshot_emision->'organizacion_snapshot',
    'receptor',v_factura.snapshot_emision->'cliente_snapshot',
    'tasas_iva_retenido',(SELECT COALESCE(jsonb_agg(tasa ORDER BY tasa),'[]'::jsonb) FROM (
      SELECT DISTINCT (c->>'tasa_ret_iva')::numeric AS tasa FROM jsonb_array_elements(v_nota.conceptos) c
    ) tasas WHERE tasa>0),
    'datos_factura',jsonb_build_object('tipo_cambio',v_nota.tipo_cambio,'uso_cfdi','G02','metodo_pago','PUE',
      'forma_pago',COALESCE(v_nota.forma_pago,v_factura.forma_pago),'serie',v_nota.serie),
    'totales',jsonb_build_object('moneda',v_nota.moneda,'subtotal',v_totales.subtotal,'iva',v_totales.iva,
      'ret_isr',v_totales.ret_isr,'ret_iva',v_totales.ret_iva,'total',v_totales.total));

  INSERT INTO public.intentos_nota_credito_isr(nota_id,organization_id,actor_id,ambiente,esperado)
    VALUES (p_nota_id,p_organization_id,p_actor,v_factura.ambiente,v_esperado) RETURNING * INTO v_intento;
  UPDATE public.factura_notas_credito SET facturapi_id = 'PENDING:' || v_intento.id::text,
    facturapi_claim_at = v_intento.creado_at WHERE id = p_nota_id;
  RETURN jsonb_build_object('claim','PENDING:' || v_intento.id::text,'esperado',v_esperado);
END;
$fn$;
REVOKE ALL ON FUNCTION public.reservar_nota_credito_isr(uuid,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_nota_credito_isr(uuid,uuid,uuid,timestamptz) TO service_role;
