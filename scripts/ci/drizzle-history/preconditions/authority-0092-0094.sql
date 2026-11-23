-- Sólo bases efímeras. Restaura las preimágenes requeridas por Drizzle 0092–0094.
-- La reproducción histórica del squash omite la corrección de documentos entrantes
-- de CxP y líneas en blanco en las otras tres definiciones. Las huellas del catálogo
-- y de las fuentes inmutables se comprueban antes y después de esta restauración.
DO $preimage$
BEGIN
  IF md5(pg_get_functiondef('public._cxp_desvincular_por_rechazo(uuid,text)'::regprocedure)) IS DISTINCT FROM '4079125477098f4702f221ad07613d1c' THEN
    RAISE EXCEPTION 'Fixture de replay 0092–0094: definición inesperada de _cxp_desvincular_por_rechazo';
  END IF;
  IF md5(pg_get_functiondef('public.actividad_embarque(uuid)'::regprocedure)) IS DISTINCT FROM '22962703ddca13791a3095a920305de7' THEN
    RAISE EXCEPTION 'Fixture de replay 0092–0094: definición inesperada de actividad_embarque';
  END IF;
  IF md5(pg_get_functiondef('public.duplicar_embarque_completo(uuid,jsonb,uuid)'::regprocedure)) IS DISTINCT FROM 'daf8265d727b9ac6d1a613fbee3f5a2b' THEN
    RAISE EXCEPTION 'Fixture de replay 0092–0094: definición inesperada de duplicar_embarque_completo';
  END IF;
  IF md5(pg_get_functiondef('public.eliminar_pago_cliente(uuid,text)'::regprocedure)) IS DISTINCT FROM 'cb6079f7b00b0c563f6f1ee14a36b5c0' THEN
    RAISE EXCEPTION 'Fixture de replay 0092–0094: definición inesperada de eliminar_pago_cliente';
  END IF;
END;
$preimage$;

