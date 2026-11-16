CREATE OR REPLACE FUNCTION public.registrar_resultado_rep_isr(
  p_pago_id uuid,p_organization_id uuid,p_claim text,p_estado text,p_resultado jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_pago public.pagos_factura;
  v_factura public.facturas;
  v_intento public.intentos_rep_isr;
  v_estado text := p_estado;
  v_id text := NULLIF(p_resultado->>'facturapi_id','');
  v_uuid text := upper(NULLIF(p_resultado->>'uuid',''));
  v_xml jsonb := p_resultado->'xml';
  v_dr jsonb;
  v_hora timestamptz := clock_timestamp();
  v_ruta text;
  v_url text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('pendiente','conciliacion','rechazado','confirmado')
    OR jsonb_typeof(p_resultado) IS DISTINCT FROM 'object' OR (v_id IS NOT NULL AND v_id !~ '^[A-Za-z0-9_-]{1,150}$') THEN
    RAISE EXCEPTION 'LC_ISR_RESULTADO_INVALIDO' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO STRICT v_pago FROM public.pagos_factura WHERE id=p_pago_id AND organization_id=p_organization_id
    AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO v_intento FROM public.intentos_rep_isr i WHERE i.pago_id=p_pago_id AND i.factura_id=v_pago.factura_id
    AND i.organization_id=p_organization_id AND 'PENDING:'||i.id::text=p_claim FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514'; END IF;
  IF v_intento.estado='confirmado' AND p_estado='confirmado' AND v_intento.facturapi_id=v_id AND v_intento.uuid_fiscal=v_uuid
    AND v_intento.resultado->>'sha256' IS NOT DISTINCT FROM v_xml->>'sha256' THEN RETURN jsonb_build_object('estado','confirmado'); END IF;
  IF v_pago.facturapi_rep_id IS DISTINCT FROM p_claim OR v_intento.estado IN ('rechazado','confirmado')
    OR (v_id IS NOT NULL AND (v_intento.facturapi_id IS NOT NULL AND v_id<>v_intento.facturapi_id
      OR p_resultado->>'external_id' IS DISTINCT FROM p_claim OR p_resultado->>'ambiente' IS DISTINCT FROM v_intento.ambiente::text
      OR p_resultado->>'facturapi_org_id' IS DISTINCT FROM v_intento.esperado#>>'{perfil,emisor,facturapiOrgId}')) THEN
    RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514';
  END IF;
  IF p_estado='rechazado' AND (v_intento.estado<>'reservado' OR v_id IS NOT NULL OR v_intento.facturapi_id IS NOT NULL
    OR COALESCE(p_resultado->>'http_status','') NOT IN ('400','401','403','422','429')) THEN
    RAISE EXCEPTION 'LC_ISR_RECHAZO_INCIERTO' USING ERRCODE = '23514';
  END IF;

  IF p_estado='confirmado' THEN
    v_dr := v_intento.esperado->'documento';
    v_ruta := p_organization_id::text || '/rep/' || v_uuid || '.xml';
    IF v_id IS NULL OR COALESCE(v_uuid,'') !~ '^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$'
      OR v_xml->>'uuid' IS DISTINCT FROM v_uuid OR v_xml->>'ruta' IS DISTINCT FROM v_ruta
      OR COALESCE(v_xml->>'sha256','') !~ '^[a-f0-9]{64}$' OR p_resultado->'total' IS DISTINCT FROM '0'::jsonb
      OR v_xml->>'factura_uuid' IS DISTINCT FROM upper(v_dr->>'uuid') OR v_xml->'moneda_factura' IS DISTINCT FROM v_dr->'moneda'
      OR v_xml->'parcialidad' IS DISTINCT FROM v_dr->'parcialidad' OR v_xml->'saldo_anterior' IS DISTINCT FROM v_dr->'saldo_anterior'
      OR v_xml->'importe_pagado' IS DISTINCT FROM v_dr->'importe_pagado' OR v_xml->'saldo_insoluto' IS DISTINCT FROM v_dr->'saldo_insoluto'
      OR v_xml->'moneda_pago' IS DISTINCT FROM v_intento.esperado#>'{pago,moneda}'
      OR v_xml->'monto_recibido' IS DISTINCT FROM v_intento.esperado#>'{pago,monto}'
      OR v_xml->>'emisor_rfc' IS DISTINCT FROM v_intento.esperado#>>'{perfil,emisor,rfc}'
      OR v_xml->>'receptor_rfc' IS DISTINCT FROM v_intento.esperado#>>'{perfil,receptor,rfc}'
      OR jsonb_typeof(v_xml->'ret_isr') IS DISTINCT FROM 'number' OR jsonb_typeof(v_xml->'ret_iva') IS DISTINCT FROM 'number'
      OR COALESCE(v_xml->>'ret_isr','') !~ '^[0-9]{1,14}(\.[0-9]{1,2})?$' OR COALESCE(v_xml->>'ret_iva','') !~ '^[0-9]{1,14}(\.[0-9]{1,2})?$'
      OR COALESCE(p_resultado->>'folio','0') !~ '^[0-9]{1,9}$' OR length(COALESCE(p_resultado->>'serie',''))>25 THEN
      v_estado := 'conciliacion';
    END IF;
    IF v_estado='confirmado' AND EXISTS (
      SELECT 1 FROM (VALUES ('ISR','ret_isr'),('IVA','ret_iva')) AS impuesto(tipo,campo)
      CROSS JOIN LATERAL (
        SELECT COALESCE(sum((j->>'base')::numeric*(j->>'rate')::numeric),0) AS monto,count(*) AS grupos
        FROM jsonb_array_elements(v_dr->'impuestos') j WHERE j->>'type'=impuesto.tipo AND j->'withholding'='true'::jsonb
      ) t WHERE abs(round(t.monto,2)-(v_xml->>impuesto.campo)::numeric)>0.01*t.grupos
    ) THEN v_estado := 'conciliacion'; END IF;
  END IF;

  IF v_intento.estado='conciliacion' AND v_estado='pendiente' THEN v_estado := 'conciliacion'; END IF;
  UPDATE public.intentos_rep_isr SET estado=v_estado,facturapi_id=COALESCE(v_id,facturapi_id),
    uuid_fiscal=CASE WHEN v_estado='confirmado' THEN v_uuid END, actualizado_at=v_hora,
    resultado=CASE WHEN v_estado='confirmado' THEN v_xml ELSE jsonb_strip_nulls(jsonb_build_object(
      'http_status',left(p_resultado->>'http_status',3),'motivo',left(p_resultado->>'motivo',90))) END
  WHERE id=v_intento.id RETURNING * INTO v_intento;

  IF v_estado='confirmado' THEN
    SELECT * INTO STRICT v_factura FROM public.facturas WHERE id=v_pago.factura_id AND organization_id=p_organization_id FOR NO KEY UPDATE;
    -- A concurrent edit on another payment can be retried by recovery of the same attempt.
    PERFORM 1 FROM public.pagos_factura p WHERE p.factura_id=v_factura.id AND p.organization_id=p_organization_id
      AND p.deleted_at IS NULL AND p.uuid_rep IS NULL AND p.facturapi_rep_id IS NULL
      AND p.estado_rep IN ('Pendiente','Error') ORDER BY p.id FOR UPDATE NOWAIT;
    v_url := 'https://www.facturapi.io/v2/invoices/' || v_id;
    UPDATE public.pagos_factura SET estado_rep='Timbrado',facturapi_rep_id=v_id,uuid_rep=v_uuid,
      folio_rep=COALESCE(p_resultado->>'folio','0')::integer,serie_rep=COALESCE(p_resultado->>'serie',''),
      ambiente=v_intento.ambiente,timbrado_rep_en=v_hora,timbrado_rep_por=v_intento.actor_id,
      rep_pdf_url=v_url||'/pdf',rep_xml_url=v_url||'/xml',rep_xml_backup_path=v_ruta,rep_error=NULL,
      facturapi_rep_claim_at=NULL,facturapi_rep_pendiente_id=NULL,facturapi_rep_pendiente_at=NULL,
      rep_cancelado_en=NULL,rep_motivo_cancel=NULL,rep_cancellation_status='none'
    WHERE id=p_pago_id;
    UPDATE public.pagos_factura p SET ret_isr=proy.ret_isr,ret_iva=proy.ret_iva
      FROM public._isr_proyectar_retenciones_rep(v_factura) proy WHERE p.id=proy.pago_id
      AND (p.ret_isr,p.ret_iva) IS DISTINCT FROM (proy.ret_isr,proy.ret_iva);
    INSERT INTO public.bitacora_actividad(organization_id,usuario_id,usuario_email,modulo,accion,entidad_id,detalles)
    VALUES(p_organization_id,v_intento.actor_id,COALESCE((SELECT email FROM auth.users WHERE id=v_intento.actor_id),''),
      'facturacion','facturapi_rep_emitido',p_pago_id,jsonb_build_object('uuid',v_uuid,'facturapi_id',v_id,
        'factura_id',v_pago.factura_id,'intento',p_claim,'ret_isr',v_xml->'ret_isr','ret_iva',v_xml->'ret_iva'));
  ELSIF v_estado='rechazado' THEN
    UPDATE public.pagos_factura SET facturapi_rep_id=v_intento.id_anterior,facturapi_rep_claim_at=NULL,
      facturapi_rep_pendiente_id=NULL,facturapi_rep_pendiente_at=NULL,rep_error=left(p_resultado->>'motivo',90) WHERE id=p_pago_id;
  ELSE
    UPDATE public.pagos_factura SET facturapi_rep_pendiente_id=v_intento.facturapi_id,facturapi_rep_pendiente_at=v_hora WHERE id=p_pago_id;
  END IF;
  RETURN jsonb_build_object('estado',v_estado);
END;
$fn$;
REVOKE ALL ON FUNCTION public.registrar_resultado_rep_isr(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_resultado_rep_isr(uuid,uuid,text,text,jsonb) TO service_role;
