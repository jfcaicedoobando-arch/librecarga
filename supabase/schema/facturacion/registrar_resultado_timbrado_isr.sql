CREATE OR REPLACE FUNCTION public.registrar_resultado_timbrado_isr(
  p_factura_id uuid, p_claim text, p_estado text, p_resultado jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_factura public.facturas;
  v_intento public.intentos_timbrado_isr;
  v_estado text := p_estado;
  v_datos jsonb;
  v_id text := NULLIF(p_resultado->>'facturapi_id', '');
  v_uuid text := upper(NULLIF(p_resultado->>'uuid', ''));
  v_xml jsonb := p_resultado->'xml';
  v_ruta text;
  v_base_url text;
  v_folio bigint;
  v_serie text;
  v_uso text;
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

  SELECT * INTO STRICT v_factura FROM public.facturas WHERE id = p_factura_id AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO v_intento FROM public.intentos_timbrado_isr i WHERE i.factura_id = p_factura_id
    AND i.organization_id = v_factura.organization_id AND 'PENDING:' || i.id::text = p_claim FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514'; END IF;
  IF v_intento.estado = 'confirmado' AND v_id = v_intento.facturapi_id AND v_uuid = v_intento.uuid_fiscal THEN
    RETURN jsonb_build_object('estado', v_intento.estado, 'facturapi_id', v_intento.facturapi_id, 'uuid', v_intento.uuid_fiscal);
  END IF;
  IF v_factura.facturapi_id IS DISTINCT FROM p_claim OR v_intento.estado IN ('rechazado','confirmado')
    OR (v_intento.facturapi_id IS NOT NULL AND v_id IS NOT NULL AND v_intento.facturapi_id <> v_id)
    OR (v_intento.uuid_fiscal IS NOT NULL AND v_uuid IS NOT NULL AND v_intento.uuid_fiscal <> v_uuid) THEN
    RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514';
  END IF;

  IF p_estado = 'rechazado' AND (
    v_intento.estado <> 'reservado' OR v_id IS NOT NULL OR v_intento.facturapi_id IS NOT NULL
    OR COALESCE(p_resultado->>'http_status','') NOT IN ('400','401','403','422','429')
  ) THEN
    RAISE EXCEPTION 'LC_ISR_RECHAZO_INCIERTO' USING ERRCODE = '23514';
  END IF;

  IF p_estado = 'confirmado' THEN
    v_ruta := v_factura.organization_id::text || '/emitidas/' || v_uuid || '.xml';
    IF v_id IS NULL OR COALESCE(v_uuid,'') !~ '^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$'
      OR p_resultado->>'external_id' IS DISTINCT FROM p_claim
      OR p_resultado->>'ambiente' IS DISTINCT FROM v_intento.ambiente
      OR p_resultado->>'facturapi_org_id' IS DISTINCT FROM v_intento.prevalidacion#>>'{emisor,facturapi_org_id}'
      OR p_resultado->>'moneda' IS DISTINCT FROM v_intento.prevalidacion#>>'{totales,moneda}'
      OR p_resultado->'total' IS DISTINCT FROM v_intento.prevalidacion#>'{totales,total}'
      OR v_xml->>'uuid' IS DISTINCT FROM v_uuid
      OR v_xml->>'emisor_rfc' IS DISTINCT FROM v_intento.prevalidacion#>>'{emisor,rfc}'
      OR v_xml->>'emisor_regimen' IS DISTINCT FROM v_intento.prevalidacion#>>'{emisor,regimen_fiscal}'
      OR v_xml->>'receptor_rfc' IS DISTINCT FROM v_intento.prevalidacion#>>'{receptor,rfc}'
      OR v_xml->>'receptor_regimen' IS DISTINCT FROM v_intento.prevalidacion#>>'{receptor,regimen_fiscal}'
      OR v_xml->>'sustituye_uuid' IS DISTINCT FROM v_intento.prevalidacion->>'sustituye_uuid'
      OR v_xml->'totales' IS DISTINCT FROM v_intento.prevalidacion->'totales'
      OR v_xml->>'ruta' IS DISTINCT FROM v_ruta OR COALESCE(v_xml->>'sha256','') !~ '^[a-f0-9]{64}$'
      OR COALESCE(p_resultado->>'folio','') !~ '^[1-9][0-9]{0,14}$'
      OR v_xml->>'uso_cfdi' IS NULL OR v_xml->>'uso_cfdi' !~ '^[A-Z]{1,2}[0-9]{2}$'
      OR length(COALESCE(p_resultado->>'serie','')) > 25 THEN
      v_estado := 'conciliacion';
    END IF;
  END IF;
  IF v_intento.estado = 'conciliacion' AND v_estado = 'pendiente' THEN v_estado := 'conciliacion'; END IF;

  v_datos := jsonb_strip_nulls(jsonb_build_object(
    'http_status', left(p_resultado->>'http_status', 3),
    'motivo', left(p_resultado->>'motivo', 90),
    'total_respuesta', left(p_resultado->>'total', 40),
    'sha256_xml', left(v_xml->>'sha256', 64)));
  UPDATE public.intentos_timbrado_isr
  SET estado = v_estado, facturapi_id = COALESCE(v_id, facturapi_id),
      uuid_fiscal = CASE WHEN COALESCE(v_uuid,'') ~ '^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$' THEN v_uuid ELSE uuid_fiscal END,
      resultado = v_datos, actualizado_at = v_hora
  WHERE id = v_intento.id RETURNING * INTO v_intento;

  IF v_estado = 'confirmado' THEN
    v_folio := (p_resultado->>'folio')::bigint;
    v_serie := COALESCE(p_resultado->>'serie', '');
    v_uso := v_xml->>'uso_cfdi';
    v_base_url := 'https://www.facturapi.io/v2/invoices/' || v_id;
    UPDATE public.facturas SET estado = 'Emitida', numero = v_serie || v_folio::text, folio_fiscal = v_folio,
      serie = v_serie, uso_cfdi = v_uso, uuid_fiscal = v_uuid, facturapi_id = v_id, facturapi_claim_at = NULL,
      facturapi_pendiente_id = NULL, facturapi_pendiente_at = NULL, ambiente = v_intento.ambiente::public.ambiente_facturapi,
      factura_pdf_url = v_base_url || '/pdf', factura_xml_url = v_base_url || '/xml', factura_xml_backup_path = v_ruta,
      timbrado_en = v_hora, timbrado_por = v_intento.actor_id
    WHERE id = p_factura_id;
    IF v_factura.sustituye_a IS NOT NULL THEN
      UPDATE public.facturas SET sustituida_por = p_factura_id
      WHERE id = v_factura.sustituye_a AND organization_id = v_factura.organization_id
        AND deleted_at IS NULL AND sustituida_por IS NULL;
    END IF;
    INSERT INTO public.bitacora_actividad (organization_id, usuario_id, usuario_email, modulo, accion, entidad_id, entidad_nombre, detalles)
    VALUES (v_factura.organization_id, v_intento.actor_id,
      COALESCE((SELECT email FROM auth.users WHERE id = v_intento.actor_id), ''), 'facturacion',
      'facturapi_emitida', p_factura_id, v_serie || v_folio::text, jsonb_build_object(
        'uuid', v_uuid, 'folio', v_folio, 'serie', v_serie, 'facturapi_id', v_id,
        'uso_cfdi_solicitado', v_intento.prevalidacion#>>'{datos_factura,uso_cfdi}', 'uso_cfdi_efectivo', v_uso,
        'fuente_uso_cfdi', 'xml', 'intento', p_claim,
        'xml_backup', jsonb_build_object('status', 'guardado', 'path', v_ruta)));
  ELSIF v_estado = 'rechazado' THEN
    UPDATE public.facturas SET facturapi_id = NULL, facturapi_claim_at = NULL,
      facturapi_pendiente_id = NULL, facturapi_pendiente_at = NULL WHERE id = p_factura_id;
  ELSE
    UPDATE public.facturas SET facturapi_pendiente_id = v_intento.facturapi_id,
      facturapi_pendiente_at = v_hora WHERE id = p_factura_id;
  END IF;
  RETURN jsonb_build_object('estado', v_estado, 'facturapi_id', v_intento.facturapi_id, 'uuid', v_intento.uuid_fiscal);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_resultado_timbrado_isr(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_resultado_timbrado_isr(uuid,text,text,jsonb) TO service_role;
