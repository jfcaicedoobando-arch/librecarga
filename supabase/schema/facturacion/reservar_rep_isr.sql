CREATE OR REPLACE FUNCTION public.reservar_rep_isr(
  p_pago_id uuid, p_organization_id uuid, p_actor uuid, p_updated_at timestamptz, p_esperado jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_pago public.pagos_factura;
  v_factura public.facturas;
  v_intento public.intentos_rep_isr;
  v_cobro jsonb := p_esperado->'pago';
  v_documento jsonb := p_esperado->'documento';
  v_org jsonb;
  v_cliente jsonb;
  v_notas record;
  v_previos bigint;
  v_anteriores numeric;
  v_rompe_secuencia boolean;
  v_saldo numeric;
  v_equivalencia numeric;
  v_claim text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor IS NULL OR NOT public.has_any_role_in_org_exact(
    p_actor, ARRAY['admin','admin_org','contador','ejecutivo_cobranza']::public.app_role[], p_organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_pago FROM public.pagos_factura
  WHERE id=p_pago_id AND organization_id=p_organization_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_pago.updated_at IS DISTINCT FROM p_updated_at OR v_pago.estado_rep NOT IN ('Pendiente','Error','Cancelado')
    OR (v_pago.estado_rep <> 'Cancelado' AND (v_pago.facturapi_rep_id IS NOT NULL OR v_pago.uuid_rep IS NOT NULL))
    OR COALESCE(v_pago.facturapi_rep_id LIKE 'PENDING:%',false) THEN
    RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_factura FROM public.facturas
  WHERE id=v_pago.factura_id AND organization_id=p_organization_id AND deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND OR v_factura.evaluacion_fiscal IS NULL OR v_factura.uuid_fiscal IS NULL OR v_factura.ambiente IS NULL
    OR v_factura.metodo_pago IS DISTINCT FROM 'PPD' OR v_factura.snapshot_emision->'evaluacion_fiscal' IS NULL
    OR v_factura.estado='Cancelada' OR COALESCE(v_factura.facturapi_id,'') !~ '^[A-Za-z0-9_-]{1,150}$' THEN
    RAISE EXCEPTION 'LC_ISR_REP_CONTEXTO' USING ERRCODE = '23514';
  END IF;
  v_org := v_factura.snapshot_emision->'organizacion_snapshot';
  v_cliente := v_factura.snapshot_emision->'cliente_snapshot';
  IF NULLIF(v_org->>'facturapi_org_id','') IS NULL OR v_org->>'id' IS DISTINCT FROM p_organization_id::text
    OR v_cliente->>'id' IS DISTINCT FROM v_factura.cliente_id::text
    OR p_esperado->'perfil' IS DISTINCT FROM jsonb_build_object('ambiente',v_factura.ambiente,
      'emisor',jsonb_build_object('facturapiOrgId',btrim(v_org->>'facturapi_org_id'),'rfc',btrim(v_org->>'rfc'),
        'regimen',btrim(v_org->>'regimen_fiscal'),'cp',btrim(v_org->>'codigo_postal')),
      'receptor',jsonb_build_object('id',v_cliente->>'id','nombre',btrim(v_cliente->>'nombre'),'rfc',btrim(v_cliente->>'rfc'),
        'regimen_fiscal',btrim(v_cliente->>'regimen_fiscal'),'codigo_postal',btrim(v_cliente->>'codigo_postal'))) THEN
    RAISE EXCEPTION 'LC_ISR_REP_CONTEXTO' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_notas FROM public._isr_notas_credito_vigentes(v_factura,NULL);
  SELECT count(*),COALESCE(sum(p.monto_aplicado_factura),0),COALESCE(bool_or(p.estado_rep <> 'Timbrado' OR p.uuid_rep IS NULL),false)
    INTO v_previos,v_anteriores,v_rompe_secuencia
    FROM public.pagos_factura p WHERE p.factura_id=v_factura.id AND p.organization_id=p_organization_id
    AND p.deleted_at IS NULL AND NOT public.pago_rep_anulado(p.estado_rep)
    AND (p.fecha_pago,p.created_at,p.id)<(v_pago.fecha_pago,v_pago.created_at,v_pago.id);
  v_saldo := round(v_factura.total-v_notas.neto_aplicado-v_anteriores,2);
  v_equivalencia := CASE WHEN v_pago.moneda=v_factura.moneda THEN 1
    ELSE round(v_pago.monto_aplicado_factura / NULLIF(v_pago.monto,0),10) END;

  IF v_rompe_secuencia OR v_notas.neto_reservado > 0 OR v_saldo < v_pago.monto_aplicado_factura
    OR v_pago.monto <= 0 OR v_pago.monto_aplicado_factura <= 0 OR NOT (v_equivalencia > 0)
    OR round(v_pago.monto_aplicado_factura / NULLIF(v_equivalencia,0),2) <> v_pago.monto
    OR v_cobro->'fecha' IS DISTINCT FROM to_jsonb(v_pago.fecha_pago) OR v_cobro->'moneda' IS DISTINCT FROM to_jsonb(v_pago.moneda)
    OR v_cobro->'monto' IS DISTINCT FROM to_jsonb(v_pago.monto)
    OR v_cobro->'tipo_cambio' IS DISTINCT FROM to_jsonb(CASE WHEN v_pago.moneda='MXN' THEN 1::numeric ELSE v_pago.tipo_cambio END)
    OR NULLIF(v_cobro->>'referencia','') IS DISTINCT FROM NULLIF(v_pago.referencia,'')
    OR COALESCE(v_cobro->>'forma','') !~ '^[0-9]{2}$' OR v_cobro->>'forma'='99'
    OR upper(v_documento->>'uuid') IS DISTINCT FROM upper(v_factura.uuid_fiscal)
    OR v_documento->'moneda' IS DISTINCT FROM to_jsonb(v_factura.moneda)
    OR v_documento->'equivalencia' IS DISTINCT FROM to_jsonb(v_equivalencia)
    OR v_documento->'parcialidad' IS DISTINCT FROM to_jsonb(v_previos+1)
    OR v_documento->'saldo_anterior' IS DISTINCT FROM to_jsonb(v_saldo)
    OR v_documento->'importe_pagado' IS DISTINCT FROM to_jsonb(v_pago.monto_aplicado_factura)
    OR v_documento->'saldo_insoluto' IS DISTINCT FROM to_jsonb(v_saldo-v_pago.monto_aplicado_factura)
    OR COALESCE(v_documento->>'objeto_impuesto','') NOT IN ('01','02')
    OR jsonb_typeof(v_documento->'impuestos') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'LC_ISR_REP_CONTEXTO' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.intentos_rep_isr(pago_id,factura_id,organization_id,actor_id,ambiente,esperado,id_anterior)
    VALUES (p_pago_id,v_factura.id,p_organization_id,p_actor,v_factura.ambiente,p_esperado,v_pago.facturapi_rep_id)
  RETURNING * INTO v_intento;
  v_claim := 'PENDING:'||v_intento.id::text;
  UPDATE public.pagos_factura SET facturapi_rep_id=v_claim,facturapi_rep_claim_at=v_intento.creado_at,rep_error=NULL,
    rep_cancelado_facturapi_id=CASE WHEN v_pago.estado_rep='Cancelado' THEN v_pago.facturapi_rep_id ELSE rep_cancelado_facturapi_id END,
    rep_cancelado_uuid=CASE WHEN v_pago.estado_rep='Cancelado' THEN v_pago.uuid_rep ELSE rep_cancelado_uuid END
  WHERE id=p_pago_id;
  RETURN jsonb_build_object('claim',v_claim,'esperado',v_intento.esperado);
END;
$fn$;
REVOKE ALL ON FUNCTION public.reservar_rep_isr(uuid,uuid,uuid,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_rep_isr(uuid,uuid,uuid,timestamptz,jsonb) TO service_role;
