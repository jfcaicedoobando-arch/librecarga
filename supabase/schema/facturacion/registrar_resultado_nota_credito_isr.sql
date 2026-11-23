CREATE OR REPLACE FUNCTION public.registrar_resultado_nota_credito_isr(
  p_nota_id uuid, p_organization_id uuid, p_claim text, p_estado text, p_resultado jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_nota public.factura_notas_credito;
  v_intento public.intentos_nota_credito_isr;
  v_id text := NULLIF(p_resultado->>'facturapi_id','');
  v_uuid text := upper(NULLIF(p_resultado->>'uuid',''));
  v_xml jsonb := p_resultado->'xml';
  v_estado text := p_estado;
  v_folio bigint;
  v_serie text;
  v_url text;
  v_ruta text;
  v_hora timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('pendiente','conciliacion','rechazado','confirmado')
    OR jsonb_typeof(p_resultado) IS DISTINCT FROM 'object'
    OR (v_id IS NOT NULL AND v_id !~ '^[A-Za-z0-9_-]{1,150}$') THEN
    RAISE EXCEPTION 'LC_ISR_RESULTADO_INVALIDO' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT v_nota FROM public.factura_notas_credito
  WHERE id = p_nota_id AND organization_id = p_organization_id AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO v_intento FROM public.intentos_nota_credito_isr i
  WHERE i.nota_id=p_nota_id AND i.organization_id=p_organization_id AND 'PENDING:' || i.id::text=p_claim FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514'; END IF;
  IF v_intento.estado = 'confirmado' AND p_estado = 'confirmado'
    AND v_intento.facturapi_id = v_id AND v_intento.uuid_fiscal = v_uuid THEN
    RETURN jsonb_build_object('estado','confirmado');
  END IF;
  IF v_nota.facturapi_id IS DISTINCT FROM p_claim OR v_intento.estado IN ('rechazado','confirmado')
    OR (v_id IS NOT NULL AND (v_intento.facturapi_id IS NOT NULL AND v_id <> v_intento.facturapi_id
      OR p_resultado->>'external_id' IS DISTINCT FROM p_claim
      OR p_resultado->>'ambiente' IS DISTINCT FROM v_intento.ambiente::text
      OR p_resultado->>'facturapi_org_id' IS DISTINCT FROM v_intento.esperado#>>'{emisor,facturapi_org_id}')) THEN
    RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514';
  END IF;
  IF p_estado = 'rechazado' AND (v_intento.estado <> 'reservado' OR v_id IS NOT NULL OR v_intento.facturapi_id IS NOT NULL
    OR COALESCE(p_resultado->>'http_status','') NOT IN ('400','401','403','422','429')) THEN
    RAISE EXCEPTION 'LC_ISR_RECHAZO_INCIERTO' USING ERRCODE = '23514';
  END IF;

  IF p_estado = 'confirmado' THEN
    v_ruta := p_organization_id::text || '/notas-credito/' || v_uuid || '.xml';
    IF v_id IS NULL OR COALESCE(v_uuid,'') !~ '^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$'
      OR v_xml->>'uuid' IS DISTINCT FROM v_uuid OR v_xml->>'ruta' IS DISTINCT FROM v_ruta
      OR COALESCE(v_xml->>'sha256','') !~ '^[a-f0-9]{64}$'
      OR v_xml->>'factura_uuid' IS DISTINCT FROM v_intento.esperado->>'factura_uuid'
      OR v_xml->>'emisor_rfc' IS DISTINCT FROM v_intento.esperado#>>'{emisor,rfc}'
      OR v_xml->>'emisor_regimen' IS DISTINCT FROM v_intento.esperado#>>'{emisor,regimen_fiscal}'
      OR v_xml->>'receptor_rfc' IS DISTINCT FROM v_intento.esperado#>>'{receptor,rfc}'
      OR v_xml->>'receptor_regimen' IS DISTINCT FROM v_intento.esperado#>>'{receptor,regimen_fiscal}'
      OR v_xml->>'uso_cfdi' IS DISTINCT FROM 'G02' OR v_xml->'totales' IS DISTINCT FROM v_intento.esperado->'totales'
      OR p_resultado->>'moneda' IS DISTINCT FROM v_intento.esperado#>>'{totales,moneda}'
      OR p_resultado->'total' IS DISTINCT FROM v_intento.esperado#>'{totales,total}'
      OR COALESCE(p_resultado->>'folio','') !~ '^[1-9][0-9]{0,14}$'
      OR length(COALESCE(p_resultado->>'serie','')) > 25 THEN
      v_estado := 'conciliacion';
    END IF;
  END IF;
  IF v_intento.estado = 'conciliacion' AND v_estado = 'pendiente' THEN v_estado := 'conciliacion'; END IF;
  UPDATE public.intentos_nota_credito_isr SET estado=v_estado, facturapi_id=COALESCE(v_id,facturapi_id),
    uuid_fiscal=CASE WHEN v_estado='confirmado' THEN v_uuid ELSE NULL END, actualizado_at=v_hora,
    resultado=jsonb_strip_nulls(jsonb_build_object(
      'http_status',left(p_resultado->>'http_status',3),'motivo',left(p_resultado->>'motivo',90),
      'sha256_xml',CASE WHEN v_estado='confirmado' THEN v_xml->>'sha256' END))
  WHERE id=v_intento.id RETURNING * INTO v_intento;

  IF v_estado = 'confirmado' THEN
    v_folio := (p_resultado->>'folio')::bigint;
    v_serie := COALESCE(p_resultado->>'serie','');
    v_url := 'https://www.facturapi.io/v2/invoices/' || v_id;
    UPDATE public.factura_notas_credito SET estado='Timbrada', folio=v_serie || v_folio::text, serie=v_serie,
      folio_fiscal=v_folio, uuid_fiscal=v_uuid, ambiente=v_intento.ambiente, facturapi_id=v_id, facturapi_claim_at=NULL,
      facturapi_pendiente_id = NULL, facturapi_pendiente_at = NULL, timbrado_en=v_hora, timbrado_por=v_intento.actor_id,
      pdf_url=v_url || '/pdf', xml_url=v_url || '/xml', xml_backup_path=v_ruta
    WHERE id=p_nota_id;
    INSERT INTO public.bitacora_actividad(organization_id,usuario_id,usuario_email,modulo,accion,entidad_id,entidad_nombre,detalles)
    VALUES(p_organization_id,v_intento.actor_id,COALESCE((SELECT email FROM auth.users WHERE id=v_intento.actor_id),''),
      'facturacion','facturapi_nc_emitida',p_nota_id,v_serie || v_folio::text,
      jsonb_build_object('uuid',v_uuid,'facturapi_id',v_id,'factura_id',v_nota.factura_id,'intento',p_claim,'xml',v_ruta));
  ELSIF v_estado = 'rechazado' THEN
    UPDATE public.factura_notas_credito SET facturapi_id=NULL, facturapi_claim_at=NULL,
      facturapi_pendiente_id = NULL, facturapi_pendiente_at = NULL WHERE id=p_nota_id;
  ELSE
    UPDATE public.factura_notas_credito SET facturapi_pendiente_id=v_intento.facturapi_id,
      facturapi_pendiente_at=v_hora WHERE id=p_nota_id;
  END IF;
  RETURN jsonb_build_object('estado',v_estado);
END;
$fn$;
REVOKE ALL ON FUNCTION public.registrar_resultado_nota_credito_isr(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_resultado_nota_credito_isr(uuid,uuid,text,text,jsonb) TO service_role;
