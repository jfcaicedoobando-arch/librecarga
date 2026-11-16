-- Espejo R4: borrador explícito y snapshot comercial, sin backfill histórico.
CREATE OR REPLACE FUNCTION public.crear_embarque_completo(p_embarque jsonb, p_conceptos_venta jsonb DEFAULT '[]'::jsonb, p_conceptos_costo jsonb DEFAULT '[]'::jsonb, p_documentos jsonb DEFAULT '[]'::jsonb, p_request_id uuid DEFAULT NULL::uuid, p_contenedores jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  nuevo_id uuid := gen_random_uuid();
  v_org_id uuid; v_resp jsonb;
  v_cot_id uuid;
  v_cot public.cotizaciones;
  v_aprobada jsonb;
  cv jsonb; cc jsonb; doc jsonb; ct jsonb;
BEGIN
  PERFORM public._assert_medidas_embarque(p_embarque);
  v_org_id := current_user_org_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'No organization context for caller'; END IF;
  PERFORM public._assert_writer(v_org_id);
  v_cot_id := NULLIF(p_embarque->>'cotizacion_id','')::uuid;
  PERFORM public._assert_relaciones_embarque(
    v_org_id,
    NULLIF(p_embarque->>'cliente_id','')::uuid,
    v_cot_id,
    p_conceptos_costo
  );
  v_resp := public.idempotency_claim(p_request_id, 'crear_embarque_completo');
  IF v_resp IS NOT NULL THEN RETURN v_resp; END IF;
  PERFORM public._assert_cotizacion_convertible(v_cot_id, v_org_id);
  SELECT * INTO v_cot FROM public.cotizaciones WHERE id = v_cot_id;
  IF v_cot.evaluacion_fiscal IS NOT NULL THEN
    -- El alta por formulario debe copiar la misma venta que la conversión.
    IF v_cot.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado'
      OR v_cot.cliente_id IS DISTINCT FROM NULLIF(p_embarque->>'cliente_id','')::uuid
      OR (public._evaluar_documento_isr_resico(v_org_id, v_cot.cliente_id, v_cot.conceptos_venta)->'conceptos')
        IS DISTINCT FROM v_cot.conceptos_venta THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    IF jsonb_typeof(p_conceptos_venta) IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_conceptos_venta) <> jsonb_array_length(v_cot.conceptos_venta)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_conceptos_venta) c
        GROUP BY c->>'cotizacion_concepto_origen_id' HAVING count(*) > 1
      ) THEN
      RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NULLIF(p_embarque->>'tarifa_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.costeo_tarifas t
    WHERE t.id = (p_embarque->>'tarifa_id')::uuid AND t.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'LC_EMBARQUE_TARIFA_INVALIDA: la tarifa no pertenece a tu organización'
      USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO embarques (
    id, expediente, estado, cliente_id, cliente_nombre, modo, tipo,
    shipper, consignatario, incoterm, descripcion_mercancia,
    peso_kg, volumen_m3, piezas,
    puerto_origen, puerto_destino, naviera, agente, naviera_id, agente_id,
    bl_master, bl_house, tipo_servicio, contenedor, tipo_contenedor,
    aeropuerto_origen, aeropuerto_destino, aerolinea,
    mawb, hawb, ciudad_origen, ciudad_destino,
    transportista, carta_porte, etd, eta,
    tipo_cambio_usd, tipo_cambio_eur,
    tipo_carga, msds_archivo, operador, organization_id, cotizacion_id,
    tarifa_id, carta_garantia, dias_libres_destino, dias_almacenaje,
    seguro, valor_seguro_usd, notas
  ) VALUES (
    nuevo_id, NULLIF(p_embarque->>'expediente', ''), 'Borrador'::estado_embarque, (p_embarque->>'cliente_id')::uuid,
    COALESCE(p_embarque->>'cliente_nombre',''),
    (p_embarque->>'modo')::modo_transporte, (p_embarque->>'tipo')::tipo_operacion,
    COALESCE(p_embarque->>'shipper',''), COALESCE(p_embarque->>'consignatario',''),
    COALESCE((p_embarque->>'incoterm')::incoterm,'FOB'),
    COALESCE(p_embarque->>'descripcion_mercancia',''),
    COALESCE((p_embarque->>'peso_kg')::numeric,0),
    COALESCE((p_embarque->>'volumen_m3')::numeric,0),
    COALESCE((p_embarque->>'piezas')::int,0),
    p_embarque->>'puerto_origen', p_embarque->>'puerto_destino',
    p_embarque->>'naviera', p_embarque->>'agente',
    NULLIF(p_embarque->>'naviera_id','')::uuid, NULLIF(p_embarque->>'agente_id','')::uuid,
    p_embarque->>'bl_master', p_embarque->>'bl_house',
    CASE WHEN p_embarque->>'tipo_servicio' IS NOT NULL THEN (p_embarque->>'tipo_servicio')::tipo_servicio_maritimo END,
    p_embarque->>'contenedor', p_embarque->>'tipo_contenedor',
    p_embarque->>'aeropuerto_origen', p_embarque->>'aeropuerto_destino',
    p_embarque->>'aerolinea', p_embarque->>'mawb', p_embarque->>'hawb',
    p_embarque->>'ciudad_origen', p_embarque->>'ciudad_destino',
    p_embarque->>'transportista', p_embarque->>'carta_porte',
    CASE WHEN p_embarque->>'etd' IS NOT NULL THEN (p_embarque->>'etd')::date END,
    CASE WHEN p_embarque->>'eta' IS NOT NULL THEN (p_embarque->>'eta')::date END,
    NULLIF(NULLIF(p_embarque->>'tipo_cambio_usd','')::numeric, 0),
    NULLIF(NULLIF(p_embarque->>'tipo_cambio_eur','')::numeric, 0),
    COALESCE(p_embarque->>'tipo_carga','Carga General'),
    p_embarque->>'msds_archivo', COALESCE(p_embarque->>'operador',''),
    v_org_id,
    v_cot_id,
    NULLIF(p_embarque->>'tarifa_id', '')::uuid,
    COALESCE((p_embarque->>'carta_garantia')::boolean, false),
    COALESCE((p_embarque->>'dias_libres_destino')::integer, 0),
    COALESCE((p_embarque->>'dias_almacenaje')::integer, 0),
    COALESCE((p_embarque->>'seguro')::boolean, false),
    NULLIF(p_embarque->>'valor_seguro_usd', '')::numeric,
    NULLIF(p_embarque->>'notas', '')
  );
  FOR cv IN SELECT * FROM jsonb_array_elements(p_conceptos_venta) LOOP
    IF COALESCE((cv->>'tasa_ret_iva')::numeric, 0) <> 0 THEN
      RAISE EXCEPTION 'LC_ISR_RETENCION_NO_SOPORTADA' USING ERRCODE = '22023';
    END IF;
    IF v_cot.evaluacion_fiscal IS NOT NULL THEN
      SELECT c INTO v_aprobada FROM jsonb_array_elements(v_cot.conceptos_venta) c
        WHERE c->>'id' = cv->>'cotizacion_concepto_origen_id';
      IF v_aprobada IS NULL
        OR (cv->>'descripcion', (cv->>'cantidad')::numeric, (cv->>'precio_unitario')::numeric,
            cv->>'moneda', NULLIF(cv->>'tipo_iva', ''))
          IS DISTINCT FROM
           (v_aprobada->>'descripcion', (v_aprobada->>'cantidad')::numeric,
            (v_aprobada->>'precio_unitario')::numeric, v_aprobada->>'moneda', v_aprobada->>'tipo_iva') THEN
        RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE = '23514';
      END IF;
      cv := v_aprobada || jsonb_build_object(
        'total', round((v_aprobada->>'cantidad')::numeric * (v_aprobada->>'precio_unitario')::numeric, 2)
      );
    END IF;
    INSERT INTO conceptos_venta (embarque_id, descripcion, cantidad, precio_unitario, moneda, total,
                                 aplica_iva, tasa_iva_aplicada, tipo_iva, organization_id,
                                 evaluacion_fiscal, origen, cotizacion_concepto_origen_id)
    VALUES (nuevo_id, cv->>'descripcion', (cv->>'cantidad')::numeric, (cv->>'precio_unitario')::numeric,
            (cv->>'moneda')::moneda, (cv->>'total')::numeric,
            COALESCE((cv->>'aplica_iva')::boolean, false),
            COALESCE((cv->>'tasa_iva_aplicada')::numeric, 0.16),
            NULLIF(cv->>'tipo_iva', ''),
            v_org_id, v_aprobada->'evaluacion_fiscal',
            CASE WHEN v_aprobada IS NOT NULL THEN 'cotizacion' ELSE 'manual' END,
            v_aprobada->>'id');
  END LOOP;
  FOR cc IN SELECT * FROM jsonb_array_elements(p_conceptos_costo) LOOP
    INSERT INTO conceptos_costo (embarque_id, concepto, proveedor_nombre, proveedor_id, moneda, monto, organization_id)
    VALUES (nuevo_id, cc->>'concepto', COALESCE(cc->>'proveedor_nombre',''),
      CASE WHEN cc->>'proveedor_id' IS NOT NULL AND cc->>'proveedor_id' <> '' THEN (cc->>'proveedor_id')::uuid END,
      (cc->>'moneda')::moneda, (cc->>'monto')::numeric, v_org_id);
  END LOOP;
  FOR doc IN SELECT * FROM jsonb_array_elements(p_documentos) LOOP
    INSERT INTO documentos_embarque (embarque_id, nombre, archivo, estado, organization_id)
    VALUES (nuevo_id, doc->>'nombre', NULLIF(doc->>'archivo',''),
      CASE WHEN NULLIF(doc->>'archivo','') IS NOT NULL THEN 'Recibido'::estado_documento ELSE 'Pendiente'::estado_documento END,
      v_org_id);
  END LOOP;
  FOR ct IN SELECT * FROM jsonb_array_elements(COALESCE(p_contenedores, '[]'::jsonb)) LOOP
    INSERT INTO embarque_contenedores (
      embarque_id, numero_contenedor, tipo_contenedor, bl_house,
      peso_kg, volumen_m3, piezas, orden, organization_id
    ) VALUES (
      nuevo_id,
      COALESCE(ct->>'numero_contenedor',''),
      COALESCE(ct->>'tipo_contenedor',''),
      NULLIF(ct->>'bl_house',''),
      COALESCE(NULLIF(ct->>'peso_kg','')::numeric, 0),
      COALESCE(NULLIF(ct->>'volumen_m3','')::numeric, 0),
      COALESCE(NULLIF(ct->>'piezas','')::int, 0),
      COALESCE(NULLIF(ct->>'orden','')::int, 1),
      v_org_id
    );
  END LOOP;
  INSERT INTO notas_embarque (embarque_id, contenido, tipo, organization_id)
  VALUES (nuevo_id, 'Embarque creado', 'sistema', v_org_id);
  v_resp := jsonb_build_object('id', nuevo_id);
  PERFORM public.idempotency_store(p_request_id, v_resp);
  RETURN v_resp;
END;
$function$;
REVOKE ALL ON FUNCTION public.crear_embarque_completo(jsonb, jsonb, jsonb, jsonb, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_embarque_completo(jsonb, jsonb, jsonb, jsonb, uuid, jsonb) TO authenticated, service_role;
