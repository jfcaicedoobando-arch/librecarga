-- Recovery and provider notifications for the organization-bound ISR issuance attempts.

CREATE OR REPLACE FUNCTION public.obtener_intento_timbrado_isr(p_factura_id uuid, p_organization_id uuid, p_claim text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_intento public.intentos_timbrado_isr;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  SELECT i.* INTO v_intento FROM public.intentos_timbrado_isr i
  JOIN public.facturas f ON f.id = i.factura_id AND f.organization_id = i.organization_id
  WHERE i.factura_id = p_factura_id AND i.organization_id = p_organization_id
    AND f.deleted_at IS NULL AND f.facturapi_id = p_claim AND 'PENDING:' || i.id::text = p_claim
    AND i.estado IN ('reservado','pendiente','conciliacion');
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('prevalidacion', v_intento.prevalidacion, 'facturapi_id', v_intento.facturapi_id);
END;
$$;
REVOKE ALL ON FUNCTION public.obtener_intento_timbrado_isr(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_intento_timbrado_isr(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.congelar_factura_al_emitir() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_conceptos jsonb;
  v_cliente jsonb;
  v_org jsonb;
  v_tasa_iva numeric;
  v_prevalidacion jsonb;
BEGIN
  -- Sólo congelar al transicionar a Emitida/Pagada y si aún no hay snapshot
  IF NEW.estado NOT IN ('Emitida', 'Pagada') THEN
    RETURN NEW;
  END IF;
  -- QA-R2 D-05: no emitir una factura sin conceptos vivos. Sólo aplica en la
  -- transición normal de captura (Borrador/Por timbrar -> Emitida); en INSERT
  -- los conceptos aún no pueden existir por la FK y otras transiciones
  -- (reapertura de canceladas) tienen su propio candado.
  IF TG_OP = 'UPDATE'
     AND NEW.estado = 'Emitida'
     AND OLD.estado IN ('Borrador', 'Por timbrar')
     AND NOT EXISTS (
       SELECT 1 FROM public.conceptos_factura cf
       WHERE cf.factura_id = NEW.id AND cf.deleted_at IS NULL
     ) THEN
    RAISE EXCEPTION 'LC_FACTURA_SIN_CONCEPTOS: no se puede emitir una factura sin conceptos'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.snapshot_emision IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(cf)), '[]'::jsonb)
    INTO v_conceptos
    FROM public.conceptos_factura cf
   WHERE cf.factura_id = NEW.id
     AND cf.deleted_at IS NULL;
  SELECT jsonb_build_object(
           'id', c.id,
           'nombre', c.nombre,
           'rfc', c.rfc,
           'direccion', c.direccion,
           'ciudad', c.ciudad,
           'estado', c.estado,
           'cp', c.cp
         )
    INTO v_cliente
    FROM public.clientes c
   WHERE c.id = NEW.cliente_id;
  SELECT jsonb_build_object(
           'id', o.id,
           'nombre', o.nombre,
           'rfc', o.rfc
         )
    INTO v_org
    FROM public.organizations o
   WHERE o.id = NEW.organization_id;
  IF NEW.evaluacion_fiscal IS NOT NULL AND TG_OP = 'UPDATE' THEN
    SELECT i.prevalidacion INTO v_prevalidacion FROM public.intentos_timbrado_isr i
    WHERE i.factura_id = NEW.id AND i.organization_id = NEW.organization_id
      AND i.estado = 'confirmado' AND 'PENDING:' || i.id::text = OLD.facturapi_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'LC_ISR_TIMBRADO_PENDIENTE' USING ERRCODE = '23514'; END IF;
    v_cliente := (v_prevalidacion->'receptor') || jsonb_build_object(
      'id', NEW.cliente_id, 'cp', v_prevalidacion#>'{receptor,codigo_postal}');
    v_org := (v_prevalidacion->'emisor') || jsonb_build_object(
      'id', NEW.organization_id, 'nombre', v_prevalidacion#>'{emisor,razon_social}');
  END IF;
  v_tasa_iva := CASE
    WHEN COALESCE(NEW.subtotal, 0) = 0 THEN 0
    ELSE round((NEW.iva / NEW.subtotal)::numeric, 4)
  END;
  NEW.snapshot_emision := jsonb_build_object(
    'version', 1,
    'congelado_at', now(),
    'estado_al_congelar', NEW.estado,
    'numero', NEW.numero,
    'moneda', NEW.moneda,
    'subtotal', NEW.subtotal,
    'iva', NEW.iva,
    'total', NEW.total,
    'tasa_iva', v_tasa_iva,
    'tipo_cambio', NEW.tipo_cambio,
    'fecha_emision', NEW.fecha_emision,
    'fecha_vencimiento', NEW.fecha_vencimiento,
    'expediente', NEW.expediente,
    'referencia_bl', NEW.referencia_bl,
    'cliente_snapshot', v_cliente,
    'organizacion_snapshot', v_org,
    'conceptos', v_conceptos
  );
  IF v_prevalidacion IS NOT NULL THEN
    NEW.snapshot_emision := NEW.snapshot_emision || jsonb_build_object(
      'ret_isr', NEW.ret_isr, 'ret_iva', NEW.ret_iva, 'evaluacion_fiscal', NEW.evaluacion_fiscal,
      'intento_timbrado_isr', OLD.facturapi_id);
  END IF;
  RETURN NEW;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.finalizar_evento_facturapi_webhook(
  p_evento_id uuid, p_token uuid, p_resultado text, p_motivo text DEFAULT NULL,
  p_tabla text DEFAULT NULL, p_documento_id uuid DEFAULT NULL, p_version timestamptz DEFAULT NULL,
  p_claim text DEFAULT NULL, p_patch jsonb DEFAULT NULL, p_accion text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_evento public.facturapi_webhook_eventos%ROWTYPE;
  v_momento timestamptz;
  v_estado text := p_resultado;
  v_motivo text := p_motivo;
  v_claim_actual text;
  v_version_actual timestamptz;
  v_patch jsonb := p_patch;
  v_permitidos text[];
  v_set text;
BEGIN
  SELECT * INTO v_evento FROM public.facturapi_webhook_eventos
   WHERE id = p_evento_id FOR UPDATE;
  v_momento := clock_timestamp();
  IF NOT FOUND OR v_evento.procesamiento_estado <> 'procesando'
    OR v_evento.procesamiento_token IS DISTINCT FROM p_token
    OR v_evento.procesamiento_disponible_en <= v_momento THEN
    RETURN jsonb_build_object('estado', 'reserva_perdida');
  END IF;

  IF p_resultado = 'aplicar' THEN
    IF p_tabla = 'facturas' THEN
      SELECT facturapi_id, updated_at INTO v_claim_actual, v_version_actual FROM public.facturas
       WHERE id = p_documento_id AND organization_id = v_evento.organization_id AND deleted_at IS NULL FOR UPDATE;
      v_permitidos := ARRAY['estado', 'cancellation_status', 'cancelado_en', 'cancelacion_solicitada_en',
        'cancelacion_vence_en', 'uuid_fiscal', 'uso_cfdi', 'enviada_cliente_at', 'facturapi_id',
        'facturapi_claim_at', 'facturapi_pendiente_id', 'facturapi_pendiente_at'];
    ELSIF p_tabla = 'pagos_factura' THEN
      SELECT facturapi_rep_id, updated_at INTO v_claim_actual, v_version_actual FROM public.pagos_factura
       WHERE id = p_documento_id AND organization_id = v_evento.organization_id AND deleted_at IS NULL FOR UPDATE;
      v_permitidos := ARRAY['uuid_rep', 'estado_rep', 'rep_cancelado_en', 'rep_cancellation_status',
        'timbrado_rep_en', 'facturapi_rep_id', 'facturapi_rep_claim_at', 'facturapi_rep_pendiente_id', 'facturapi_rep_pendiente_at'];
    ELSE
      RAISE EXCEPTION 'Destino de webhook inválido' USING ERRCODE = '22023';
    END IF;

    IF v_version_actual IS NULL OR v_claim_actual IS DISTINCT FROM p_claim THEN
      v_estado := 'ignorado';
      v_motivo := 'claim_cambiado';
    ELSIF v_version_actual IS DISTINCT FROM p_version THEN
      v_estado := 'reintentable';
      v_motivo := 'destino_actualizado';
    ELSE
      IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' OR p_accion IS NULL OR EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_patch) AS campo WHERE campo <> ALL (v_permitidos)
      ) THEN
        RAISE EXCEPTION 'Patch de webhook inválido' USING ERRCODE = '22023';
      END IF;

      IF p_tabla = 'facturas' AND v_patch->>'cancellation_status' = 'accepted' THEN
        PERFORM public.cerrar_cancelacion_factura_facturapi(p_documento_id);
        v_patch := v_patch - ARRAY['estado', 'cancellation_status', 'cancelado_en', 'cancelacion_solicitada_en', 'cancelacion_vence_en'];
      END IF;
      -- Actualiza únicamente las columnas presentes en el patch validado.
      SELECT string_agg(format('%1$I = (jsonb_populate_record(NULL::public.%2$I, $1)).%1$I', campo, p_tabla), ', ')
        INTO v_set FROM jsonb_object_keys(v_patch) AS campo;
      IF v_set IS NOT NULL THEN
        EXECUTE format('UPDATE public.%I SET %s WHERE id = $2', p_tabla, v_set) USING v_patch, p_documento_id;
      END IF;

      INSERT INTO public.bitacora_actividad (organization_id, usuario_id, usuario_email, modulo, accion, entidad_id, entidad_nombre, detalles)
      VALUES (v_evento.organization_id, '00000000-0000-0000-0000-000000000000', 'system@edge', 'facturacion',
        p_accion, p_documento_id, '', jsonb_build_object('event_type', v_evento.event_type, 'event_id', v_evento.event_id, 'patch', p_patch));
      v_estado := 'procesado';
    END IF;
  ELSIF p_resultado = 'conciliado_isr' THEN
    IF p_tabla IS DISTINCT FROM 'facturas' OR v_evento.event_type <> 'invoice.status_updated'
       OR NOT EXISTS (
         SELECT 1 FROM public.facturas f
         WHERE f.id = p_documento_id AND f.organization_id = v_evento.organization_id
           AND f.deleted_at IS NULL AND f.uuid_fiscal IS NOT NULL
           AND f.facturapi_id = v_evento.payload#>>'{data,object,id}'
           AND f.snapshot_emision->>'intento_timbrado_isr' = p_claim
       ) THEN
      v_estado := 'reintentable';
      v_motivo := 'timbrado_isr_pendiente';
    ELSE
      v_estado := 'procesado';
      v_motivo := 'timbrado_isr_conciliado';
      INSERT INTO public.bitacora_actividad (organization_id, usuario_id, usuario_email, modulo, accion, entidad_id, entidad_nombre, detalles)
      VALUES (v_evento.organization_id, '00000000-0000-0000-0000-000000000000', 'system@edge', 'facturacion',
        'facturapi_webhook_isr_conciliado', p_documento_id, '',
        jsonb_build_object('event_type', v_evento.event_type, 'event_id', v_evento.event_id));
    END IF;
  ELSIF p_resultado IS NULL OR p_resultado NOT IN ('ignorado', 'reintentable') THEN
    RAISE EXCEPTION 'Resultado de webhook inválido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.facturapi_webhook_eventos SET procesamiento_estado = v_estado, procesamiento_token = NULL,
    procesamiento_motivo = v_motivo,
    procesamiento_disponible_en = CASE WHEN v_estado = 'reintentable'
      THEN v_momento + make_interval(secs => 5 * (1 << least(v_evento.procesamiento_intentos, 8))) END,
    procesamiento_finalizado_en = CASE WHEN v_estado <> 'reintentable' THEN v_momento END
   WHERE id = v_evento.id;
  RETURN jsonb_build_object('estado', v_estado, 'motivo', v_motivo, 'tabla', p_tabla);
END;
$fn$;

REVOKE ALL ON FUNCTION public.finalizar_evento_facturapi_webhook(uuid, uuid, text, text, text, uuid, timestamptz, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_evento_facturapi_webhook(uuid, uuid, text, text, text, uuid, timestamptz, text, jsonb, text) TO service_role;