CREATE OR REPLACE FUNCTION public._cxp_desvincular_por_rechazo(p_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.proveedor_facturas;
  v_pagado numeric;
  v_vinculos int := 0;
  v_ajustes int := 0;
  v_entrantes int := 0;
  v_ids uuid[];
BEGIN
  SELECT * INTO v_row FROM public.proveedor_facturas WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(monto), 0) INTO v_pagado
  FROM public.pagos_proveedor
  WHERE proveedor_factura_id = p_id AND deleted_at IS NULL;

  IF v_pagado > 0 OR v_row.estado = 'Pagada'::public.estado_proveedor_factura THEN
    RAISE EXCEPTION 'LC_CXP_RECHAZO_CON_PAGOS: la factura tiene pagos aplicados; anúlalos antes de rechazarla.'
      USING ERRCODE = '22023';
  END IF;

  -- Guardamos los documentos del buzón ANTES de cancelar: el trigger
  -- trg_reabrir_entrantes_factura los devuelve a "por_capturar" y borra el
  -- vínculo, así que después ya no podríamos encontrarlos por factura.
  SELECT array_agg(id) INTO v_ids
  FROM public.embarque_facturas_entrantes
  WHERE proveedor_factura_id = p_id AND deleted_at IS NULL;

  IF v_row.estado <> 'Cancelada'::public.estado_proveedor_factura THEN
    PERFORM set_config('app.cancelando_cxp', '1', true);
    UPDATE public.proveedor_facturas
       SET estado = 'Cancelada'::public.estado_proveedor_factura,
           fecha_cancelacion = now(),
           motivo_cancelacion = COALESCE(NULLIF(btrim(p_motivo), ''), 'Factura rechazada'),
           cancelada_por = auth.uid(),
           updated_at = now()
     WHERE id = p_id;
    PERFORM set_config('app.cancelando_cxp', '0', true);
  END IF;

  SELECT count(*) INTO v_ajustes
  FROM public.conceptos_costo cc
  JOIN public.proveedor_facturas_conceptos pfc ON pfc.concepto_costo_id = cc.id
  WHERE pfc.proveedor_factura_id = p_id
    AND cc.origen = 'ajuste_factura_proveedor'
    AND cc.deleted_at IS NOT NULL;

  DELETE FROM public.proveedor_facturas_conceptos WHERE proveedor_factura_id = p_id;
  GET DIAGNOSTICS v_vinculos = ROW_COUNT;

  UPDATE public.proveedor_facturas SET embarque_id = NULL, updated_at = now() WHERE id = p_id;

  UPDATE public.embarque_facturas_entrantes
     SET estado = 'rechazada',
         rechazo_motivo = COALESCE(NULLIF(btrim(p_motivo), ''), 'Factura rechazada'),
         proveedor_factura_id = NULL,
         capturado_por = NULL,
         updated_at = now()
   WHERE deleted_at IS NULL
     AND (proveedor_factura_id = p_id
          OR (v_ids IS NOT NULL AND id = ANY(v_ids)));
  GET DIAGNOSTICS v_entrantes = ROW_COUNT;

  RETURN jsonb_build_object(
    'vinculos_eliminados', v_vinculos,
    'ajustes_revertidos', v_ajustes,
    'entrantes_rechazados', v_entrantes,
    'embarque_liberado', v_row.embarque_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.actividad_embarque(p_embarque_id uuid)
 RETURNS TABLE(id text, categoria text, tipo text, fecha timestamp with time zone, usuario text, accion text, titulo text, descripcion text, monto numeric, moneda text, ref_tipo text, ref_id uuid, dedupe_key text, detalles jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_exp text;
  v_cot uuid;
  v_fin boolean;
BEGIN
  SELECT e.organization_id, e.expediente, e.cotizacion_id
    INTO v_org, v_exp, v_cot
  FROM public.embarques e
  WHERE e.id = p_embarque_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'LC_NOT_FOUND: embarque inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_org_member(v_org)) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  v_fin := public.can_view_financials(auth.uid());

  RETURN QUERY
  WITH facturas_emb AS (
    SELECT f.*
    FROM public.facturas f
    JOIN public.factura_embarques fe ON fe.factura_id = f.id
    WHERE fe.embarque_id = p_embarque_id
      AND COALESCE(fe.activa, true)
      AND f.deleted_at IS NULL
  ),
  pf_emb AS (
    SELECT pf.* FROM public.proveedor_facturas pf
    WHERE pf.embarque_id = p_embarque_id AND pf.deleted_at IS NULL
  ),
  prof_emb AS (
    SELECT pr.* FROM public.proformas pr
    WHERE pr.embarque_id = p_embarque_id AND pr.deleted_at IS NULL
  ),
  gar_emb AS (
    SELECT g.id FROM public.embarque_garantias_contenedor g
    WHERE g.embarque_id = p_embarque_id AND g.deleted_at IS NULL
  ),
  feed (f_id, f_categoria, f_tipo, f_fecha, f_usuario, f_accion, f_titulo,
        f_descripcion, f_monto, f_moneda, f_ref_tipo, f_ref_id, f_dedupe, f_detalles) AS (
    SELECT ('nota-' || n.id)::text, 'operacion'::text, 'nota'::text, n.fecha,
           COALESCE(n.usuario, '')::text,
           CASE WHEN n.tipo = 'cambio_estado' THEN 'Cambio de estado' ELSE 'Nota' END::text,
           n.contenido::text, NULL::text, NULL::numeric, NULL::text,
           'embarque'::text, p_embarque_id,
           CASE WHEN n.tipo = 'cambio_estado'
                THEN 'estado|' || to_char(n.fecha, 'YYYYMMDDHH24MI') END::text,
           NULL::jsonb
    FROM public.notas_embarque n
    WHERE n.embarque_id = p_embarque_id AND n.deleted_at IS NULL

    UNION ALL
    SELECT ('ev-' || ev.id), 'operacion', 'evento', ev.fecha, COALESCE(ev.usuario, ''),
           ev.tipo::text, COALESCE(NULLIF(ev.descripcion, ''), ev.tipo::text),
           NULLIF(ev.ubicacion, ''), NULL, NULL, 'embarque', p_embarque_id,
           CASE WHEN ev.descripcion ILIKE 'Estado cambiado a%'
                THEN 'estado|' || to_char(ev.fecha, 'YYYYMMDDHH24MI') END,
           NULL
    FROM public.eventos_embarque ev
    WHERE ev.embarque_id = p_embarque_id

    UNION ALL
    SELECT ('doc-' || d.id), 'operacion', 'documento', d.created_at, '',
           'Documento', d.nombre, NULLIF(d.estado::text, ''), NULL, NULL,
           'documento', d.id, NULL, jsonb_build_object('archivo', d.archivo)
    FROM public.documentos_embarque d
    WHERE d.embarque_id = p_embarque_id AND d.deleted_at IS NULL

    UNION ALL
    SELECT ('bit-' || b.id), 'operacion', 'bitacora', b.created_at,
           COALESCE(b.usuario_email, ''), b.accion, b.accion, NULL, NULL, NULL,
           'embarque', p_embarque_id,
           CASE WHEN b.accion = 'cambiar_estado'
                THEN 'estado|' || to_char(b.created_at, 'YYYYMMDDHH24MI') END,
           b.detalles
    FROM public.bitacora_actividad b
    WHERE b.entidad_id = p_embarque_id
       OR (b.entidad_id IS NULL AND v_exp IS NOT NULL AND b.entidad_nombre = v_exp)

    UNION ALL
    SELECT ('trk-' || t.id), 'operacion', 'tracking', t.created_at,
           COALESCE(t.usuario_email, ''),
           t.accion, 'Consulta de rastreo (' || COALESCE(t.provider, 'n/d') || ')',
           NULLIF(t.mensaje, ''), NULL, NULL, 'embarque', p_embarque_id, NULL, t.detalle
    FROM public.tracking_intentos t
    WHERE t.embarque_id = p_embarque_id

    UNION ALL
    SELECT ('cot-' || c.id), 'comercial', 'cotizacion', c.created_at, '',
           'Cotización creada', 'Cotización ' || COALESCE(c.folio, ''), NULL,
           CASE WHEN v_fin THEN c.subtotal END, c.moneda::text, 'cotizacion', c.id, NULL, NULL
    FROM public.cotizaciones c
    WHERE v_cot IS NOT NULL AND c.id = v_cot

    UNION ALL
    SELECT ('cot-ac-' || c.id), 'comercial', 'cotizacion', c.fecha_aceptacion, '',
           'Cotización aceptada', 'Cotización ' || COALESCE(c.folio, ''), NULL,
           NULL, NULL, 'cotizacion', c.id, NULL, NULL
    FROM public.cotizaciones c
    WHERE v_cot IS NOT NULL AND c.id = v_cot AND c.fecha_aceptacion IS NOT NULL

    UNION ALL
    SELECT ('bitc-' || b.id), 'comercial', 'bitacora', b.created_at,
           COALESCE(b.usuario_email, ''), b.accion, 'Cotización: ' || b.accion, NULL,
           NULL, NULL, 'cotizacion', v_cot, NULL, b.detalles
    FROM public.bitacora_actividad b
    WHERE v_cot IS NOT NULL AND b.entidad_id = v_cot

    UNION ALL
    SELECT ('prof-' || pr.id), 'finanzas', 'proforma', pr.created_at, COALESCE(u.email, ''),
           'Proforma generada', 'Proforma ' || COALESCE(pr.numero, ''), NULL,
           CASE WHEN v_fin THEN pr.total_usd END, 'USD', 'proforma', pr.id, NULL, NULL
    FROM prof_emb pr LEFT JOIN auth.users u ON u.id = pr.created_by

    UNION ALL
    SELECT ('prof-env-' || pr.id), 'finanzas', 'proforma', pr.enviada_at,
           COALESCE(u.email, ''), 'Proforma enviada',
           'Proforma ' || COALESCE(pr.numero, '') || ' enviada al cliente', NULL,
           NULL, NULL, 'proforma', pr.id, NULL, NULL
    FROM prof_emb pr LEFT JOIN auth.users u ON u.id = pr.enviada_por
    WHERE pr.enviada_at IS NOT NULL

    UNION ALL
    SELECT ('prof-res-' || pr.id), 'finanzas', 'proforma',
           COALESCE(pr.aceptada_at, pr.rechazada_at), COALESCE(pr.aceptada_por, ''),
           CASE WHEN pr.aceptada_at IS NOT NULL THEN 'Proforma aceptada' ELSE 'Proforma rechazada' END,
           'Proforma ' || COALESCE(pr.numero, ''), NULLIF(pr.motivo_rechazo, ''),
           NULL, NULL, 'proforma', pr.id, NULL, NULL
    FROM prof_emb pr WHERE pr.aceptada_at IS NOT NULL OR pr.rechazada_at IS NOT NULL

    UNION ALL
    SELECT ('bitp-' || b.id), 'finanzas', 'bitacora', b.created_at,
           COALESCE(b.usuario_email, ''), b.accion, 'Proforma: ' || b.accion, NULL,
           NULL, NULL, 'proforma', b.entidad_id, NULL, b.detalles
    FROM public.bitacora_actividad b
    WHERE b.entidad_id IN (SELECT pr.id FROM prof_emb pr)

    UNION ALL
    SELECT ('fac-' || f.id), 'finanzas', 'factura', f.created_at, '',
           'Factura creada',
           'Factura ' || COALESCE(f.serie, '') || COALESCE(f.numero::text, '') || ' · ' || f.estado::text,
           NULL, CASE WHEN v_fin THEN f.total END, f.moneda::text, 'factura', f.id, NULL, NULL
    FROM facturas_emb f

    UNION ALL
    SELECT ('fac-tim-' || f.id), 'finanzas', 'factura', f.timbrado_en,
           COALESCE(u.email, ''), 'Factura timbrada',
           'Factura ' || COALESCE(f.serie, '') || COALESCE(f.numero::text, ''),
           NULLIF(f.uuid_fiscal, ''), CASE WHEN v_fin THEN f.total END, f.moneda::text,
           'factura', f.id, NULL, NULL
    FROM facturas_emb f LEFT JOIN auth.users u ON u.id = f.timbrado_por
    WHERE f.timbrado_en IS NOT NULL

    UNION ALL
    SELECT ('fac-can-' || f.id), 'finanzas', 'factura', f.cancelado_en, '',
           'Factura cancelada',
           'Factura ' || COALESCE(f.serie, '') || COALESCE(f.numero::text, ''),
           NULLIF(f.cancelacion_motivo, ''), NULL, NULL, 'factura', f.id, NULL, NULL
    FROM facturas_emb f WHERE f.cancelado_en IS NOT NULL

    UNION ALL
    SELECT ('fac-mail-' || fe2.id), 'finanzas', 'email', fe2.created_at,
           COALESCE(u.email, ''), 'Factura enviada por correo',
           COALESCE(fe2.asunto, 'Envío de factura'),
           (SELECT string_agg(x.value #>> '{}', ', ')
              FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(fe2.destinatarios) = 'array'
                          THEN fe2.destinatarios ELSE '[]'::jsonb END) x),
           NULL, NULL, 'factura', fe2.factura_id,
           NULL, jsonb_build_object('estado', fe2.estado, 'error', fe2.error)
    FROM public.factura_envios fe2
    LEFT JOIN auth.users u ON u.id = fe2.enviado_por
    WHERE fe2.factura_id IN (SELECT f.id FROM facturas_emb f)

    UNION ALL
    SELECT ('bitf-' || b.id), 'finanzas', 'bitacora', b.created_at,
           COALESCE(b.usuario_email, ''), b.accion, 'Factura: ' || b.accion, NULL,
           NULL, NULL, 'factura', b.entidad_id, NULL, b.detalles
    FROM public.bitacora_actividad b
    WHERE b.entidad_id IN (SELECT f.id FROM facturas_emb f)

    UNION ALL
    SELECT ('pag-' || pg.id), 'finanzas', 'pago', COALESCE(pg.fecha_pago::timestamptz, pg.created_at),
           COALESCE(u.email, ''), 'Pago recibido',
           'Pago ' || COALESCE(pg.forma_pago, '') || COALESCE(' · ref ' || NULLIF(pg.referencia, ''), ''),
           NULL, CASE WHEN v_fin THEN pg.monto END, pg.moneda::text, 'factura', pg.factura_id, NULL, NULL
    FROM public.pagos_factura pg
    LEFT JOIN auth.users u ON u.id = pg.created_by
    WHERE pg.deleted_at IS NULL
      AND (pg.embarque_id = p_embarque_id OR pg.factura_id IN (SELECT f.id FROM facturas_emb f))

    UNION ALL
    SELECT ('nc-' || nc.id), 'finanzas', 'nota_credito', nc.created_at,
           COALESCE(u.email, ''), 'Nota de crédito ' || nc.estado::text,
           'NC ' || COALESCE(nc.folio, '') || ' · ' || nc.motivo::text,
           NULLIF(nc.descripcion, ''), CASE WHEN v_fin THEN nc.monto END, nc.moneda::text,
           'factura', nc.factura_id, NULL, NULL
    FROM public.factura_notas_credito nc
    LEFT JOIN auth.users u ON u.id = nc.created_by
    WHERE nc.deleted_at IS NULL AND nc.factura_id IN (SELECT f.id FROM facturas_emb f)

    UNION ALL
    SELECT ('pf-' || pf.id), 'finanzas', 'cxp', pf.created_at, COALESCE(u.email, ''),
           'Factura de proveedor capturada',
           COALESCE(pf.folio_interno, pf.folio_proveedor, 'CxP') || ' · ' || COALESCE(pf.proveedor_nombre, ''),
           NULL, CASE WHEN v_fin THEN pf.total END, pf.moneda::text, 'cxp', pf.id, NULL, NULL
    FROM pf_emb pf LEFT JOIN auth.users u ON u.id = pf.created_by

    UNION ALL
    SELECT ('pf-apr-' || pf.id), 'finanzas', 'cxp', pf.aprobada_at, COALESCE(u.email, ''),
           'Factura de proveedor ' || pf.estado_aprobacion::text,
           COALESCE(pf.folio_interno, pf.folio_proveedor, 'CxP'),
           NULLIF(pf.motivo_rechazo, ''), NULL, NULL, 'cxp', pf.id, NULL, NULL
    FROM pf_emb pf LEFT JOIN auth.users u ON u.id = pf.aprobada_por
    WHERE pf.aprobada_at IS NOT NULL

    UNION ALL
    SELECT ('bitx-' || b.id), 'finanzas', 'bitacora', b.created_at,
           COALESCE(b.usuario_email, ''), b.accion, 'CxP: ' || b.accion, NULL,
           NULL, NULL, 'cxp', b.entidad_id, NULL, b.detalles
    FROM public.bitacora_actividad b
    WHERE b.entidad_id IN (SELECT pf.id FROM pf_emb pf)

    UNION ALL
    SELECT ('pp-' || pp.id), 'finanzas', 'pago_proveedor',
           COALESCE(pp.fecha_pago::timestamptz, pp.created_at), COALESCE(u.email, ''),
           'Pago a proveedor',
           COALESCE(pp.metodo_pago, '') || COALESCE(' · ref ' || NULLIF(pp.referencia, ''), ''),
           NULL, CASE WHEN v_fin THEN pp.monto END, pp.moneda::text, 'cxp', pp.proveedor_factura_id,
           NULL, NULL
    FROM public.pagos_proveedor pp
    LEFT JOIN auth.users u ON u.id = pp.created_by
    WHERE pp.deleted_at IS NULL AND pp.proveedor_factura_id IN (SELECT pf.id FROM pf_emb pf)

    UNION ALL
    SELECT ('fe-' || fe3.id), 'finanzas', 'buzon', fe3.created_at, COALESCE(u.email, ''),
           'Invoice recibido', COALESCE(fe3.nombre_archivo, 'Archivo'), NULLIF(fe3.nota, ''),
           CASE WHEN v_fin THEN fe3.total_detectado END, fe3.moneda_detectada,
           'buzon', fe3.id, NULL, NULL
    FROM public.embarque_facturas_entrantes fe3
    LEFT JOIN auth.users u ON u.id = fe3.subido_por
    WHERE fe3.embarque_id = p_embarque_id AND fe3.deleted_at IS NULL

    UNION ALL
    SELECT ('fe-cap-' || fe4.id), 'finanzas', 'buzon', fe4.updated_at, COALESCE(u.email, ''),
           CASE WHEN fe4.estado = 'rechazada' THEN 'Invoice rechazado' ELSE 'Invoice capturado' END,
           COALESCE(fe4.nombre_archivo, 'Archivo'), NULLIF(fe4.rechazo_motivo, ''),
           NULL, NULL, 'buzon', fe4.id, NULL, NULL
    FROM public.embarque_facturas_entrantes fe4
    LEFT JOIN auth.users u ON u.id = fe4.capturado_por
    WHERE fe4.embarque_id = p_embarque_id AND fe4.deleted_at IS NULL
      AND fe4.estado <> 'por_capturar'

    UNION ALL
    SELECT ('gar-' || gh.id), 'riesgo', 'garantia', gh.changed_at, COALESCE(u.email, ''),
           'Garantía: ' || COALESCE(gh.estado_anterior, 'nueva') || ' → ' || gh.estado_nuevo,
           'Garantía de contenedor', NULLIF(gh.notas, ''),
           CASE WHEN v_fin THEN gh.monto_deposito_usd END, 'USD', 'garantia', gh.garantia_id, NULL, NULL
    FROM public.embarque_garantias_historial gh
    LEFT JOIN auth.users u ON u.id = gh.changed_by
    WHERE gh.garantia_id IN (SELECT g.id FROM gar_emb g)

    UNION ALL
    SELECT ('seg-' || s.id), 'riesgo', 'seguro', s.created_at, COALESCE(u.email, ''),
           'Seguro registrado',
           COALESCE(s.aseguradora, 'Póliza') || COALESCE(' · ' || NULLIF(s.numero_poliza, ''), ''),
           NULLIF(s.cobertura_descripcion, ''), CASE WHEN v_fin THEN s.suma_asegurada END,
           s.moneda::text, 'seguro', s.id, NULL, NULL
    FROM public.seguros_embarque s
    LEFT JOIN auth.users u ON u.id = s.created_by
    WHERE s.embarque_id = p_embarque_id AND s.deleted_at IS NULL

    UNION ALL
    SELECT ('cie-' || cl.id), 'cierre', 'cierre', cl.created_at, COALESCE(u.email, ''),
           CASE WHEN cl.accion = 'cerrar' THEN 'Embarque cerrado' ELSE 'Embarque reabierto' END,
           CASE WHEN cl.accion = 'cerrar' THEN 'Cierre financiero' ELSE 'Reapertura' END,
           NULLIF(cl.motivo, ''), NULL, NULL, 'embarque', p_embarque_id, NULL, NULL
    FROM public.cierre_embarque_log cl
    LEFT JOIN auth.users u ON u.id = cl.usuario_id
    WHERE cl.embarque_id = p_embarque_id
  )
  SELECT f_id, f_categoria, f_tipo, f_fecha, f_usuario, f_accion, f_titulo,
         f_descripcion, f_monto, f_moneda, f_ref_tipo, f_ref_id, f_dedupe, f_detalles
  FROM feed
  WHERE f_fecha IS NOT NULL
  ORDER BY f_fecha DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.duplicar_embarque_completo(p_embarque_origen_id uuid, p_copias jsonb, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  origen embarques%ROWTYPE;
  copia jsonb;
  nuevo_id uuid;
  creados jsonb := '[]'::jsonb;
  v_resp jsonb;
  v_mapping jsonb;
BEGIN
  v_resp := public.idempotency_claim(p_request_id, 'duplicar_embarque_completo');
  IF v_resp IS NOT NULL THEN RETURN v_resp; END IF;

  SELECT * INTO origen FROM embarques WHERE id = p_embarque_origen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Embarque origen no encontrado'; END IF;
  PERFORM public._assert_writer(origen.organization_id);

  FOR copia IN SELECT * FROM jsonb_array_elements(p_copias)
  LOOP
    INSERT INTO embarques (
      expediente, estado, cliente_id, cliente_nombre, modo, tipo, incoterm,
      bl_master, bl_house, naviera, puerto_origen, puerto_destino,
      aeropuerto_origen, aeropuerto_destino, ciudad_origen, ciudad_destino,
      aerolinea, transportista, agente, shipper, consignatario,
      descripcion_mercancia, tipo_carga, tipo_servicio, operador,
      mawb, hawb, carta_porte, etd, eta,
      tipo_cambio_usd, tipo_cambio_eur,
      contenedor, tipo_contenedor, peso_kg, volumen_m3, piezas, organization_id
    ) VALUES (
      origen.expediente, 'Confirmado', origen.cliente_id, origen.cliente_nombre,
      origen.modo, origen.tipo, origen.incoterm,
      origen.bl_master, origen.bl_house, origen.naviera,
      origen.puerto_origen, origen.puerto_destino,
      origen.aeropuerto_origen, origen.aeropuerto_destino,
      origen.ciudad_origen, origen.ciudad_destino,
      origen.aerolinea, origen.transportista, origen.agente,
      origen.shipper, origen.consignatario,
      origen.descripcion_mercancia, origen.tipo_carga, origen.tipo_servicio,
      origen.operador, origen.mawb, origen.hawb, origen.carta_porte,
      origen.etd, origen.eta,
      origen.tipo_cambio_usd, origen.tipo_cambio_eur,
      NULLIF(copia->>'num_contenedor', ''), NULLIF(copia->>'tipo_contenedor', ''),
      (copia->>'peso_kg')::numeric, (copia->>'volumen_m3')::numeric, (copia->>'piezas')::int,
      origen.organization_id
    ) RETURNING id INTO nuevo_id;

    WITH inserted AS (
      INSERT INTO embarque_contenedores (
        embarque_id, organization_id, numero_contenedor, tipo_contenedor,
        bl_house, peso_kg, volumen_m3, piezas, orden
      )
      SELECT
        nuevo_id, origen.organization_id, numero_contenedor, tipo_contenedor,
        bl_house, peso_kg, volumen_m3, piezas, orden
      FROM embarque_contenedores
      WHERE embarque_id = p_embarque_origen_id AND deleted_at IS NULL
      RETURNING id, orden
    ),
    paired AS (
      SELECT
        old.id AS old_id,
        new.id AS new_id
      FROM (
        SELECT id, orden FROM embarque_contenedores
        WHERE embarque_id = p_embarque_origen_id AND deleted_at IS NULL
      ) old
      JOIN inserted new ON new.orden = old.orden
    )
    SELECT COALESCE(jsonb_object_agg(old_id::text, new_id), '{}'::jsonb)
    INTO v_mapping
    FROM paired;

    INSERT INTO conceptos_venta (
      embarque_id, descripcion, cantidad, precio_unitario, moneda, total,
      organization_id, contenedor_id, aplica_iva, tipo_iva
    )
    SELECT
      nuevo_id, descripcion, cantidad, precio_unitario, moneda, total,
      origen.organization_id,
      CASE
        WHEN contenedor_id IS NOT NULL AND v_mapping ? contenedor_id::text
          THEN (v_mapping->>contenedor_id::text)::uuid
        ELSE NULL
      END,
      aplica_iva, tipo_iva
    FROM conceptos_venta
    WHERE embarque_id = p_embarque_origen_id AND deleted_at IS NULL;

    INSERT INTO conceptos_costo (
      embarque_id, concepto, proveedor_nombre, proveedor_id, moneda, monto,
      organization_id, contenedor_id
    )
    SELECT
      nuevo_id, concepto, proveedor_nombre, proveedor_id, moneda, monto,
      origen.organization_id,
      CASE
        WHEN contenedor_id IS NOT NULL AND v_mapping ? contenedor_id::text
          THEN (v_mapping->>contenedor_id::text)::uuid
        ELSE NULL
      END
    FROM conceptos_costo
    WHERE embarque_id = p_embarque_origen_id AND deleted_at IS NULL;

    INSERT INTO notas_embarque (embarque_id, contenido, tipo, organization_id)
    VALUES (nuevo_id, 'Embarque duplicado desde ' || origen.expediente, 'sistema', origen.organization_id);

    creados := creados || jsonb_build_object('id', nuevo_id, 'expediente', origen.expediente);
  END LOOP;

  PERFORM public.idempotency_store(p_request_id, creados);
  RETURN creados;
END;
$function$;

CREATE OR REPLACE FUNCTION public.eliminar_pago_cliente(_pago_id uuid, _motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pago record;
  v_baja int := 0;
  v_desvinculados int := 0;
BEGIN
  SELECT id, factura_id, organization_id, deleted_at, uuid_rep, rep_cancelado_en, monto, moneda
    INTO v_pago
  FROM public.pagos_factura
  WHERE id = _pago_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LC_PAGO_NO_ENCONTRADO: el pago % no existe', _pago_id USING ERRCODE = 'P0002';
  END IF;

  IF v_pago.deleted_at IS NOT NULL THEN
    -- Idempotente: no se vuelve a tocar el banco ni la bitacora.
    RETURN jsonb_build_object(
      'pago_id', _pago_id, 'ya_eliminado', true,
      'movimientos_baja', 0, 'movimientos_desvinculados', 0
    );
  END IF;

  IF NOT public.has_role(v_uid, 'super_admin'::app_role)
     AND v_pago.organization_id IS DISTINCT FROM public.current_user_org_id() THEN
    RAISE EXCEPTION 'LC_ORG_FORBIDDEN: el pago pertenece a otra organizacion'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.es_escritor_financiero(v_uid) THEN
    RAISE EXCEPTION 'LC_PAGO_SIN_PERMISO: tu rol no puede eliminar pagos'
      USING ERRCODE = '42501';
  END IF;

  IF v_pago.uuid_rep IS NOT NULL AND v_pago.rep_cancelado_en IS NULL THEN
    RAISE EXCEPTION 'LC_PAGO_CON_REP_VIVO: cancela el complemento de pago (REP) antes de eliminar el pago'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.pagos_factura
     SET deleted_at = now(), deleted_by = v_uid
   WHERE id = _pago_id AND deleted_at IS NULL;

  -- 1) Movimiento generado por el sistema: se da de baja con el pago.
  WITH baja AS (
    UPDATE public.bbva_movimientos
       SET deleted_at = now(), deleted_by = v_uid
     WHERE pago_factura_id = _pago_id
       AND deleted_at IS NULL
       AND hash_dedupe = 'cobro-' || _pago_id::text
    RETURNING 1
  )
  SELECT count(*) INTO v_baja FROM baja;

  -- 2) Movimiento importado del estado de cuenta: se conserva y se desvincula.
  WITH libre AS (
    UPDATE public.bbva_movimientos
       SET pago_factura_id = NULL,
           estado_conciliacion = 'Pendiente'::estado_conciliacion,
           conciliado_por = NULL,
           conciliado_at = NULL
     WHERE pago_factura_id = _pago_id
       AND deleted_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_desvinculados FROM libre;

  INSERT INTO public.bitacora_actividad
    (usuario_id, usuario_email, accion, modulo, entidad_id, detalles, organization_id)
  VALUES (
    COALESCE(v_uid, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE((SELECT u.email FROM auth.users u WHERE u.id = v_uid), 'sistema'),
    'eliminar_pago', 'facturacion', v_pago.factura_id,
    jsonb_build_object(
      'pago_id', _pago_id,
      'monto', v_pago.monto,
      'moneda', v_pago.moneda,
      'motivo', _motivo,
      'movimientos_baja', v_baja,
      'movimientos_desvinculados', v_desvinculados,
      'atomico', true
    ),
    v_pago.organization_id
  );

  RETURN jsonb_build_object(
    'pago_id', _pago_id,
    'factura_id', v_pago.factura_id,
    'ya_eliminado', false,
    'movimientos_baja', v_baja,
    'movimientos_desvinculados', v_desvinculados
  );
END;
$function$;

DO $preimage$
BEGIN
  IF md5(pg_get_functiondef('public._cxp_desvincular_por_rechazo(uuid,text)'::regprocedure)) IS DISTINCT FROM '01ff07d48c12e3a20ab2cfc0457eb6be' THEN
    RAISE EXCEPTION 'Fixture de replay 0092–0094: definición inesperada de _cxp_desvincular_por_rechazo';
  END IF;
  IF md5(pg_get_functiondef('public.actividad_embarque(uuid)'::regprocedure)) IS DISTINCT FROM 'db0e0b27e33dccea3db1014cda97643e' THEN
    RAISE EXCEPTION 'Fixture de replay 0092–0094: definición inesperada de actividad_embarque';
  END IF;
  IF md5(pg_get_functiondef('public.duplicar_embarque_completo(uuid,jsonb,uuid)'::regprocedure)) IS DISTINCT FROM 'aa6e5e8b32e24414d4de71f60f39dec9' THEN
    RAISE EXCEPTION 'Fixture de replay 0092–0094: definición inesperada de duplicar_embarque_completo';
  END IF;
  IF md5(pg_get_functiondef('public.eliminar_pago_cliente(uuid,text)'::regprocedure)) IS DISTINCT FROM '0462986b0e6d9f0ccd17bc7fb4a3c18e' THEN
    RAISE EXCEPTION 'Fixture de replay 0092–0094: definición inesperada de eliminar_pago_cliente';
  END IF;
END;
$preimage$;
