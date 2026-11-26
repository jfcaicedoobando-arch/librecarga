-- Correcciones de lógica de negocio verificadas en PostgreSQL aislado.
-- Los registros y saldos históricos se conservan.

-- supabase/schema/cotizaciones/revalidar_tarifa_cotizacion.sql
-- Fuente canónica de public.revalidar_tarifa_cotizacion (R201-COT-02).
-- Al modificar: edita ESTE archivo y genera la migración con el mismo cuerpo.
--
-- R201-COT-02: cuando ventas ya re-aprobó la tarifa, la revalidación deja de
-- devolver `bloqueante` (que dejaba a operaciones en un bucle pidiendo la misma
-- re-aprobación) y expone `estado_revalidacion` + `reaprobacion_vigente`. La
-- aprobación sólo vale para el delta que ventas vio: si la tarifa vuelve a
-- cambiar, el resultado regresa a `bloqueante`.

CREATE OR REPLACE FUNCTION public._flete_unitario_revalidacion(
  p_tarifa_id uuid, p_org uuid, p_peso numeric, p_volumen numeric, p_cantidad_original numeric
) RETURNS numeric
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  tarifa public.costeo_tarifas;
  kg numeric;
  precio numeric;
  flete numeric;
  flete_tramo_superior numeric;
BEGIN
  SELECT * INTO tarifa FROM public.costeo_tarifas WHERE id = p_tarifa_id AND organization_id = p_org;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF tarifa.modo = 'Marítimo' OR tarifa.unidad_flete IS DISTINCT FROM 'kg' THEN RETURN tarifa.flete_base; END IF;

  kg := CASE WHEN tarifa.modo = 'Aéreo' THEN round(greatest(p_peso, p_volumen * 167, 0), 2)
    ELSE greatest(p_peso, 0) END;
  IF kg <= 0 OR coalesce(p_cantidad_original, 0) <= 0 THEN RETURN NULL; END IF;

  SELECT precio_tramo.precio INTO precio FROM public.costeo_tarifa_tramos precio_tramo
  WHERE tarifa_id = p_tarifa_id AND organization_id = p_org AND desde_kg <= kg
  ORDER BY desde_kg DESC LIMIT 1;
  flete := round(kg * coalesce(precio, tarifa.flete_base), 2);

  IF tarifa.modo = 'Aéreo' THEN
    SELECT min(round(desde_kg * tramo.precio, 2)) INTO flete_tramo_superior
    FROM public.costeo_tarifa_tramos tramo
    WHERE tarifa_id = p_tarifa_id AND organization_id = p_org
      AND desde_kg > kg AND tramo.precio > 0;
    flete := least(flete, coalesce(flete_tramo_superior, flete));
  END IF;

  -- Devolver el importe equivalente por unidad original conserva la comparación
  -- económica cuando cambia el peso cobrable o se activa un mínimo por envío.
  RETURN greatest(flete, coalesce(tarifa.minimo, 0)) / p_cantidad_original;
END;
$$;

REVOKE ALL ON FUNCTION public._flete_unitario_revalidacion(uuid, uuid, numeric, numeric, numeric)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revalidar_tarifa_cotizacion(p_cotizacion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cot             public.cotizaciones%ROWTYPE;
  v_caller_org      UUID := current_user_org_id();
  v_is_super        BOOLEAN := has_role(auth.uid(),'super_admin'::app_role);
  v_umbral_pct      NUMERIC;
  v_bloquea_vencida BOOLEAN;
  v_tarifa_vigente  BOOLEAN := FALSE;
  v_fecha_operativa DATE;
  v_fecha_carga     DATE;
  v_cambios         JSONB := '[]'::jsonb;
  v_max_delta_pct   NUMERIC := 0;
  v_severidad       TEXT;
  v_costo           RECORD;
  v_monto_actual    NUMERIC;
  v_delta_abs       NUMERIC;
  v_delta_pct       NUMERIC;
  v_reaprob_vigente BOOLEAN := FALSE;
  v_snapshot        JSONB;
  v_filas_snapshot  JSONB := '[]'::jsonb;
  v_snapshot_aprob  JSONB;
BEGIN
  SELECT * INTO v_cot FROM public.cotizaciones WHERE id=p_cotizacion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada' USING ERRCODE='P0002'; END IF;
  -- v13.823.355 (YAGNI r2 · P1): una cotización eliminada no se revalida ni por
  -- RPC directa; antes seguía leyendo tarifas y devolviendo severidad.
  IF v_cot.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'LC_COTIZACION_ELIMINADA: la cotización está eliminada' USING ERRCODE='P0001';
  END IF;
  IF NOT v_is_super AND v_cot.organization_id IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  SELECT COALESCE((valor#>>'{}')::numeric,5) INTO v_umbral_pct
    FROM public.configuracion
    WHERE organization_id=v_cot.organization_id AND categoria='operaciones' AND clave='tarifa_revalidacion_umbral_pct';
  v_umbral_pct := COALESCE(v_umbral_pct,5);
  SELECT COALESCE((valor#>>'{}')::boolean,TRUE) INTO v_bloquea_vencida
    FROM public.configuracion
    WHERE organization_id=v_cot.organization_id AND categoria='operaciones' AND clave='tarifa_revalidacion_bloquea_si_vencida';
  v_bloquea_vencida := COALESCE(v_bloquea_vencida,TRUE);
  IF v_cot.tarifa_id IS NULL THEN
    RETURN jsonb_build_object(
      'tarifa_vigente',TRUE,'agente_sin_cupo',FALSE,'severidad','sin_cambios',
      'cambios','[]'::jsonb,'umbral_pct',v_umbral_pct,'max_delta_pct',0,
      'estado_revalidacion',v_cot.estado_revalidacion,'reaprobacion_vigente',FALSE,
      'motivo','sin_tarifa_vinculada');
  END IF;
  SELECT solicitud.fecha_tentativa_carga INTO v_fecha_carga
  FROM public.crm_solicitudes_pricing solicitud
  WHERE solicitud.id=v_cot.pricing_solicitud_id AND solicitud.organization_id=v_cot.organization_id
    AND solicitud.deleted_at IS NULL;
  v_fecha_operativa := greatest(public.fecha_negocio_mx(), v_fecha_carga);
  SELECT EXISTS (
    SELECT 1 FROM public.costeo_tarifas t
    JOIN public.costeo_agentes a ON a.id=t.agente_id AND a.organization_id=t.organization_id AND a.activo
    WHERE t.id=v_cot.tarifa_id AND t.organization_id=v_cot.organization_id AND t.modo=v_cot.modo::text
      AND t.estado='vigente' AND t.estado_aprobacion='vigente'
      AND (t.vigente_desde IS NULL OR t.vigente_desde<=v_fecha_operativa)
      AND (t.vigente_hasta IS NULL OR t.vigente_hasta>=v_fecha_operativa)
  ) INTO v_tarifa_vigente;
  FOR v_costo IN
    SELECT cc.concepto, cc.moneda, cc.costo_unitario AS monto_anterior,
           cc.id, cc.cantidad, cc.costeo_tarifa_id, cc.costeo_tarifa_recargo_id
    FROM public.cotizacion_costos cc
    WHERE cc.cotizacion_id=v_cot.id AND cc.organization_id=v_cot.organization_id AND cc.deleted_at IS NULL
      AND (cc.costeo_tarifa_recargo_id IS NOT NULL OR cc.costeo_tarifa_id IS NOT NULL)
    ORDER BY cc.id
  LOOP
    IF v_costo.costeo_tarifa_recargo_id IS NOT NULL THEN
      SELECT monto INTO v_monto_actual FROM public.costeo_tarifa_recargos
       WHERE id=v_costo.costeo_tarifa_recargo_id AND organization_id=v_cot.organization_id;
    ELSE
      v_monto_actual := public._flete_unitario_revalidacion(
        v_costo.costeo_tarifa_id, v_cot.organization_id, v_cot.peso_kg, v_cot.volumen_m3, v_costo.cantidad);
    END IF;
    v_filas_snapshot := v_filas_snapshot || jsonb_build_object(
      'cotizacion_costo_id', v_costo.id, 'tarifa_id', v_costo.costeo_tarifa_id,
      'recargo_id', v_costo.costeo_tarifa_recargo_id, 'cantidad', v_costo.cantidad,
      'moneda', v_costo.moneda, 'monto_actual', v_monto_actual);
    IF v_monto_actual IS NULL THEN
      v_cambios := v_cambios || jsonb_build_object(
        'concepto',v_costo.concepto,'moneda',v_costo.moneda,
        'monto_anterior',v_costo.monto_anterior,'monto_actual',NULL,
        'delta_abs',NULL,'delta_pct',NULL,'motivo','eliminado');
      v_max_delta_pct := 100;
      CONTINUE;
    END IF;
    v_delta_abs := v_monto_actual - v_costo.monto_anterior;
    v_delta_pct := CASE WHEN v_costo.monto_anterior=0
                     THEN CASE WHEN v_delta_abs=0 THEN 0 ELSE 100 END
                     ELSE ROUND(ABS(v_delta_abs)/v_costo.monto_anterior*100,2) END;
    IF ABS(v_delta_abs) > 0.001 THEN
      v_cambios := v_cambios || jsonb_build_object(
        'concepto',v_costo.concepto,'moneda',v_costo.moneda,
        'monto_anterior',v_costo.monto_anterior,'monto_actual',v_monto_actual,
        'delta_abs',v_delta_abs,'delta_pct',v_delta_pct);
      IF v_delta_pct > v_max_delta_pct THEN v_max_delta_pct := v_delta_pct; END IF;
    END IF;
  END LOOP;

  -- Huella económica canónica: identifica cada costo fuente y su importe
  -- vigente. A diferencia del máximo porcentual, detecta cualquier cambio de
  -- composición o importe aunque el porcentaje agregado coincida.
  v_snapshot := jsonb_build_object('tarifa_vigente', v_tarifa_vigente, 'filas', v_filas_snapshot);
  IF NOT v_tarifa_vigente AND v_bloquea_vencida THEN v_severidad := 'bloqueante';
  ELSIF jsonb_array_length(v_cambios)=0 AND v_tarifa_vigente THEN v_severidad := 'sin_cambios';
  ELSIF v_max_delta_pct > v_umbral_pct THEN v_severidad := 'bloqueante';
  ELSE v_severidad := 'informativa';
  END IF;

  -- R201-COT-02: la re-aprobación de ventas consume el bloqueo, pero SÓLO si
  -- corresponde al mismo delta que ventas autorizó.
  IF v_severidad = 'bloqueante' AND v_cot.estado_revalidacion = 'reaprobada' THEN
    v_snapshot_aprob := v_cot.revalidacion_delta_jsonb->'snapshot_economico';
    IF v_snapshot_aprob IS NOT NULL AND v_snapshot_aprob = v_snapshot THEN
      v_severidad := 'informativa';
      v_reaprob_vigente := TRUE;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'tarifa_vigente',v_tarifa_vigente,'agente_sin_cupo',FALSE,'severidad',v_severidad,
    'cambios',v_cambios,'umbral_pct',v_umbral_pct,'max_delta_pct',v_max_delta_pct,
    'estado_revalidacion',v_cot.estado_revalidacion,
    'reaprobacion_vigente',v_reaprob_vigente,
    'snapshot_economico',v_snapshot,
    'motivo',CASE WHEN v_reaprob_vigente THEN 'reaprobada_por_ventas' ELSE NULL END,
    'tarifa_id_vigente',CASE WHEN v_tarifa_vigente THEN v_cot.tarifa_id ELSE NULL END);
END;
$function$;

REVOKE ALL ON FUNCTION public.revalidar_tarifa_cotizacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revalidar_tarifa_cotizacion(uuid) TO authenticated, service_role;

--> statement-breakpoint

-- supabase/schema/crm/crm_aplicar_tarifa_tarifario.sql
-- Canonical mirror; apply the registered forward migration, not this file.
CREATE OR REPLACE FUNCTION public.crm_aplicar_tarifa_tarifario(p_solicitud_id uuid, p_tarifa_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v record;
  t record;
  v_pedido text;
  v_tipo_code text;
  v_tipo_name text;
  v_compatible boolean;
  v_fecha_carga date;
BEGIN
  SELECT * INTO v FROM public.crm_solicitudes_pricing
   WHERE id = p_solicitud_id AND deleted_at IS NULL FOR UPDATE;
  IF v.id IS NULL OR v.organization_id IS DISTINCT FROM public.org_scope() THEN
    RAISE EXCEPTION 'LC_PRICING_NO_ENCONTRADA' USING ERRCODE = 'P0001';
  END IF;
  IF v.solicitante_id IS DISTINCT FROM auth.uid() AND v.created_by IS DISTINCT FROM auth.uid()
     AND NOT public._crm_es_pricing(v.organization_id) THEN
    RAISE EXCEPTION 'LC_PRICING_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;

  -- The form persists tipo_carga. container_size is a legacy fallback only.
  v_pedido := coalesce(
    nullif(regexp_replace(v.tipo_carga, '^\s+|\s+$', '', 'g'), ''),
    nullif(regexp_replace(v.container_size, '^\s+|\s+$', '', 'g'), ''));
  IF v_pedido IS NULL THEN
    RAISE EXCEPTION 'LC_PRICING_CONTENEDOR_REQUERIDO' USING ERRCODE = 'P0001';
  END IF;
  SELECT tc.code, tc.name INTO v_tipo_code, v_tipo_name
    FROM public.costeo_tarifas ct
    JOIN public.tipos_contenedor tc ON tc.id = ct.tipo_contenedor_id
   WHERE ct.id = p_tarifa_id AND ct.organization_id = v.organization_id
   FOR SHARE OF ct, tc;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LC_TARIFA_NO_VIGENTE' USING ERRCODE = 'P0001';
  END IF;

  -- Mirror claveCanonicaTipoContenedor without adding a public helper or ACL.
  -- A full semantic key accepts aliases, but never substitutes dry for HC.
  -- Raw keys preserve the shared helper's normalized-name-first priority.
  -- Conflicting known code/name size or category and empty raw keys fail closed.
  WITH entradas AS (
    SELECT 'pedido'::text AS fuente, v_pedido AS nombre, ''::text AS codigo
    UNION ALL
    SELECT 'tarifa', v_tipo_name, v_tipo_code
    UNION ALL
    SELECT 'tarifa_codigo', '', v_tipo_code
    UNION ALL
    SELECT 'tarifa_nombre', v_tipo_name, ''
  ), normalizados AS (
    SELECT fuente,
      btrim(regexp_replace(lower(regexp_replace(normalize(coalesce(nombre, ''), NFD),
        U&'[\0300-\036f]', '', 'g')), '[^a-z0-9]+', ' ', 'g')) AS nombre,
      btrim(regexp_replace(lower(regexp_replace(normalize(coalesce(codigo, ''), NFD),
        U&'[\0300-\036f]', '', 'g')), '[^a-z0-9]+', ' ', 'g')) AS codigo
    FROM entradas
  ), separados AS (
    SELECT *, regexp_replace(regexp_replace(btrim(nombre || ' ' || codigo),
      '([0-9]+)([a-z]+)', '\1 \2', 'g'), '([a-z]+)([0-9]+)', '\1 \2', 'g') AS texto
    FROM normalizados
  ), categorias AS (
    SELECT *, (regexp_match(texto, '\m(20|40|45|53)\M'))[1] AS tamano,
      CASE
        WHEN texto ~ '\m(reefer|refrigerad[[:alnum:]_]*|rf)\M' THEN 'reefer'
        WHEN texto ~ '\m(high cube|highcube|hc|hq)\M' THEN 'hc'
        WHEN texto ~ '\m(open top|opentop|ot)\M' THEN 'opentop'
        WHEN texto ~ '\m(flat rack|flatrack|fr)\M' THEN 'flatrack'
        WHEN texto ~ '\m(iso tank|tank|tanque)\M' THEN 'tank'
        WHEN texto ~ '\m(platform|plataforma)\M' THEN 'platform'
        WHEN texto ~ '\m(dry|standard|std|estandar|st|dv|gp)\M' THEN 'dry'
      END AS categoria
    FROM separados
  ), claves AS (
    SELECT *, CASE WHEN tamano IS NOT NULL AND categoria IS NOT NULL
      THEN tamano || '|' || categoria
      ELSE 'raw:' || coalesce(nullif(nombre, ''), codigo) END AS clave
    FROM categorias
  )
  SELECT pedido.clave = tarifa.clave
    AND pedido.clave <> 'raw:' AND tarifa.clave <> 'raw:'
    AND NOT (codigo.tamano IS NOT NULL AND nombre.tamano IS NOT NULL
      AND codigo.tamano <> nombre.tamano)
    AND NOT (codigo.categoria IS NOT NULL AND nombre.categoria IS NOT NULL
      AND codigo.categoria <> nombre.categoria)
    INTO v_compatible
    FROM claves pedido CROSS JOIN claves tarifa
    CROSS JOIN claves codigo CROSS JOIN claves nombre
   WHERE pedido.fuente = 'pedido' AND tarifa.fuente = 'tarifa'
     AND codigo.fuente = 'tarifa_codigo' AND nombre.fuente = 'tarifa_nombre';
  IF v_compatible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'LC_TARIFA_CONTENEDOR_INCOMPATIBLE' USING ERRCODE = 'P0001';
  END IF;

  -- Recheck compatibility even for an idempotent call, without rewriting history.
  IF v.estado = 'respondida' AND v.tarifa_tarifario_id = p_tarifa_id THEN
    RETURN jsonb_build_object('id', v.id, 'ya_respondida', true);
  END IF;
  IF v.estado NOT IN ('borrador','enviada','asignada','en_proceso','info_requerida') THEN
    RAISE EXCEPTION 'LC_PRICING_ESTADO_INVALIDO' USING ERRCODE = 'P0001';
  END IF;
  v_fecha_carga := greatest(public.fecha_negocio_mx(), v.fecha_tentativa_carga);
  SELECT * INTO t FROM public.costeo_tarifas
   WHERE id = p_tarifa_id AND organization_id = v.organization_id AND estado = 'vigente'
     AND (vigente_desde IS NULL OR vigente_desde <= v_fecha_carga)
     AND (vigente_hasta IS NULL OR vigente_hasta >= v_fecha_carga);
  IF t.id IS NULL THEN RAISE EXCEPTION 'LC_TARIFA_NO_VIGENTE' USING ERRCODE = 'P0001'; END IF;
  PERFORM set_config('lc.pricing_rpc', '1', true);
  UPDATE public.crm_solicitudes_pricing
     SET tarifa_tarifario_id = p_tarifa_id, estado = 'respondida',
         enviada_at = coalesce(enviada_at, now()), respondida_at = now()
   WHERE id = p_solicitud_id;
  PERFORM set_config('lc.pricing_rpc', '', true);
  RETURN jsonb_build_object('id', v.id, 'ya_respondida', false);
END $$;

-- Reaffirm only the grants already proven above; never manufacture access.
REVOKE ALL ON FUNCTION public.crm_aplicar_tarifa_tarifario(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_aplicar_tarifa_tarifario(uuid,uuid) TO authenticated, service_role;

--> statement-breakpoint

-- supabase/schema/crm/crm_crear_oportunidad_con_empresa.sql
CREATE OR REPLACE FUNCTION public.crm_crear_oportunidad_con_empresa(p_empresa_id uuid, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.org_scope();
  v_datos public.crm_oportunidades%ROWTYPE;
  v_id uuid;
  v_cliente_empresa uuid;
  v_request_id uuid;
  v_intento jsonb;
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'Selecciona una organización e inicia sesión' USING ERRCODE = '42501';
  END IF;
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona la empresa asociada' USING ERRCODE = '22023';
  END IF;
  IF p_datos IS NULL OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Los datos de la oportunidad no son válidos' USING ERRCODE = '22023';
  END IF;
  SELECT cliente_id INTO v_cliente_empresa FROM public.crm_empresas
    WHERE id = p_empresa_id AND organization_id = v_org AND deleted_at IS NULL
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La empresa no está disponible en esta organización' USING ERRCODE = '42501';
  END IF;
  v_request_id := NULLIF(p_datos->>'request_id', '')::uuid;
  v_intento := jsonb_build_array(v_org, p_empresa_id, p_datos - 'request_id');
  v_resultado := public.idempotency_claim(v_request_id, 'crm_crear_oportunidad_con_empresa');
  IF v_resultado IS NOT NULL THEN
    IF v_resultado->'intento' IS DISTINCT FROM v_intento THEN
      RAISE EXCEPTION 'LC_OPORTUNIDAD_INTENTO_DISTINTO: revisa si el intento previo ya creó la oportunidad antes de cambiar sus datos'
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.crm_oportunidades
      WHERE id = (v_resultado->>'id')::uuid AND organization_id = v_org AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'La oportunidad del intento previo ya no está disponible' USING ERRCODE = '42501';
    END IF;
    RETURN v_resultado - 'intento';
  END IF;
  SELECT * INTO v_datos FROM jsonb_populate_record(NULL::public.crm_oportunidades, p_datos);
  -- La empresa puede haberse convertido mientras el formulario estaba abierto.
  -- El lock conserva esa identidad hasta terminar ambos INSERTs.
  IF v_cliente_empresa IS NOT NULL AND (
    v_datos.cliente_id IS DISTINCT FROM v_cliente_empresa OR v_datos.lead_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'El origen debe ser el cliente asociado a la empresa, sin prospecto'
      USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(v_datos.nombre), '') IS NULL THEN
    RAISE EXCEPTION 'Nombre es obligatorio' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.crm_oportunidades (
    organization_id, nombre, cliente_id, cliente_nombre, lead_id, vendedor_id, vendedor_email,
    etapa_id, monto_estimado, moneda, probabilidad, fecha_estimada_cierre, fecha_cierre_real,
    valor_real, modo, tipo_carga, origen, destino, notas, created_by,
    monto_meta, fecha_meta_cierre, compromiso_nota, margen_pct, riesgos_objeciones,
    puerto_origen_id, puerto_destino_id
  ) VALUES (
    v_org, v_datos.nombre, v_datos.cliente_id, coalesce(v_datos.cliente_nombre, ''), v_datos.lead_id,
    coalesce(v_datos.vendedor_id, auth.uid()), coalesce(v_datos.vendedor_email, ''),
    v_datos.etapa_id, coalesce(v_datos.monto_estimado, 0), coalesce(v_datos.moneda, 'MXN'),
    coalesce(v_datos.probabilidad, 0), v_datos.fecha_estimada_cierre, v_datos.fecha_cierre_real,
    v_datos.valor_real, coalesce(v_datos.modo, ''), coalesce(v_datos.tipo_carga, ''),
    coalesce(v_datos.origen, ''), coalesce(v_datos.destino, ''), coalesce(v_datos.notas, ''), auth.uid(),
    v_datos.monto_meta, v_datos.fecha_meta_cierre, v_datos.compromiso_nota, v_datos.margen_pct,
    coalesce(v_datos.riesgos_objeciones, ''), v_datos.puerto_origen_id, v_datos.puerto_destino_id
  ) RETURNING id INTO v_id;
  INSERT INTO public.crm_oportunidad_empresa (organization_id, oportunidad_id, empresa_id)
    VALUES (v_org, v_id, p_empresa_id);
  PERFORM public.idempotency_store(v_request_id, jsonb_build_object('id', v_id, 'intento', v_intento));
  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.crm_crear_oportunidad_con_empresa(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_crear_oportunidad_con_empresa(uuid, jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.crm_crear_oportunidad_con_empresa(uuid, jsonb) IS 'Alta manual atómica de oportunidad y empresa activa de la misma organización; SECURITY INVOKER conserva las políticas RLS y los guards existentes. No modifica oportunidades históricas.';

--> statement-breakpoint

-- supabase/schema/crm/crm_vincular_cotizacion_cliente_pricing.sql
-- LOCAL REVIEW CANDIDATE. New RPC has NO application EXECUTE grant.
-- Base 5f8270a629d67d132356d5e00247e629e51de7dc. Do not apply remotely yet.
CREATE OR REPLACE FUNCTION public.crm_vincular_cotizacion_cliente_pricing(
  p_cotizacion_id uuid, p_oportunidad_id uuid, p_solicitud_id uuid, p_tarifa_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_c public.cotizaciones%ROWTYPE;
  v_o public.crm_oportunidades%ROWTYPE;
  v_s public.crm_solicitudes_pricing%ROWTYPE;
  v_t public.costeo_tarifas%ROWTYPE;
  v_e public.crm_etapas_pipeline%ROWTYPE;
  v_catalog jsonb;
  v_updated_at timestamptz;
  v_historical boolean;
  v_fecha_carga date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'LC_SIN_SESION' USING ERRCODE='42501';
  END IF;
  IF p_cotizacion_id IS NULL OR p_oportunidad_id IS NULL OR p_solicitud_id IS NULL OR p_tarifa_id IS NULL THEN
    RAISE EXCEPTION 'LC_PRICING_ORIGEN_INCOMPLETO' USING ERRCODE='22023';
  END IF;

  -- Policies and authorization helper bodies are pinned to reviewed 5f8270a.
  -- Changes fail closed; regenerate/review with RLS equivalence tests before upgrade.
  SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) INTO v_catalog
    FROM pg_catalog.pg_policies p WHERE schemaname='public'
    AND tablename IN ('clientes','costeo_agentes','costeo_tarifas','cotizaciones','crm_etapas_pipeline','crm_oportunidades','crm_solicitudes_pricing','organization_members');
  IF v_catalog IS DISTINCT FROM $policies$[{"cmd":"DELETE","qual":"(((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND es_admin_catalogo(( SELECT auth.uid() AS uid)))","roles":["authenticated"],"tablename":"clientes","permissive":"PERMISSIVE","policyname":"Admin catalog delete clientes","schemaname":"public","with_check":null},{"cmd":"SELECT","qual":"(( SELECT has_role(( SELECT auth.uid() AS uid), 'cliente'::app_role) AS has_role) AND (id IN ( SELECT current_user_client_ids() AS current_user_client_ids)))","roles":["authenticated"],"tablename":"clientes","permissive":"PERMISSIVE","policyname":"Cliente read own clientes","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))","roles":["authenticated"],"tablename":"clientes","permissive":"RESTRICTIVE","policyname":"Scope tenant activo super admin","schemaname":"public","with_check":"((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))"},{"cmd":"SELECT","qual":"(((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND (NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'cliente'::app_role) AS has_role)))","roles":["authenticated"],"tablename":"clientes","permissive":"PERMISSIVE","policyname":"Tenant read clientes","schemaname":"public","with_check":null},{"cmd":"UPDATE","qual":"(((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND (( SELECT has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'admin_org'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'operador'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'contador'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)))","roles":["authenticated"],"tablename":"clientes","permissive":"PERMISSIVE","policyname":"Tenant update clientes","schemaname":"public","with_check":"(((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND (( SELECT has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'admin_org'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'operador'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'contador'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)))"},{"cmd":"SELECT","qual":"(((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND ( SELECT has_role(( SELECT auth.uid() AS uid), 'viewer'::app_role) AS has_role))","roles":["authenticated"],"tablename":"clientes","permissive":"PERMISSIVE","policyname":"Tenant viewer clientes","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))","roles":["authenticated"],"tablename":"costeo_agentes","permissive":"RESTRICTIVE","policyname":"Scope tenant activo super admin","schemaname":"public","with_check":"((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))"},{"cmd":"SELECT","qual":"(EXISTS ( SELECT 1\n   FROM organization_members m\n  WHERE ((m.organization_id = costeo_agentes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))","roles":["authenticated"],"tablename":"costeo_agentes","permissive":"PERMISSIVE","policyname":"costeo_agentes_select_org","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"((EXISTS ( SELECT 1\n   FROM organization_members m\n  WHERE ((m.organization_id = costeo_agentes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.role)::text = ANY (ARRAY['admin'::text, 'admin_org'::text, 'gerente_operaciones'::text, 'ejecutivo_pricing'::text, 'operador'::text, 'coordinador_logistico'::text]))))) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role))","roles":["public"],"tablename":"costeo_agentes","permissive":"PERMISSIVE","policyname":"costeo_agentes_write_org","schemaname":"public","with_check":"((EXISTS ( SELECT 1\n   FROM organization_members m\n  WHERE ((m.organization_id = costeo_agentes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.role)::text = ANY (ARRAY['admin'::text, 'admin_org'::text, 'gerente_operaciones'::text, 'ejecutivo_pricing'::text, 'operador'::text, 'coordinador_logistico'::text]))))) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role))"},{"cmd":"DELETE","qual":"((NOT has_role(( SELECT auth.uid() AS uid), 'agente_carga'::app_role)) OR (estado_aprobacion = ANY (ARRAY['borrador'::text, 'rechazada'::text])))","roles":["authenticated"],"tablename":"costeo_tarifas","permissive":"RESTRICTIVE","policyname":"Agente borra solo tarifas no aprobadas","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"(has_role(( SELECT auth.uid() AS uid), 'agente_carga'::app_role) AND (agente_id = current_agente_id()) AND (organization_id = current_agente_org()))","roles":["authenticated"],"tablename":"costeo_tarifas","permissive":"PERMISSIVE","policyname":"Agente escribe own tarifas","schemaname":"public","with_check":"(has_role(( SELECT auth.uid() AS uid), 'agente_carga'::app_role) AND (agente_id = current_agente_id()) AND (organization_id = current_agente_org()) AND (estado_aprobacion = ANY (ARRAY['borrador'::text, 'rechazada'::text])))"},{"cmd":"ALL","qual":"((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))","roles":["authenticated"],"tablename":"costeo_tarifas","permissive":"RESTRICTIVE","policyname":"Scope tenant activo super admin","schemaname":"public","with_check":"((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))"},{"cmd":"SELECT","qual":"(EXISTS ( SELECT 1\n   FROM organization_members m\n  WHERE ((m.organization_id = costeo_tarifas.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))","roles":["authenticated"],"tablename":"costeo_tarifas","permissive":"PERMISSIVE","policyname":"costeo_tarifas_select_org","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"((EXISTS ( SELECT 1\n   FROM organization_members m\n  WHERE ((m.organization_id = costeo_tarifas.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.role)::text = ANY (ARRAY['admin'::text, 'admin_org'::text, 'gerente_operaciones'::text, 'ejecutivo_pricing'::text, 'operador'::text, 'coordinador_logistico'::text]))))) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role))","roles":["public"],"tablename":"costeo_tarifas","permissive":"PERMISSIVE","policyname":"costeo_tarifas_write_org","schemaname":"public","with_check":"((EXISTS ( SELECT 1\n   FROM organization_members m\n  WHERE ((m.organization_id = costeo_tarifas.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.role)::text = ANY (ARRAY['admin'::text, 'admin_org'::text, 'gerente_operaciones'::text, 'ejecutivo_pricing'::text, 'operador'::text, 'coordinador_logistico'::text]))))) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role))"},{"cmd":"SELECT","qual":"((deleted_at IS NULL) AND has_role(auth.uid(), 'cliente'::app_role) AND (cliente_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)))","roles":["authenticated"],"tablename":"cotizaciones","permissive":"PERMISSIVE","policyname":"Cliente read own cotizaciones","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))","roles":["authenticated"],"tablename":"cotizaciones","permissive":"RESTRICTIVE","policyname":"Scope tenant activo super admin","schemaname":"public","with_check":"((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))"},{"cmd":"ALL","qual":"(((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND ( SELECT puede_escribir_cotizaciones(( SELECT auth.uid() AS uid)) AS puede_escribir_cotizaciones))","roles":["authenticated"],"tablename":"cotizaciones","permissive":"PERMISSIVE","policyname":"Tenant CRUD cotizaciones","schemaname":"public","with_check":"(((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND ( SELECT puede_escribir_cotizaciones(( SELECT auth.uid() AS uid)) AS puede_escribir_cotizaciones))"},{"cmd":"SELECT","qual":"(((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND ( SELECT has_role(( SELECT auth.uid() AS uid), 'viewer'::app_role) AS has_role))","roles":["authenticated"],"tablename":"cotizaciones","permissive":"PERMISSIVE","policyname":"Tenant viewer cotizaciones","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))","roles":["authenticated"],"tablename":"crm_etapas_pipeline","permissive":"RESTRICTIVE","policyname":"Scope tenant activo super admin","schemaname":"public","with_check":"((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))"},{"cmd":"ALL","qual":"(((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) AND (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin_org'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gerente_comercial'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)))","roles":["authenticated"],"tablename":"crm_etapas_pipeline","permissive":"PERMISSIVE","policyname":"Tenant admin crm_etapas_pipeline","schemaname":"public","with_check":"(((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) AND (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin_org'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gerente_comercial'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)))"},{"cmd":"SELECT","qual":"((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role))","roles":["authenticated"],"tablename":"crm_etapas_pipeline","permissive":"PERMISSIVE","policyname":"Tenant read crm_etapas_pipeline","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))","roles":["authenticated"],"tablename":"crm_oportunidades","permissive":"RESTRICTIVE","policyname":"Scope tenant activo super admin","schemaname":"public","with_check":"((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))"},{"cmd":"ALL","qual":"(((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND (( SELECT has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'admin_org'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'gerente_comercial'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'operador'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)))","roles":["authenticated"],"tablename":"crm_oportunidades","permissive":"PERMISSIVE","policyname":"Staff CRUD crm_oportunidades","schemaname":"public","with_check":"(((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND (( SELECT has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'admin_org'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'gerente_comercial'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'operador'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)))"},{"cmd":"SELECT","qual":"(((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND ( SELECT has_role(( SELECT auth.uid() AS uid), 'viewer'::app_role) AS has_role))","roles":["authenticated"],"tablename":"crm_oportunidades","permissive":"PERMISSIVE","policyname":"Tenant viewer crm_oportunidades","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) AND ( SELECT has_role(( SELECT auth.uid() AS uid), 'vendedor'::app_role) AS has_role) AND (vendedor_id = ( SELECT auth.uid() AS uid)))","roles":["authenticated"],"tablename":"crm_oportunidades","permissive":"PERMISSIVE","policyname":"Vendedor own crm_oportunidades","schemaname":"public","with_check":"((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) AND ( SELECT has_role(( SELECT auth.uid() AS uid), 'vendedor'::app_role) AS has_role) AND (vendedor_id = ( SELECT auth.uid() AS uid)))"},{"cmd":"INSERT","qual":null,"roles":["authenticated"],"tablename":"crm_solicitudes_pricing","permissive":"PERMISSIVE","policyname":"crm_sol_pricing_crear","schemaname":"public","with_check":"((organization_id = org_scope()) AND (estado = 'borrador'::text))"},{"cmd":"UPDATE","qual":"((organization_id = org_scope()) AND (((estado = 'borrador'::text) AND (created_by = auth.uid())) OR _crm_es_pricing(organization_id)))","roles":["authenticated"],"tablename":"crm_solicitudes_pricing","permissive":"PERMISSIVE","policyname":"crm_sol_pricing_editar","schemaname":"public","with_check":"(organization_id = org_scope())"},{"cmd":"SELECT","qual":"(organization_id = org_scope())","roles":["authenticated"],"tablename":"crm_solicitudes_pricing","permissive":"PERMISSIVE","policyname":"crm_sol_pricing_leer","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"rls_tenant_scope_ok(organization_id)","roles":["authenticated"],"tablename":"crm_solicitudes_pricing","permissive":"RESTRICTIVE","policyname":"crm_solicitudes_pricing_tenant_restrictive","schemaname":"public","with_check":"rls_tenant_scope_ok(organization_id)"},{"cmd":"ALL","qual":"is_org_admin(( SELECT auth.uid() AS uid), organization_id)","roles":["authenticated"],"tablename":"organization_members","permissive":"PERMISSIVE","policyname":"Org admins manage own org members","schemaname":"public","with_check":"is_org_admin(( SELECT auth.uid() AS uid), organization_id)"},{"cmd":"ALL","qual":"( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)","roles":["authenticated"],"tablename":"organization_members","permissive":"PERMISSIVE","policyname":"Super admins manage members","schemaname":"public","with_check":"( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)"},{"cmd":"SELECT","qual":"((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role))","roles":["authenticated"],"tablename":"organization_members","permissive":"PERMISSIVE","policyname":"Users read own memberships","schemaname":"public","with_check":null}]$policies$::jsonb THEN
    RAISE EXCEPTION 'LC_PRICING_ACL_DRIFT' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
    'source_md5',md5(p.prosrc),'config',p.proconfig,'security_definer',p.prosecdef,
    'volatility',p.provolatile) ORDER BY p.oid::regprocedure::text) INTO v_catalog
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('_crm_es_pricing','current_agente_id','current_agente_org','current_user_client_ids','current_user_org_id','default_user_org_id','es_admin_catalogo','get_user_org_ids','has_role','is_org_admin','is_org_member','org_scope','puede_escribir_cotizaciones','rls_tenant_scope_ok','roles_jerarquia');
  IF v_catalog IS DISTINCT FROM $helpers$[{"config":["search_path=public"],"signature":"_crm_es_pricing(uuid)","source_md5":"9712ff3986b38c8c69918c3b2bfd3d9e","volatility":"s","security_definer":true},{"config":["search_path=public"],"signature":"current_agente_id()","source_md5":"e78c421a6384475f8ff90aad18e6a1ec","volatility":"s","security_definer":true},{"config":["search_path=public"],"signature":"current_agente_org()","source_md5":"e1ae96bc348feaa34313802621c837e1","volatility":"s","security_definer":true},{"config":["search_path=public"],"signature":"current_user_client_ids()","source_md5":"344c708ed02e90960553abd5219cc9b2","volatility":"s","security_definer":true},{"config":["search_path=public"],"signature":"current_user_org_id()","source_md5":"8ae92929010ad9d586e7fcc033443c92","volatility":"s","security_definer":true},{"config":["search_path=public"],"signature":"default_user_org_id()","source_md5":"86ebf4f6d06138fd93c9c201b3fde611","volatility":"s","security_definer":true},{"config":["search_path=public"],"signature":"es_admin_catalogo(uuid)","source_md5":"3dcbffcd27fdccb6514d56edbb68e62a","volatility":"s","security_definer":true},{"config":["search_path=public"],"signature":"get_user_org_ids(uuid)","source_md5":"a14933dceef9739a9e351dbdfcf4ea7c","volatility":"s","security_definer":false},{"config":["search_path=public"],"signature":"has_role(uuid,app_role)","source_md5":"978b46d0f372e2715710482b0e15247c","volatility":"s","security_definer":true},{"config":["search_path=public"],"signature":"is_org_admin(uuid,uuid)","source_md5":"c4c0810cc8a7060585fc96e20746d3b2","volatility":"s","security_definer":true},{"config":["search_path=public"],"signature":"is_org_member(uuid)","source_md5":"cb3b222b94be33a45916863643576934","volatility":"s","security_definer":true},{"config":["search_path=public"],"signature":"org_scope()","source_md5":"7c33bde220e8debd95ca9e3be3e8f30e","volatility":"s","security_definer":true},{"config":["search_path=public"],"signature":"puede_escribir_cotizaciones(uuid)","source_md5":"1c14f940ee4f07e2710b5ff45b163c2c","volatility":"s","security_definer":true},{"config":["search_path=public"],"signature":"rls_tenant_scope_ok(uuid)","source_md5":"59dddd53956cd142cb142266bbe6430c","volatility":"s","security_definer":true},{"config":["search_path=public"],"signature":"roles_jerarquia(app_role)","source_md5":"0319faa0f75b5caa86e2eef8f6df157f","volatility":"i","security_definer":false}]$helpers$::jsonb THEN
    RAISE EXCEPTION 'LC_PRICING_ACL_DRIFT' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('clientes','costeo_agentes','costeo_tarifas','cotizaciones','crm_etapas_pipeline','crm_oportunidades','crm_solicitudes_pricing','organization_members')
      AND (NOT c.relrowsecurity OR NOT has_table_privilege('authenticated',c.oid,'SELECT')))
     OR NOT has_table_privilege('authenticated','public.cotizaciones','UPDATE')
     OR NOT has_table_privilege('authenticated','public.crm_oportunidades','UPDATE') THEN
    RAISE EXCEPTION 'LC_PRICING_ACL_DRIFT' USING ERRCODE='42501';
  END IF;

  -- Generated exact SELECT + UPDATE USING + UPDATE WITH CHECK policy predicates.
  SELECT * INTO v_c FROM public.cotizaciones
    WHERE id=p_cotizacion_id AND deleted_at IS NULL
      AND (((((deleted_at IS NULL) AND has_role(auth.uid(), 'cliente'::app_role) AND (cliente_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)))) OR ((((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND ( SELECT puede_escribir_cotizaciones(( SELECT auth.uid() AS uid)) AS puede_escribir_cotizaciones))) OR ((((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND ( SELECT has_role(( SELECT auth.uid() AS uid), 'viewer'::app_role) AS has_role)))) AND (((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id)))) AND ((((((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND ( SELECT puede_escribir_cotizaciones(( SELECT auth.uid() AS uid)) AS puede_escribir_cotizaciones)))) AND (((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))))
      AND ((((((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND ( SELECT puede_escribir_cotizaciones(( SELECT auth.uid() AS uid)) AS puede_escribir_cotizaciones)))) AND (((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))))
    FOR UPDATE;
  IF NOT FOUND OR NOT public.is_org_member(v_c.organization_id)
    OR NOT public.rls_tenant_scope_ok(v_c.organization_id)
    OR v_c.organization_id IS DISTINCT FROM public.org_scope()
    OR NOT public.puede_escribir_cotizaciones() THEN
    RAISE EXCEPTION 'LC_PRICING_ORIGEN_NO_AUTORIZADO' USING ERRCODE='42501';
  END IF;
  IF v_c.cliente_id IS NULL OR v_c.es_prospecto IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'LC_PRICING_REQUIERE_CLIENTE' USING ERRCODE='22023';
  END IF;
  -- Cotización then opportunity follows quote→CRM triggers. Request then tariff
  -- follows crm_aplicar_tarifa_tarifario. Row locks recheck data after waits.
  SELECT * INTO v_o FROM public.crm_oportunidades
    WHERE id=p_oportunidad_id AND organization_id=v_c.organization_id AND deleted_at IS NULL
      AND ((((((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND (( SELECT has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'admin_org'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'gerente_comercial'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'operador'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)))) OR ((((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND ( SELECT has_role(( SELECT auth.uid() AS uid), 'viewer'::app_role) AS has_role))) OR (((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) AND ( SELECT has_role(( SELECT auth.uid() AS uid), 'vendedor'::app_role) AS has_role) AND (vendedor_id = ( SELECT auth.uid() AS uid))))) AND (((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id)))) AND ((((((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND (( SELECT has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'admin_org'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'gerente_comercial'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'operador'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)))) OR (((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) AND ( SELECT has_role(( SELECT auth.uid() AS uid), 'vendedor'::app_role) AS has_role) AND (vendedor_id = ( SELECT auth.uid() AS uid))))) AND (((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))))
      AND ((((((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND (( SELECT has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'admin_org'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'gerente_comercial'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'operador'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)))) OR (((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) AND ( SELECT has_role(( SELECT auth.uid() AS uid), 'vendedor'::app_role) AS has_role) AND (vendedor_id = ( SELECT auth.uid() AS uid))))) AND (((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id))))
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LC_PRICING_ORIGEN_NO_AUTORIZADO' USING ERRCODE='42501';
  END IF;
  IF v_o.cliente_id IS DISTINCT FROM v_c.cliente_id THEN
    RAISE EXCEPTION 'LC_PRICING_CLIENTE_INCOMPATIBLE' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.clientes WHERE id=v_c.cliente_id AND organization_id=v_c.organization_id
    AND deleted_at IS NULL AND ((((( SELECT has_role(( SELECT auth.uid() AS uid), 'cliente'::app_role) AS has_role) AND (id IN ( SELECT current_user_client_ids() AS current_user_client_ids)))) OR ((((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND (NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'cliente'::app_role) AS has_role)))) OR ((((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) AND ( SELECT has_role(( SELECT auth.uid() AS uid), 'viewer'::app_role) AS has_role)))) AND (((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id)))) FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LC_PRICING_ORIGEN_NO_AUTORIZADO' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.crm_solicitudes_pricing
    WHERE id=p_solicitud_id AND organization_id=v_c.organization_id AND deleted_at IS NULL
      AND ((((organization_id = org_scope()))) AND (rls_tenant_scope_ok(organization_id))) FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LC_PRICING_ORIGEN_NO_AUTORIZADO' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_t FROM public.costeo_tarifas
    WHERE id=p_tarifa_id AND organization_id=v_c.organization_id
      AND ((((has_role(( SELECT auth.uid() AS uid), 'agente_carga'::app_role) AND (agente_id = current_agente_id()) AND (organization_id = current_agente_org()))) OR ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = costeo_tarifas.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))) OR (((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = costeo_tarifas.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.role)::text = ANY (ARRAY['admin'::text, 'admin_org'::text, 'gerente_operaciones'::text, 'ejecutivo_pricing'::text, 'operador'::text, 'coordinador_logistico'::text]))))) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)))) AND (((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id)))) FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LC_PRICING_ORIGEN_NO_AUTORIZADO' USING ERRCODE='42501';
  END IF;
  IF v_s.oportunidad_id IS DISTINCT FROM v_o.id
    OR (v_s.tarifa_tarifario_id IS DISTINCT FROM v_t.id AND v_t.solicitud_pricing_id IS DISTINCT FROM v_s.id)
    OR v_c.tarifa_id IS DISTINCT FROM v_t.id THEN
    RAISE EXCEPTION 'LC_PRICING_ORIGEN_INCOMPATIBLE' USING ERRCODE='22023';
  END IF;
  v_historical := v_c.pricing_solicitud_id IS NOT NULL;
  IF v_c.oportunidad_id IS NOT NULL OR v_historical THEN
    IF v_c.oportunidad_id IS DISTINCT FROM v_o.id OR v_c.pricing_solicitud_id IS DISTINCT FROM v_s.id THEN
      RAISE EXCEPTION 'LC_COT_VINCULO_CONFIRMADO' USING ERRCODE='22023';
    END IF;
    -- Historical acknowledgement, NOT a fresh offer or eligibility certificate.
    RETURN jsonb_build_object('oportunidad_id',v_o.id,'cliente_id',v_c.cliente_id,
      'solicitud_id',v_s.id,'tarifa_id',v_t.id,'updated_at',v_c.updated_at,'ya_ligada',true);
  END IF;
  IF v_c.estado NOT IN ('Borrador','Solicitada') OR v_c.embarque_id IS NOT NULL THEN
    RAISE EXCEPTION 'LC_PRICING_COTIZACION_NO_EDITABLE' USING ERRCODE='22023';
  END IF;
  IF v_s.estado IS DISTINCT FROM 'respondida' THEN
    RAISE EXCEPTION 'LC_PRICING_SOLICITUD_NO_RESPONDIDA' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_e FROM public.crm_etapas_pipeline
    WHERE id=v_o.etapa_id AND organization_id=v_c.organization_id AND deleted_at IS NULL
      AND ((((((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) AND (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin_org'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gerente_comercial'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)))) OR (((organization_id = ( SELECT current_user_org_id() AS current_user_org_id)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)))) AND (((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id)))) FOR SHARE;
  IF NOT FOUND OR v_e.activa IS DISTINCT FROM true OR v_e.tipo IS DISTINCT FROM 'abierta'::public.crm_etapa_tipo THEN
    RAISE EXCEPTION 'LC_PRICING_OPORTUNIDAD_NO_ELEGIBLE' USING ERRCODE='22023';
  END IF;
  IF v_o.moneda IS DISTINCT FROM v_c.moneda::text THEN
    RAISE EXCEPTION 'LC_CRM_MONEDA_INCOMPATIBLE' USING ERRCODE='22023';
  END IF;
  -- La nueva vinculación comparte la ventana inclusiva de la solicitud.
  v_fecha_carga := greatest(public.fecha_negocio_mx(), v_s.fecha_tentativa_carga);
  IF v_t.estado IS DISTINCT FROM 'vigente' OR v_t.estado_aprobacion IS DISTINCT FROM 'vigente'
    OR (v_t.vigente_desde IS NOT NULL AND v_t.vigente_desde > v_fecha_carga)
    OR (v_t.vigente_hasta IS NOT NULL AND v_t.vigente_hasta < v_fecha_carga) THEN
    RAISE EXCEPTION 'LC_TARIFA_NO_VIGENTE' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.costeo_agentes WHERE id=v_t.agente_id
    AND organization_id=v_c.organization_id AND activo IS TRUE
    AND ((((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = costeo_agentes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))) OR (((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = costeo_agentes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND ((m.role)::text = ANY (ARRAY['admin'::text, 'admin_org'::text, 'gerente_operaciones'::text, 'ejecutivo_pricing'::text, 'operador'::text, 'coordinador_logistico'::text]))))) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)))) AND (((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)) OR rls_tenant_scope_ok(organization_id)))) FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LC_TARIFA_NO_VIGENTE' USING ERRCODE='22023';
  END IF;
  UPDATE public.cotizaciones SET oportunidad_id=v_o.id, pricing_solicitud_id=v_s.id, updated_at=now()
    WHERE id=v_c.id RETURNING updated_at INTO v_updated_at;
  RETURN jsonb_build_object('oportunidad_id',v_o.id,'cliente_id',v_c.cliente_id,
    'solicitud_id',v_s.id,'tarifa_id',v_t.id,'updated_at',v_updated_at,'ya_ligada',false);
END;
$function$;
ALTER FUNCTION public.crm_vincular_cotizacion_cliente_pricing(uuid,uuid,uuid,uuid) OWNER TO postgres;
-- Conservar los permisos de ejecución revisados del catálogo en cada entorno.

--> statement-breakpoint

-- supabase/schema/cxp/_asegurar_movimiento_pago_proveedor.sql
-- Fuente canónica. Espejo 1:1 de la migración 20260907013703 (fix Sentry
-- JAVASCRIPT-REACT-65/66: ON CONFLICT alineado al índice parcial vivo).
-- Al modificar: edita ESTE archivo y genera la migración con el mismo cuerpo.

CREATE OR REPLACE FUNCTION public._asegurar_movimiento_pago_proveedor(p_pago_id uuid) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_pago       public.pagos_proveedor;
  v_cuenta_mon text;
  v_cuenta_org uuid;
  v_cuenta_act boolean;
  v_cargo      numeric;
  v_concepto   text;
  v_mov_id     uuid;
BEGIN
  SELECT * INTO v_pago
    FROM public.pagos_proveedor
   WHERE id = p_pago_id AND deleted_at IS NULL
   FOR UPDATE;
  IF v_pago.id IS NULL THEN
    RAISE EXCEPTION 'LC_MOVIMIENTO_PAGO_INEXISTENTE: el pago de proveedor no existe o está eliminado' USING ERRCODE = 'P0001';
  END IF;
  -- AUD99/121: rechazar antes de reutilizar históricos o generar efectivo.
  IF v_pago.es_ajuste THEN
    RAISE EXCEPTION 'LC_MOVIMIENTO_AJUSTE_NO_MONETARIO: un ajuste no monetario no puede generar ni reutilizar un movimiento bancario'
      USING ERRCODE = 'P0001';
  END IF;

  -- Auditoría 23: antes de cualquier lookup/INSERT por pago, reconocer la
  -- aplicación y reutilizar su origen. Nunca reparar un vínculo con dinero.
  IF v_pago.es_anticipo_aplicado
     OR EXISTS (SELECT 1 FROM public.anticipos_aplicaciones aa
                WHERE aa.pago_proveedor_id = p_pago_id AND aa.deleted_at IS NULL) THEN
    RETURN public._movimiento_original_anticipo_aplicado(p_pago_id);
  END IF;
  IF v_pago.lote_id IS NOT NULL THEN
    SELECT id INTO v_mov_id
    FROM public.bbva_movimientos
    WHERE pago_proveedor_lote_id = v_pago.lote_id
      AND organization_id = v_pago.organization_id AND deleted_at IS NULL
    ORDER BY id LIMIT 1;
    IF v_mov_id IS NULL AND v_pago.cuenta_bancaria_id IS NOT NULL THEN
      RAISE EXCEPTION 'LC_PAGO_LOTE_REVISAR: revisa el movimiento del lote completo'
        USING ERRCODE = '23514';
    END IF;
    RETURN v_mov_id;
  END IF;
  IF lower(btrim(v_pago.metodo_pago)) = 'efectivo' THEN
    RETURN NULL;
  END IF;
  SELECT id INTO v_mov_id
    FROM public.bbva_movimientos
   WHERE pago_proveedor_id = p_pago_id AND deleted_at IS NULL
   LIMIT 1;
  IF v_mov_id IS NOT NULL THEN
    RETURN v_mov_id;
  END IF;
  IF v_pago.cuenta_bancaria_id IS NULL THEN
    RETURN NULL; -- pago sin cuenta bancaria: no hay salida de efectivo que registrar
  END IF;
  -- N8: defensa en profundidad. La cuenta del movimiento debe existir, estar
  -- activa y ser de la misma organización del pago.
  SELECT moneda::text, organization_id, activa
    INTO v_cuenta_mon, v_cuenta_org, v_cuenta_act
    FROM public.cuentas_bancarias
   WHERE id = v_pago.cuenta_bancaria_id AND deleted_at IS NULL;
  IF v_cuenta_mon IS NULL THEN
    RAISE EXCEPTION 'LC_MOVIMIENTO_SIN_CUENTA: la cuenta bancaria del pago no existe o está dada de baja' USING ERRCODE = 'P0001';
  END IF;
  IF v_cuenta_org IS DISTINCT FROM v_pago.organization_id THEN
    RAISE EXCEPTION 'LC_MOVIMIENTO_CUENTA_OTRA_ORG: la cuenta bancaria del pago pertenece a otra organización' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_cuenta_act THEN
    RAISE EXCEPTION 'LC_MOVIMIENTO_CUENTA_INACTIVA: la cuenta bancaria del pago está inactiva' USING ERRCODE = 'P0001';
  END IF;
  -- El movimiento SIEMPRE se registra en la moneda de la cuenta; nunca 1:1
  -- silencioso cross-moneda (clase BL-04).
  v_cargo := v_pago.monto;
  IF v_cuenta_mon IS DISTINCT FROM v_pago.moneda::text THEN
    IF COALESCE(v_pago.tipo_cambio_usd, 0) <= 0 THEN
      RAISE EXCEPTION 'LC_PAGO_TC_REQUERIDO: el pago es en % y la cuenta en %, pero el pago no tiene tipo de cambio registrado',
        v_pago.moneda, v_cuenta_mon USING ERRCODE = 'P0001';
    END IF;
    IF v_pago.moneda::text = 'USD' AND v_cuenta_mon = 'MXN' THEN
      v_cargo := v_pago.monto * v_pago.tipo_cambio_usd;
    ELSIF v_pago.moneda::text = 'MXN' AND v_cuenta_mon = 'USD' THEN
      v_cargo := v_pago.monto / v_pago.tipo_cambio_usd;
    END IF;
  END IF;
  SELECT 'Pago prov. '
         || COALESCE(NULLIF(pf.folio_proveedor, ''), NULLIF(pf.folio_interno, ''), 's/folio')
         || ' — ' || COALESCE(pr.nombre, pf.proveedor_nombre, 'proveedor')
    INTO v_concepto
  FROM public.proveedor_facturas pf
  LEFT JOIN public.proveedores pr ON pr.id = pf.proveedor_id
  WHERE pf.id = v_pago.proveedor_factura_id;
  INSERT INTO public.bbva_movimientos (
    organization_id, cuenta_bancaria_id, fecha, concepto, referencia,
    cargo, abono, hash_dedupe, estado_conciliacion, pago_proveedor_id,
    conciliado_por, conciliado_at, importado_por
  ) VALUES (
    v_pago.organization_id, v_pago.cuenta_bancaria_id, v_pago.fecha_pago,
    COALESCE(v_concepto, 'Pago a proveedor'), COALESCE(v_pago.referencia, ''),
    ROUND(v_cargo, 2), 0, 'pago-' || p_pago_id::text, 'Conciliado', p_pago_id,
    auth.uid(), now(), auth.uid()
  )
  -- Sentry JAVASCRIPT-REACT-65/66 (42P10): el índice único vivo es
  -- (cuenta_bancaria_id, hash_dedupe) WHERE deleted_at IS NULL; el target
  -- anterior `(hash_dedupe)` no coincidía con ningún constraint y abortaba
  -- todo el registro del pago.
  ON CONFLICT (cuenta_bancaria_id, hash_dedupe) WHERE deleted_at IS NULL DO NOTHING
  RETURNING id INTO v_mov_id;
  IF v_mov_id IS NULL THEN
    SELECT id INTO v_mov_id FROM public.bbva_movimientos
     WHERE cuenta_bancaria_id = v_pago.cuenta_bancaria_id
       AND hash_dedupe = 'pago-' || p_pago_id::text
       AND deleted_at IS NULL
     LIMIT 1;
  END IF;
  RETURN v_mov_id;
END;
$$;

REVOKE ALL ON FUNCTION public._asegurar_movimiento_pago_proveedor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._asegurar_movimiento_pago_proveedor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._asegurar_movimiento_pago_proveedor(uuid) TO authenticated, service_role;

--> statement-breakpoint

-- supabase/schema/cxp/actualizar_pago_proveedor_atomico.sql
-- Fuente canónica de public.actualizar_pago_proveedor_atomico(...).
-- D5 (v13.823.382): edición de pago CxP transaccional. Bloquea pago y factura,
-- valida rol/tenant/concurrencia, actualiza el pago y reemplaza SÓLO el
-- movimiento bancario derivado del sistema en la misma transacción; las líneas
-- importadas del estado de cuenta se desvinculan, nunca se borran.
-- Al modificar: edita ESTE archivo y genera la migración con el mismo cuerpo.

CREATE OR REPLACE FUNCTION public.actualizar_pago_proveedor_atomico(
  p_pago_id uuid,
  p_fecha_pago date,
  p_monto numeric,
  p_moneda text,
  p_tipo_cambio_usd numeric,
  p_metodo_pago text,
  p_referencia text DEFAULT ''::text,
  p_cuenta_bancaria_id uuid DEFAULT NULL,
  p_notas text DEFAULT ''::text,
  p_diferencia_cambiaria_mxn numeric DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago public.pagos_proveedor;
  v_org uuid;
  v_mov_id uuid;
BEGIN
  -- D5: todo en UNA transacción (pago + movimiento espejo). Antes eran tres
  -- llamadas del navegador y un fallo dejaba la factura editada sin salida
  -- bancaria (o con la salida vieja).
  SELECT * INTO v_pago FROM public.pagos_proveedor
   WHERE id = p_pago_id AND deleted_at IS NULL
   FOR UPDATE;
  IF v_pago.id IS NULL THEN
    RAISE EXCEPTION 'LC_PAGO_NO_ENCONTRADO: el pago ya no existe o fue eliminado'
      USING ERRCODE = 'P0002';
  END IF;

  v_org := public.org_scope();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'LC_SIN_ORG: no hay organización activa para validar el pago'
      USING ERRCODE = '42501';
  END IF;
  IF v_pago.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'LC_ORG_MISMATCH: el pago pertenece a otra organización'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(auth.uid(),
        ARRAY['tesorero','contador','admin','admin_org','super_admin']::app_role[]) THEN
    RAISE EXCEPTION 'LC_PAGO_SIN_PERMISO: se requiere permiso de tesorería para editar el pago'
      USING ERRCODE = '42501';
  END IF;

  IF v_pago.lote_id IS NOT NULL THEN
    RAISE EXCEPTION 'LC_PAGO_LOTE_NO_EDITABLE: edita el lote completo para conservar sus aplicaciones'
      USING ERRCODE = '23514';
  END IF;
  IF lower(btrim(p_metodo_pago)) = 'efectivo' THEN
    p_cuenta_bancaria_id := NULL;
  END IF;

  -- Auditoría 23: una aplicación pertenece al flujo de anticipos. Rechazar
  -- ANTES de modificar pago, cuenta o movimientos, incluso con flag legacy.
  IF v_pago.es_anticipo_aplicado
     OR EXISTS (SELECT 1 FROM public.anticipos_aplicaciones aa
                WHERE aa.pago_proveedor_id = p_pago_id AND aa.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'LC_PAGO_ANTICIPO_NO_EDITABLE: el pago proviene de un anticipo; usa Revertir aplicación y vuelve a aplicar el anticipo'
      USING ERRCODE = '23514';
  END IF;

  -- Bloqueo de la factura: el guard recalcula el saldo con ella tomada.
  PERFORM 1 FROM public.proveedor_facturas
   WHERE id = v_pago.proveedor_factura_id FOR UPDATE;

  IF p_expected_updated_at IS NOT NULL
     AND v_pago.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'LC_CONFLICTO_CONCURRENCIA: otro usuario editó este pago; recarga antes de guardar'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.pagos_proveedor SET
    fecha_pago = p_fecha_pago,
    monto = p_monto,
    moneda = p_moneda::moneda,
    tipo_cambio_usd = NULLIF(COALESCE(p_tipo_cambio_usd, 0), 0),
    metodo_pago = p_metodo_pago,
    referencia = COALESCE(p_referencia, ''),
    cuenta_bancaria_id = p_cuenta_bancaria_id,
    notas = COALESCE(p_notas, ''),
    diferencia_cambiaria_mxn = p_diferencia_cambiaria_mxn
  WHERE id = p_pago_id;

  -- Reemplazo del movimiento: sólo la línea DERIVADA del sistema se da de baja.
  -- Una línea importada del estado de cuenta jamás se borra: se desvincula.
  UPDATE public.bbva_movimientos
     SET pago_proveedor_id = NULL, estado_conciliacion = 'Pendiente',
         conciliado_por = NULL, conciliado_at = NULL
   WHERE pago_proveedor_id = p_pago_id
     AND deleted_at IS NULL
     AND COALESCE(origen::text, '') <> 'sistema';

  UPDATE public.bbva_movimientos
     SET deleted_at = now(), deleted_by = auth.uid()
   WHERE deleted_at IS NULL
     AND COALESCE(origen::text, '') = 'sistema'
     AND (pago_proveedor_id = p_pago_id OR hash_dedupe = 'pago-' || p_pago_id::text);

  IF p_cuenta_bancaria_id IS NOT NULL THEN
    v_mov_id := public._asegurar_movimiento_pago_proveedor(p_pago_id);
    IF v_mov_id IS NULL THEN
      RAISE EXCEPTION 'LC_MOVIMIENTO_NO_CREADO: no se pudo regenerar la salida bancaria del pago'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN jsonb_build_object('pago_id', p_pago_id, 'movimiento_id', v_mov_id,
                            'movimiento_creado', v_mov_id IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_pago_proveedor_atomico(uuid, date, numeric, text, numeric, text, text, uuid, text, numeric, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.actualizar_pago_proveedor_atomico(uuid, date, numeric, text, numeric, text, text, uuid, text, numeric, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.actualizar_pago_proveedor_atomico(uuid, date, numeric, text, numeric, text, text, uuid, text, numeric, timestamptz) TO authenticated, service_role;

--> statement-breakpoint

-- supabase/schema/cxp/conciliar_tesoreria_proveedor.sql
-- Conciliación automática CxP: recalcula saldo del proveedor y estatus de factura
-- a partir de los pagos y sus movimientos de tesorería registrados.
CREATE OR REPLACE FUNCTION public.conciliar_tesoreria_proveedor(
  p_proveedor_id uuid DEFAULT NULL,
  p_factura_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_proveedor_saldo uuid;
  v_revisadas int := 0;
  v_actualizadas int := 0;
  v_facturas jsonb := '[]'::jsonb;
  v_incidencias jsonb := '[]'::jsonb;
  v_incidencias_pagos jsonb := '[]'::jsonb;
  v_origenes_anticipos jsonb := '[]'::jsonb;
  v_movimiento_anticipo uuid;
  v_proveedores jsonb := '[]'::jsonb;
  r record;
  v_estado_antes text;
  v_captura_antes text;
BEGIN
  IF p_proveedor_id IS NULL AND p_factura_id IS NULL THEN
    RAISE EXCEPTION 'LC_CONCILIACION_SIN_ALCANCE: indica un proveedor o una factura'
      USING ERRCODE = 'P0001';
  END IF;

  v_org := public.current_user_org_id();
  PERFORM public._assert_writer(v_org);

  -- El recálculo sigue limitado a la factura; su resumen cubre al proveedor.
  v_proveedor_saldo := p_proveedor_id;
  IF p_factura_id IS NOT NULL THEN
    SELECT pf.proveedor_id INTO v_proveedor_saldo
    FROM public.proveedor_facturas pf
    WHERE pf.id = p_factura_id AND pf.organization_id = v_org
      AND pf.deleted_at IS NULL
      AND (p_proveedor_id IS NULL OR pf.proveedor_id = p_proveedor_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'LC_CONCILIACION_ALCANCE_INVALIDO: la factura no pertenece al proveedor y organización indicados'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 1) Recalcular estado/etapa de captura de cada factura en el alcance.
  FOR r IN
    SELECT pf.id, pf.estado::text AS estado, pf.estado_captura
    FROM public.proveedor_facturas pf
    WHERE pf.organization_id = v_org
      AND pf.deleted_at IS NULL
      AND (p_factura_id IS NULL OR pf.id = p_factura_id)
      AND (p_proveedor_id IS NULL OR pf.proveedor_id = p_proveedor_id)
  LOOP
    v_revisadas := v_revisadas + 1;
    v_estado_antes := r.estado;
    v_captura_antes := r.estado_captura;

    PERFORM public._recalc_estado_proveedor_factura(r.id);

    IF EXISTS (
      SELECT 1 FROM public.proveedor_facturas pf
      WHERE pf.id = r.id
        AND (pf.estado::text IS DISTINCT FROM v_estado_antes
             OR pf.estado_captura IS DISTINCT FROM v_captura_antes)
    ) THEN
      v_actualizadas := v_actualizadas + 1;
    END IF;
  END LOOP;

  -- Auditoría 23: validar las aplicaciones contra la salida ORIGINAL.
  -- Una aplicación parcial no se compara con el cargo total del anticipo.
  -- La inconsistencia se reporta para revisión y nunca propone otro cargo.
  FOR r IN
    SELECT pp.*, COALESCE(NULLIF(pf.folio_proveedor,''), pf.folio_interno) AS folio
    FROM public.pagos_proveedor pp
    JOIN public.proveedor_facturas pf ON pf.id = pp.proveedor_factura_id
    WHERE pf.organization_id = v_org AND pp.organization_id = v_org
      AND pp.deleted_at IS NULL AND pf.deleted_at IS NULL
      AND (p_factura_id IS NULL OR pf.id = p_factura_id)
      AND (p_proveedor_id IS NULL OR pf.proveedor_id = p_proveedor_id)
      AND (pp.es_anticipo_aplicado
           OR EXISTS (SELECT 1 FROM public.anticipos_aplicaciones aa
                      WHERE aa.pago_proveedor_id = pp.id AND aa.deleted_at IS NULL))
  LOOP
    BEGIN
      v_movimiento_anticipo := public._movimiento_original_anticipo_aplicado(r.id);
      IF v_movimiento_anticipo IS NOT NULL THEN
        v_origenes_anticipos := v_origenes_anticipos || jsonb_build_array(jsonb_build_object(
          'factura_id', r.proveedor_factura_id, 'movimiento_id', v_movimiento_anticipo));
      END IF;
    EXCEPTION WHEN check_violation THEN
      v_incidencias := v_incidencias || jsonb_build_array(jsonb_build_object(
        'pago_id', r.id, 'factura_id', r.proveedor_factura_id, 'folio', r.folio,
        'fecha_pago', r.fecha_pago, 'monto', ROUND(r.monto, 2), 'moneda', r.moneda::text,
        'monto_esperado_mxn', 0, 'cargo_mxn', 0,
        'tipo', 'anticipo_inconsistente', 'motivo', SQLERRM));
    END;
  END LOOP;

  -- 2) Detalle por factura con los importes recalculados.
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'folio'), '[]'::jsonb) INTO v_facturas
  FROM (
    SELECT jsonb_build_object(
             'factura_id', pf.id,
             'folio', COALESCE(NULLIF(pf.folio_proveedor,''), pf.folio_interno),
             'moneda', pf.moneda::text,
             'total', ROUND(s.total, 2),
             'pagado', ROUND(s.pagado, 2),
             'notas_credito', ROUND(s.notas_credito_aplicadas, 2),
             'saldo', ROUND(s.saldo, 2),
             'estado', pf.estado::text,
             'pagos', (SELECT count(*) FROM public.pagos_proveedor pp
                        WHERE pp.proveedor_factura_id = pf.id AND pp.deleted_at IS NULL),
             'movimientos', (SELECT count(DISTINCT bm.id) FROM public.bbva_movimientos bm
                              JOIN public.pagos_proveedor pp2
                                ON pp2.id = bm.pago_proveedor_id OR pp2.lote_id = bm.pago_proveedor_lote_id
                              WHERE pp2.proveedor_factura_id = pf.id
                                AND pp2.organization_id = v_org AND bm.organization_id = v_org
                                AND pp2.deleted_at IS NULL
                                AND bm.deleted_at IS NULL)
                            + (SELECT count(DISTINCT origen->>'movimiento_id')
                               FROM jsonb_array_elements(v_origenes_anticipos) origen
                               WHERE origen->>'factura_id' = pf.id::text)
           ) AS x
    FROM public.proveedor_facturas pf
    JOIN public.v_proveedor_facturas_saldo s ON s.proveedor_factura_id = pf.id
    WHERE pf.organization_id = v_org
      AND pf.deleted_at IS NULL
      AND (p_factura_id IS NULL OR pf.id = p_factura_id)
      AND (p_proveedor_id IS NULL OR pf.proveedor_id = p_proveedor_id)
  ) q;

  -- 3) Incidencias: pagos sin movimiento de tesorería o con importe distinto.
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'fecha_pago'), '[]'::jsonb) INTO v_incidencias_pagos
  FROM (
    SELECT jsonb_build_object(
             'pago_id', pp.id,
             'factura_id', pp.proveedor_factura_id,
             'folio', COALESCE(NULLIF(pf.folio_proveedor,''), pf.folio_interno),
             'fecha_pago', pp.fecha_pago,
             'monto', ROUND(pp.monto, 2),
             'moneda', pp.moneda::text,
             'monto_esperado_mxn', ROUND(
               CASE WHEN pp.moneda::text = 'MXN' THEN pp.monto
                    WHEN COALESCE(pp.tipo_cambio_usd,0) > 0 THEN pp.monto * pp.tipo_cambio_usd
                    ELSE pp.monto END, 2),
             'cargo_mxn', ROUND(CASE WHEN cb.moneda::text = 'MXN' THEN m.cargo
               WHEN cb.moneda::text = 'USD' AND pp.tipo_cambio_usd > 0
                 AND pp.tipo_cambio_usd::text NOT IN ('NaN','Infinity','-Infinity') THEN m.cargo * pp.tipo_cambio_usd END, 2),
             'moneda_cuenta', cb.moneda::text,
             'cargo_cuenta', ROUND(COALESCE(m.cargo, 0), 2),
             'monto_esperado_cuenta', ROUND(e.cargo, 2),
             'motivo', CASE WHEN pp.lote_id IS NOT NULL THEN 'Revisa el movimiento del lote completo.'
               WHEN lower(btrim(pp.metodo_pago)) = 'efectivo' THEN 'Un cobro en efectivo no debe tener cargo bancario.'
               WHEN m.id IS NOT NULL AND e.cargo IS NULL THEN
               'No se puede comparar el importe: falta la moneda de cuenta o un tipo de cambio compatible.' END,
             'tipo', CASE WHEN pp.lote_id IS NOT NULL THEN 'lote_inconsistente'
               WHEN lower(btrim(pp.metodo_pago)) = 'efectivo' THEN 'efectivo_inconsistente'
               WHEN m.id IS NULL THEN 'sin_movimiento' ELSE 'descuadre' END
           ) AS x, pp.fecha_pago
    FROM public.pagos_proveedor pp
    JOIN public.proveedor_facturas pf ON pf.id = pp.proveedor_factura_id
    LEFT JOIN public.pagos_proveedor_lote lote ON lote.id = pp.lote_id AND lote.organization_id = v_org
    LEFT JOIN public.bbva_movimientos m
           ON (CASE WHEN pp.lote_id IS NOT NULL THEN m.pago_proveedor_lote_id = pp.lote_id
                ELSE m.pago_proveedor_id = pp.id END)
          AND m.deleted_at IS NULL AND m.organization_id = v_org
    LEFT JOIN public.cuentas_bancarias cb
           ON cb.id = COALESCE(m.cuenta_bancaria_id, pp.cuenta_bancaria_id)
          AND cb.organization_id = v_org AND cb.deleted_at IS NULL
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN pp.lote_id IS NOT NULL AND cb.moneda = lote.moneda THEN lote.monto_total
        WHEN pp.lote_id IS NOT NULL THEN NULL
        WHEN cb.moneda::text = pp.moneda::text THEN pp.monto
        WHEN pp.moneda::text = 'USD' AND cb.moneda::text = 'MXN' AND pp.tipo_cambio_usd > 0
          AND pp.tipo_cambio_usd::text NOT IN ('NaN','Infinity','-Infinity')
          THEN pp.monto * pp.tipo_cambio_usd
        WHEN pp.moneda::text = 'MXN' AND cb.moneda::text = 'USD' AND pp.tipo_cambio_usd > 0
          AND pp.tipo_cambio_usd::text NOT IN ('NaN','Infinity','-Infinity')
          THEN pp.monto / pp.tipo_cambio_usd
      END AS cargo
    ) e
    WHERE pf.organization_id = v_org
      AND pp.organization_id = v_org
      AND pp.deleted_at IS NULL
      AND pf.deleted_at IS NULL
      AND NOT pp.es_anticipo_aplicado
      AND NOT EXISTS (SELECT 1 FROM public.anticipos_aplicaciones aa
                      WHERE aa.pago_proveedor_id = pp.id AND aa.deleted_at IS NULL)
      AND (p_factura_id IS NULL OR pf.id = p_factura_id)
      AND (p_proveedor_id IS NULL OR pf.proveedor_id = p_proveedor_id)
      AND (
        (m.id IS NULL AND pp.cuenta_bancaria_id IS NOT NULL
          AND lower(btrim(pp.metodo_pago)) <> 'efectivo')
        OR (m.id IS NOT NULL AND (lower(btrim(pp.metodo_pago)) = 'efectivo' OR
            e.cargo IS NULL OR abs(COALESCE(m.cargo,0) - ROUND(e.cargo, 2)) > 0.01))
        OR (pp.lote_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.bbva_movimientos individual
          WHERE individual.pago_proveedor_id = pp.id AND individual.organization_id = v_org
            AND individual.deleted_at IS NULL
        ))
      )
  ) q2;
  v_incidencias := v_incidencias || v_incidencias_pagos;

  -- 4) Proveedor completo en la organización: aprobadas, todos los meses, por moneda.
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'moneda'), '[]'::jsonb) INTO v_proveedores
  FROM (
    SELECT jsonb_build_object(
             'proveedor_id', pf.proveedor_id,
             'moneda', pf.moneda::text,
             'saldo_pendiente', ROUND(SUM(GREATEST(s.saldo, 0)), 2),
             'facturas_abiertas', COUNT(*) FILTER (WHERE s.saldo > 0.01)
           ) AS x
    FROM public.proveedor_facturas pf
    JOIN public.v_proveedor_facturas_saldo s ON s.proveedor_factura_id = pf.id
    WHERE pf.organization_id = v_org
      AND pf.deleted_at IS NULL
      AND pf.estado::text NOT IN ('Cancelada','Borrador')
      AND pf.estado_aprobacion = 'aprobada'
      AND pf.proveedor_id = v_proveedor_saldo
    GROUP BY pf.proveedor_id, pf.moneda
  ) q3;

  RETURN jsonb_build_object(
    'facturas_revisadas', v_revisadas,
    'facturas_actualizadas', v_actualizadas,
    'facturas', v_facturas,
    'incidencias', v_incidencias,
    'proveedores', v_proveedores,
    'conciliado_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.conciliar_tesoreria_proveedor(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conciliar_tesoreria_proveedor(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.conciliar_tesoreria_proveedor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_tesoreria_proveedor(uuid, uuid) TO service_role;

--> statement-breakpoint

-- supabase/schema/cxp/regenerar_movimiento_pago_proveedor.sql
-- Fuente canónica de public.regenerar_movimiento_pago_proveedor(uuid) (Ola 6 · O6-SCHEMA).
-- 1:1 con la migración Ola 11 · RBD-07 (20260813025053_b5b00098-bfa3-4be4-b352-9a049d381f70).
-- Ola 6 · RG5-1: fail-closed — sin organización resuelta se niega (LC_SIN_ORG).
-- Ola 11 · RBD-07: la rama cross-moneda exige el TC registrado en el pago
--   (LC_PAGO_TC_REQUERIDO); nunca conversión 1:1 silenciosa (clase BL-04).
-- Ola 11 · RBD-04: se restauró el encabezado CREATE OR REPLACE FUNCTION
--   (el archivo canónico empezaba en `RETURNS uuid` y no era SQL válido).
-- Al modificar: edita ESTE archivo y genera la migración con el mismo cuerpo.

CREATE OR REPLACE FUNCTION public.regenerar_movimiento_pago_proveedor(p_pago_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago         public.pagos_proveedor;
  v_org          uuid;
BEGIN
  SELECT * INTO v_pago
  FROM public.pagos_proveedor
  WHERE id = p_pago_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_pago.id IS NULL THEN
    RAISE EXCEPTION 'LC_MOVIMIENTO_PAGO_INEXISTENTE: el pago de proveedor no existe o está eliminado'
      USING ERRCODE = 'P0001';
  END IF;

  -- Ola 6 · RG5-1: fail-closed. Sin organización resuelta no hay forma de
  -- validar la pertenencia del pago: se niega.
  v_org := public.org_scope();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'LC_SIN_ORG: no hay organización activa para validar el pago; selecciona una organización antes de regenerar el movimiento'
      USING ERRCODE = '42501';
  END IF;

  IF v_pago.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'LC_ORG_MISMATCH: el pago pertenece a otra organización'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.has_any_role(auth.uid(), ARRAY['tesorero','contador','admin','admin_org','super_admin']::app_role[])
  ) THEN
    RAISE EXCEPTION 'LC_MOVIMIENTO_SIN_PERMISO: se requiere permiso de tesorería para regenerar el movimiento bancario'
      USING ERRCODE = 'P0001';
  END IF;

  -- AUD99/121: rechazar antes de reutilizar históricos o generar efectivo.
  IF v_pago.es_ajuste THEN
    RAISE EXCEPTION 'LC_MOVIMIENTO_AJUSTE_NO_MONETARIO: un ajuste no monetario no puede generar ni reutilizar un movimiento bancario'
      USING ERRCODE = 'P0001';
  END IF;

  -- Auditoría 23: el helper reconoce el origen del anticipo antes de crear
  -- nada. El lock del pago serializa reintentos y comparte la ruta idempotente
  -- con el registro/edición normal. Efectivo aplicado válido devuelve NULL.
  IF v_pago.es_anticipo_aplicado
     OR EXISTS (SELECT 1 FROM public.anticipos_aplicaciones aa
                WHERE aa.pago_proveedor_id = p_pago_id AND aa.deleted_at IS NULL) THEN
    RETURN public._movimiento_original_anticipo_aplicado(p_pago_id);
  END IF;
  IF v_pago.lote_id IS NOT NULL THEN
    RETURN public._asegurar_movimiento_pago_proveedor(p_pago_id);
  END IF;
  IF lower(btrim(v_pago.metodo_pago)) = 'efectivo' THEN
    RAISE EXCEPTION 'LC_MOVIMIENTO_EFECTIVO: un pago en efectivo no genera cargo bancario'
      USING ERRCODE = '23514';
  END IF;
  IF v_pago.cuenta_bancaria_id IS NULL THEN
    RAISE EXCEPTION 'LC_MOVIMIENTO_SIN_CUENTA: el pago no tiene cuenta bancaria, no hay movimiento que generar'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN public._asegurar_movimiento_pago_proveedor(p_pago_id);
END;
$$;

REVOKE ALL ON FUNCTION public.regenerar_movimiento_pago_proveedor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.regenerar_movimiento_pago_proveedor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.regenerar_movimiento_pago_proveedor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerar_movimiento_pago_proveedor(uuid) TO service_role;

--> statement-breakpoint

-- supabase/schema/cxp/registrar_pago_proveedor_atomico.sql
-- Fuente canónica. Espejo 1:1 de la migración v13.823.32 (ola de pulido CxP/cotización→embarque/CRM).
-- D4 (v13.823.382): valida la fecha del pago (requerida, no futura y no
-- anterior a la emisión) antes de insertar; el guard la revalida en BD.
-- MNY (20260917180259): el candado de la cuenta bancaria pasa por
-- `_lock_cuenta_bancaria` (SECURITY DEFINER) para que un `contador` pueda
-- registrar pagos; antes el FOR UPDATE directo no veía la fila y la RPC
-- respondía LC_PAGO_CUENTA_INEXISTENTE sobre cuentas existentes y activas.
-- Al modificar: edita ESTE archivo y genera la migración con el mismo cuerpo.

CREATE OR REPLACE FUNCTION public.registrar_pago_proveedor_atomico(
  p_factura_id uuid,
  p_fecha_pago date,
  p_monto numeric,
  p_moneda text,
  p_metodo_pago text,
  p_referencia text DEFAULT ''::text,
  p_cuenta_bancaria_id uuid DEFAULT NULL,
  p_notas text DEFAULT ''::text,
  p_tipo_cambio_usd numeric DEFAULT NULL,
  p_diferencia_cambiaria_mxn numeric DEFAULT NULL,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_org      uuid;
  v_emision  date;
  v_hoy_mx   date := public.fecha_negocio_mx();
  v_pago_id  uuid;
  v_mov_id   uuid;
  v_reintento boolean := false;
  v_cta_org  uuid;
  v_cta_activa boolean;
BEGIN
  IF lower(btrim(p_metodo_pago)) = 'efectivo' THEN
    p_cuenta_bancaria_id := NULL;
  END IF;

  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_pago_id
      FROM public.pagos_proveedor
     WHERE client_request_id = p_client_request_id
       AND deleted_at IS NULL;
    IF v_pago_id IS NOT NULL THEN
      -- Reintento del mismo submit: devolvemos el pago ya creado y
      -- aseguramos (reparamos) su movimiento bancario. Nunca 23505.
      v_mov_id := public._asegurar_movimiento_pago_proveedor(v_pago_id);
      RETURN jsonb_build_object('pago_id', v_pago_id, 'movimiento_id', v_mov_id, 'reintento', true);
    END IF;
  END IF;

  SELECT organization_id, fecha_emision INTO v_org, v_emision
    FROM public.proveedor_facturas
   WHERE id = p_factura_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'LC_CXP_NO_EXISTE: la factura de proveedor no existe o fue eliminada' USING ERRCODE = 'P0001';
  END IF;

  -- N8: la cuenta bancaria debe existir, estar activa y ser de la MISMA
  -- organización que la factura. El candado se toma vía
  -- `_lock_cuenta_bancaria` (SECURITY DEFINER): con `FOR UPDATE` directo, un
  -- rol de sólo lectura sobre cuentas (contador) no veía la fila y el pago
  -- fallaba con LC_PAGO_CUENTA_INEXISTENTE.
  IF p_cuenta_bancaria_id IS NOT NULL THEN
    SELECT c.org_id, c.esta_activa INTO v_cta_org, v_cta_activa
      FROM public._lock_cuenta_bancaria(p_cuenta_bancaria_id) c;
    IF v_cta_org IS NULL THEN
      RAISE EXCEPTION 'LC_PAGO_CUENTA_INEXISTENTE: la cuenta bancaria no existe o está dada de baja' USING ERRCODE = 'P0001';
    END IF;
    IF v_cta_org <> v_org THEN
      RAISE EXCEPTION 'LC_PAGO_CUENTA_OTRA_ORG: la cuenta bancaria pertenece a otra organización' USING ERRCODE = 'P0001';
    END IF;
    IF NOT v_cta_activa THEN
      RAISE EXCEPTION 'LC_PAGO_CUENTA_INACTIVA: la cuenta bancaria está inactiva y no admite pagos' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- D4: canon de fecha de negocio México, igual que el lote.
  IF p_fecha_pago IS NULL THEN
    RAISE EXCEPTION 'LC_PAGO_FECHA_INVALIDA: captura la fecha del pago' USING ERRCODE = '22023';
  END IF;
  IF p_fecha_pago > v_hoy_mx THEN
    RAISE EXCEPTION 'LC_PAGO_FECHA_FUTURA: la fecha del pago (%) no puede ser futura', p_fecha_pago
      USING ERRCODE = '22023';
  END IF;
  IF v_emision IS NOT NULL AND p_fecha_pago < v_emision THEN
    RAISE EXCEPTION 'LC_PAGO_FECHA_PREVIA_EMISION: la fecha del pago (%) es anterior a la emisión de la factura (%)',
      p_fecha_pago, v_emision USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.pagos_proveedor (
      organization_id, proveedor_factura_id, fecha_pago, monto, moneda,
      tipo_cambio_usd, metodo_pago, referencia, cuenta_bancaria_id, notas,
      diferencia_cambiaria_mxn, client_request_id, created_by
    ) VALUES (
      v_org, p_factura_id, p_fecha_pago, p_monto, p_moneda::moneda,
      NULLIF(COALESCE(p_tipo_cambio_usd, 0), 0), p_metodo_pago, COALESCE(p_referencia, ''),
      p_cuenta_bancaria_id, COALESCE(p_notas, ''), p_diferencia_cambiaria_mxn,
      p_client_request_id, auth.uid()
    )
    RETURNING id INTO v_pago_id;
  EXCEPTION WHEN unique_violation THEN
    -- Carrera con otro submit de la misma llave: el pago SÍ quedó creado.
    SELECT id INTO v_pago_id
      FROM public.pagos_proveedor
     WHERE client_request_id = p_client_request_id AND deleted_at IS NULL;
    IF v_pago_id IS NULL THEN RAISE; END IF;
    v_reintento := true;
  END;

  v_mov_id := public._asegurar_movimiento_pago_proveedor(v_pago_id);

  RETURN jsonb_build_object('pago_id', v_pago_id, 'movimiento_id', v_mov_id, 'reintento', v_reintento);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pago_proveedor_atomico(uuid, date, numeric, text, text, text, uuid, text, numeric, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_pago_proveedor_atomico(uuid, date, numeric, text, text, text, uuid, text, numeric, numeric, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_pago_proveedor_atomico(uuid, date, numeric, text, text, text, uuid, text, numeric, numeric, uuid) TO authenticated, service_role;

--> statement-breakpoint

-- supabase/schema/dashboards/pnl_financiero_embarque.sql
-- Audit 124/129/130: canonical supplier allocation and explicit incomplete costs.
-- Read-only calculation; no historical data rewrite. Existing ACL unchanged.
CREATE OR REPLACE FUNCTION public.pnl_financiero_embarque(_embarque_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tc_usd numeric; _tc_eur numeric; _org uuid;
  _base jsonb;
  -- Audit132: local reader state only; no helper/RPC or persisted valuation.
  _invoice record; _note record; _line_income record;
  _nc_conceptos jsonb; _nc_base numeric; _nc_base_factura numeric;
  _nc_moneda text; _nc_tc numeric; _factura_moneda text; _factura_tc numeric;
  _fnc_data jsonb := '[]'; _net_data jsonb := '[]';
  _detail_data jsonb := '{}'; _detail_rows jsonb := '[]';
  _factor numeric; _tagged numeric; _shipment numeric; _tc_doc numeric;
  -- Audit144: read-only attribution; never manufacture historical lineage.
  _nc_line record; _note_credit numeric; _line_credit numeric;
  _running_base numeric; _running_doc numeric; _previous_doc numeric;
  _note_total_doc numeric; _all_credit_doc numeric; _note_credit_mxn numeric; _invoice_credit_mxn numeric;
  _note_detail jsonb; _invoice_proportional boolean;
  _subtotal numeric; _credit numeric; _net numeric; _net_mxn numeric;
  _credit_mxn numeric; _line_mxn numeric; _detail_sum numeric;
  _income_total numeric := 0; _pending_total numeric := 0;
  _invoice_bad boolean; _invoice_valued boolean; _income_overflow boolean := false;
  _line_name text; _nc_count bigint; _tagged_shipments bigint;
  _invoice_count bigint := 0; _active_nc bigint := 0; _nc_no_base bigint := 0;
  _nc_no_value bigint := 0; _invoice_no_value bigint := 0;
  _proportional bigint := 0; _overflows bigint := 0;
  _income_incomplete boolean;
  -- Audit 148 exact documentary coverage; private state, no new callable API.
  _cov_policy record; _cov_invoice record; _cov_org uuid;
  _cov_a numeric; _cov_s numeric; _cov_n numeric; _cov_c numeric;
  _cov_p numeric; _cov_r numeric; _cov_tc numeric; _cov_fx numeric;
  _cov_usd numeric; _cov_eur numeric; _cov_base_mxn numeric;
  _cov_bad boolean; _cov_negative boolean; _cov_full boolean;
  _cov_state text;
  _cov_data jsonb := '[]';

BEGIN
  SELECT COALESCE(tipo_cambio_usd,0), COALESCE(tipo_cambio_eur,0), organization_id
    INTO _tc_usd, _tc_eur, _org
  FROM public.embarques WHERE id = _embarque_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Embarque % no encontrado', _embarque_id;
  END IF;
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role)
     AND _org IS DISTINCT FROM public.current_user_org_id() THEN
    RAISE EXCEPTION 'Sin acceso al embarque %', _embarque_id USING ERRCODE='42501';
  END IF;

  -- Keep invoice membership and gross attribution; NC lines use exact lineage. Every
  -- numeric operation introduced by the income path is guarded per document;
  -- an unknown NC never silently becomes a valid zero discount.
  FOR _invoice IN
    SELECT fa.* FROM public.facturas fa
    WHERE fa.deleted_at IS NULL
      AND fa.estado::text NOT IN ('Borrador','Cancelada','Sustituida')
      AND (fa.embarque_id = _embarque_id OR EXISTS (
        SELECT 1 FROM public.conceptos_factura cf
        WHERE cf.factura_id = fa.id AND cf.deleted_at IS NULL
          AND cf.embarque_id = _embarque_id))
    ORDER BY fa.id
  LOOP
    _invoice_bad := false; _invoice_proportional := false;
    _factor := NULL; _subtotal := NULL; _net := NULL; _net_mxn := NULL;
    _credit := 0; _all_credit_doc := 0; _invoice_credit_mxn := 0; _nc_count := 0; _tc_doc := NULL; _tagged_shipments := 0;
    _factura_moneda := _invoice.moneda::text;
    _factura_tc := _invoice.tipo_cambio;
    BEGIN
      SELECT coalesce(sum(coalesce(cf.total,0)) FILTER (WHERE cf.embarque_id IS NOT NULL),0),
             coalesce(sum(coalesce(cf.total,0)) FILTER (WHERE cf.embarque_id = _embarque_id),0),
             count(DISTINCT cf.embarque_id)
        INTO _tagged, _shipment, _tagged_shipments
      FROM public.conceptos_factura cf
      WHERE cf.factura_id = _invoice.id AND cf.deleted_at IS NULL;
      _factor := CASE WHEN _tagged > 0 THEN _shipment / _tagged
        WHEN _invoice.embarque_id = _embarque_id THEN 1::numeric ELSE 0::numeric END;
      IF _factor::text IN ('NaN','Infinity','-Infinity')
        OR _tagged::text IN ('NaN','Infinity','-Infinity')
        OR _shipment::text IN ('NaN','Infinity','-Infinity') THEN _factor := NULL; END IF;
    EXCEPTION WHEN numeric_value_out_of_range THEN
      _overflows := _overflows + 1;
    END;
    IF _factor <= 0 THEN CONTINUE; END IF;
    _invoice_count := _invoice_count + 1;
    BEGIN
      SELECT t.tc INTO _tc_doc FROM public.tc_para_documento(
        _invoice.fecha_emision, _factura_moneda, _factura_tc,
        CASE WHEN _factura_moneda = 'EUR' THEN _tc_eur ELSE _tc_usd END) t;
      IF _factor IS NOT NULL AND _invoice.subtotal IS NOT NULL
        AND _invoice.subtotal::text NOT IN ('NaN','Infinity','-Infinity')
        AND _factura_moneda IN ('MXN','USD','EUR')
        AND (_factura_moneda = 'MXN' OR (_tc_doc > 1
          AND _tc_doc::text NOT IN ('NaN','Infinity','-Infinity'))) THEN
        _subtotal := round(_invoice.subtotal * _factor,2);
        -- Validate invoice -> MXN even when no NC exists or its net is zero.
        _net_mxn := public.a_mxn(_subtotal,_factura_moneda,_tc_doc,_tc_doc);
      END IF;
    EXCEPTION WHEN numeric_value_out_of_range THEN
      _subtotal := NULL; _net_mxn := NULL; _overflows := _overflows + 1;
    END;
    _invoice_bad := _net_mxn IS NULL;
    FOR _note IN SELECT n.* FROM public.factura_notas_credito n
      WHERE n.factura_id = _invoice.id AND n.deleted_at IS NULL
        AND n.estado::text IN ('Timbrada','Aplicada') ORDER BY n.id
    LOOP
      _active_nc := _active_nc + 1; _nc_count := _nc_count + 1;
      _nc_conceptos := _note.conceptos;
      _nc_moneda := _note.moneda::text; _nc_tc := _note.tipo_cambio;
-- Local block for an EXISTING PL/pgSQL reader. This is not a new function/RPC.
-- Input: _nc_conceptos jsonb. Output: _nc_base numeric (NULL = unknown).
-- The NC draft persists its discount in precio_unitario; never discount twice.
-- Non-economic metadata (taxes, description, lineage) does not set this base.
<<credit132_parse_base>>
DECLARE
  _line jsonb;
  _q_text text;
  _p_text text;
  _q numeric;
  _p numeric;
  _sum numeric := 0;
  _decimal constant text := '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$';
BEGIN
  _nc_base := NULL;
  IF jsonb_typeof(_nc_conceptos) IS DISTINCT FROM 'array' THEN
    EXIT credit132_parse_base;
  END IF;
  IF jsonb_array_length(_nc_conceptos) = 0 THEN
    EXIT credit132_parse_base;
  END IF;
  FOR _line IN SELECT value FROM jsonb_array_elements(_nc_conceptos) LOOP
    IF jsonb_typeof(_line) IS DISTINCT FROM 'object'
      OR coalesce(jsonb_typeof(_line->'cantidad'),'null') NOT IN ('number','string')
      OR coalesce(jsonb_typeof(_line->'precio_unitario'),'null') NOT IN ('number','string') THEN
      EXIT credit132_parse_base;
    END IF;
    _q_text := btrim(_line->>'cantidad');
    _p_text := btrim(_line->>'precio_unitario');
    IF _q_text !~ _decimal OR _p_text !~ _decimal THEN
      EXIT credit132_parse_base;
    END IF;
    _q := _q_text::numeric;
    _p := _p_text::numeric;
    IF _q <= 0 OR _p < 0 THEN
      EXIT credit132_parse_base;
    END IF;
    -- Match subtotalLinea: round AFTER multiplication, separately per line.
    -- Cast, multiplication, rounding and total overflow all fail closed below.
    _sum := _sum + round(_q * _p, 2);
  END LOOP;
  _nc_base := _sum;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    _nc_base := NULL;
END credit132_parse_base;
-- Local block for an EXISTING PL/pgSQL reader. This is not a new function/RPC.
-- Inputs: _nc_base numeric, _nc_moneda text, _nc_tc numeric,
--         _factura_moneda text, _factura_tc numeric.
-- Output: _nc_base_factura numeric. NULL must propagate into incompleteness.
-- The existing helper returns 0 for invalid TC: validate BEFORE calling it.
<<credit132_convert_base>>
BEGIN
  _nc_base_factura := NULL;
  IF _nc_base IS NULL OR _nc_base < 0
    OR _nc_base::text IN ('NaN','Infinity','-Infinity')
    OR coalesce(_nc_moneda,'') NOT IN ('MXN','USD','EUR')
    OR coalesce(_factura_moneda,'') NOT IN ('MXN','USD','EUR') THEN
    EXIT credit132_convert_base;
  END IF;
  IF _nc_moneda <> _factura_moneda THEN
    IF _nc_moneda <> 'MXN' AND (
      _nc_tc IS NULL OR _nc_tc <= 1
      OR _nc_tc::text IN ('NaN','Infinity','-Infinity')) THEN
      EXIT credit132_convert_base;
    END IF;
    IF _factura_moneda <> 'MXN' AND (
      _factura_tc IS NULL OR _factura_tc <= 1
      OR _factura_tc::text IN ('NaN','Infinity','-Infinity')) THEN
      EXIT credit132_convert_base;
    END IF;
  END IF;
  _nc_base_factura := public.nc_convertida_a_moneda_factura(
    _nc_base, _nc_moneda, _nc_tc, _factura_moneda, _factura_tc);
EXCEPTION
  WHEN numeric_value_out_of_range THEN
    _nc_base_factura := NULL;
END credit132_convert_base;

      _credit_mxn := NULL;
      _note_credit := 0; _note_credit_mxn := 0; _note_detail := '[]';
      _note_total_doc := _nc_base_factura;
      _running_base := 0; _previous_doc := 0;
      IF _nc_base IS NULL THEN _nc_no_base := _nc_no_base + 1; END IF;
      BEGIN
        -- The reviewed132 parser/conversion above validate the WHOLE note first.
        -- An invalid line never leaves a partially credited, apparently known NC.
        IF _nc_base_factura IS NOT NULL THEN
          FOR _nc_line IN
            SELECT cf.id AS source_id, cf.embarque_id,
                   lower(trim(coalesce(nullif(cf.descripcion,''),'(sin concepto)'))) AS concepto,
                   round((l->>'cantidad')::numeric * (l->>'precio_unitario')::numeric,2) AS base
            FROM jsonb_array_elements(_nc_conceptos) WITH ORDINALITY AS lines(l,position)
            LEFT JOIN public.conceptos_factura cf
              ON cf.id = CASE WHEN lower(btrim(l->>'concepto_factura_id'))
                   ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 THEN lower(btrim(l->>'concepto_factura_id'))::uuid END
              AND cf.factura_id = _invoice.id AND cf.organization_id = _org
              AND _invoice.organization_id = _org AND _note.organization_id = _org
              AND cf.deleted_at IS NULL AND cf.embarque_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM public.embarques e
                WHERE e.id = cf.embarque_id AND e.organization_id = _org AND e.deleted_at IS NULL)
            ORDER BY lines.position
          LOOP
            -- Cumulative conversion preserves132's full converted note exactly.
            -- Never round/convert each tiny line independently then add it up.
            _running_base := _running_base + _nc_line.base;
            _running_doc := CASE WHEN _running_base = _nc_base THEN _nc_base_factura
              ELSE public.nc_convertida_a_moneda_factura(
                _running_base,_nc_moneda,_nc_tc,_factura_moneda,_factura_tc) END;
            _line_credit := CASE WHEN _nc_line.source_id IS NULL
              THEN _running_doc * _factor - _previous_doc * _factor
              ELSE _running_doc - _previous_doc END;
            _line_mxn := NULL;
            IF _factura_moneda = 'MXN' OR (_tc_doc > 1
              AND _tc_doc::text NOT IN ('NaN','Infinity','-Infinity')) THEN
              -- Allocate the rounded GLOBAL invoice debit before shipment filtering.
              -- All line debits telescope to132's full converted invoice net; tiny
              -- FX residues follow persisted JSON order instead of being duplicated.
              _line_mxn := (public.a_mxn(_invoice.subtotal-_all_credit_doc-_previous_doc,_factura_moneda,_tc_doc,_tc_doc)
                - public.a_mxn(_invoice.subtotal-_all_credit_doc-_running_doc,_factura_moneda,_tc_doc,_tc_doc))
                * CASE WHEN _nc_line.source_id IS NULL THEN _factor ELSE 1::numeric END;
            END IF;
            _previous_doc := _running_doc;
            IF _nc_line.source_id IS NULL THEN
              -- Missing, malformed, orphaned or inconsistent lineage stays provisional.
              -- This also warns for a legacy single-shipment invoice: its concept is unknown.
              _invoice_proportional := true;
            ELSIF _nc_line.embarque_id <> _embarque_id THEN
              CONTINUE; -- The selected credit must never reduce a different shipment.
            END IF;
            _note_credit := _note_credit + _line_credit;
            _note_credit_mxn := _note_credit_mxn + _line_mxn;
            _note_detail := _note_detail || jsonb_build_array(jsonb_build_object(
              'concepto',CASE WHEN _nc_line.source_id IS NULL THEN '(nota de crédito)' ELSE _nc_line.concepto END,
              'monto_mxn',_line_mxn));
          END LOOP;
          _nc_base_factura := _note_credit;
          IF _note_credit IS NOT NULL AND (_factura_moneda = 'MXN' OR (_tc_doc > 1
            AND _tc_doc::text NOT IN ('NaN','Infinity','-Infinity'))) THEN
            _credit_mxn := _note_credit_mxn;
          END IF;
          IF _credit_mxn IS NOT NULL AND _credit IS NOT NULL THEN
            DECLARE
              next_credit numeric; next_mxn numeric; next_all numeric;
            BEGIN
              -- Publish all accumulators together only after every sum succeeds.
              next_credit := _credit + _note_credit;
              next_mxn := _invoice_credit_mxn + _note_credit_mxn;
              next_all := _all_credit_doc + _note_total_doc;
              _credit := next_credit; _invoice_credit_mxn := next_mxn; _all_credit_doc := next_all;
            END;
          END IF;
        END IF;
      EXCEPTION WHEN numeric_value_out_of_range THEN
        _nc_base_factura := NULL; _credit_mxn := NULL;
        _overflows := _overflows + 1;
      END;
      IF _nc_base IS NOT NULL AND _credit_mxn IS NULL THEN
        _nc_no_value := _nc_no_value + 1;
      END IF;
      IF _credit_mxn IS NULL THEN
        -- Discard partial details if any conversion/operation was indeterminate.
        _note_detail := jsonb_build_array(jsonb_build_object(
          'concepto','(nota de crédito)','monto_mxn',NULL));
      END IF;
      _fnc_data := _fnc_data || _note_detail;
    END LOOP;
    IF _invoice_proportional THEN _proportional := _proportional + 1; END IF;
    BEGIN
      IF NOT _invoice_bad THEN
        _net := _subtotal - _credit;
        _net_mxn := public.a_mxn(_subtotal,_factura_moneda,_tc_doc,_tc_doc) - _invoice_credit_mxn;
        _income_total := _income_total + _net_mxn;
      END IF;
    EXCEPTION WHEN numeric_value_out_of_range THEN
      _net := NULL; _net_mxn := NULL; _invoice_bad := true;
      _income_overflow := true; _overflows := _overflows + 1;
    END;
    _net_data := _net_data || jsonb_build_array(jsonb_build_object(
      'id',_invoice.id,'moneda',_factura_moneda,'estado',_invoice.estado,
      'tc_doc',_tc_doc,'monto',_net,'monto_mxn',_net_mxn));
    -- Fiscal receivable is separate from untaxed P&L. Collection has no line lineage.
    <<receivable_lineage>>
    DECLARE
      r_line record; r_note record; r_item jsonb; r_key text; r_cf uuid;
      r_debts jsonb := '{}'; r_note_lines jsonb; r_entry jsonb;
      r_balance numeric; r_pending numeric; r_amount numeric; r_base numeric;
      r_iva numeric; r_isr numeric; r_retiva numeric; r_gross numeric;
      r_bases numeric := 0; r_gross_total numeric := 0; r_net_total numeric := 0;
      r_note_total numeric; r_running numeric; r_previous numeric; r_converted numeric;
      r_positive bigint; r_shipments bigint; r_single uuid; r_rows bigint;
      r_type text; r_value text; r_field text;
      r_decimal constant text := '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$';
    BEGIN
      IF _invoice.estado::text NOT IN ('Emitida','Vencida','Parcialmente pagada','Por timbrar') THEN
        EXIT receivable_lineage;
      END IF;
      r_pending := NULL;
      <<attribute_receivable>>
      BEGIN
        IF _invoice_bad OR _invoice.organization_id IS DISTINCT FROM _org THEN EXIT attribute_receivable; END IF;
        r_balance := public.saldo_factura(_invoice.id);
        IF r_balance IS NULL OR r_balance::text IN ('NaN','Infinity','-Infinity') THEN EXIT attribute_receivable; END IF;
        IF r_balance <= 0 THEN r_pending := 0; EXIT attribute_receivable; END IF;
        -- A wholly single-shipment invoice needs no inferred concept/payment split.
        SELECT count(*),count(DISTINCT cf.embarque_id),min(cf.embarque_id::text)::uuid
          INTO r_rows,r_shipments,r_single
        FROM public.conceptos_factura cf
        WHERE cf.factura_id=_invoice.id AND cf.deleted_at IS NULL;
        IF (r_shipments=0 AND _invoice.embarque_id=_embarque_id)
          OR (r_shipments=1 AND r_single=_embarque_id AND NOT EXISTS (
            SELECT 1 FROM public.conceptos_factura cf WHERE cf.factura_id=_invoice.id
              AND cf.deleted_at IS NULL AND (cf.embarque_id IS NULL OR cf.organization_id IS DISTINCT FROM _org))) THEN
          r_pending := r_balance; EXIT attribute_receivable;
        END IF;
        IF r_rows=0 OR _invoice.subtotal IS NULL OR _invoice.total IS NULL
          OR _invoice.subtotal::text IN ('NaN','Infinity','-Infinity')
          OR _invoice.total::text IN ('NaN','Infinity','-Infinity') THEN EXIT attribute_receivable; END IF;
        FOR r_line IN SELECT cf.* FROM public.conceptos_factura cf
          WHERE cf.factura_id=_invoice.id AND cf.deleted_at IS NULL ORDER BY cf.id
        LOOP
          IF r_line.organization_id IS DISTINCT FROM _org OR r_line.embarque_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM public.embarques e WHERE e.id=r_line.embarque_id
              AND e.organization_id=_org AND e.deleted_at IS NULL) THEN EXIT attribute_receivable; END IF;
          r_type := r_line.tipo_iva;
          r_iva := CASE r_type WHEN 'gravado_16' THEN .16 WHEN 'gravado_8' THEN .08
            WHEN 'tasa_0' THEN 0 WHEN 'exento' THEN 0 WHEN 'no_objeto' THEN 0 END;
          r_base := r_line.total; r_isr := coalesce(r_line.monto_ret_isr,0); r_retiva := coalesce(r_line.monto_ret_iva,0);
          IF r_iva IS NULL OR (r_line.tasa_iva_aplicada IS NOT NULL AND r_line.tasa_iva_aplicada<>r_iva)
            OR r_base IS NULL OR r_base<0 OR r_isr<0 OR r_retiva<0
            OR r_base::text IN ('NaN','Infinity','-Infinity') OR r_isr::text IN ('NaN','Infinity','-Infinity')
            OR r_retiva::text IN ('NaN','Infinity','-Infinity') THEN EXIT attribute_receivable; END IF;
          r_gross := r_base+round(r_base*r_iva,2)-r_isr-r_retiva;
          IF r_gross<0 THEN EXIT attribute_receivable; END IF;
          r_bases := r_bases+r_base; r_gross_total := r_gross_total+r_gross;
          r_key := r_line.embarque_id::text;
          r_debts := jsonb_set(r_debts,ARRAY[r_key],to_jsonb(coalesce((r_debts->>r_key)::numeric,0)+r_gross));
        END LOOP;
        -- Never distribute an undocumented tax/rounding residue across shipments.
        IF r_bases<>_invoice.subtotal OR r_gross_total<>_invoice.total THEN EXIT attribute_receivable; END IF;
        FOR r_note IN SELECT n.* FROM public.factura_notas_credito n
          WHERE n.factura_id=_invoice.id AND n.deleted_at IS NULL
            AND n.estado::text IN ('Timbrada','Aplicada') ORDER BY n.id
        LOOP
          IF r_note.organization_id IS DISTINCT FROM _org OR jsonb_typeof(r_note.conceptos) IS DISTINCT FROM 'array'
            OR jsonb_array_length(r_note.conceptos)=0 OR r_note.monto IS NULL OR r_note.monto<0
            OR r_note.monto::text IN ('NaN','Infinity','-Infinity')
            OR coalesce(r_note.moneda::text,'') NOT IN ('MXN','USD','EUR') THEN EXIT attribute_receivable; END IF;
          IF r_note.moneda::text<>_factura_moneda AND (
            (r_note.moneda::text<>'MXN' AND (r_note.tipo_cambio IS NULL OR r_note.tipo_cambio<=1
              OR r_note.tipo_cambio::text IN ('NaN','Infinity','-Infinity')))
            OR (_factura_moneda<>'MXN' AND (_factura_tc IS NULL OR _factura_tc<=1
              OR _factura_tc::text IN ('NaN','Infinity','-Infinity')))) THEN EXIT attribute_receivable; END IF;
          r_note_lines := '[]'; r_note_total := 0;
          FOR r_item IN SELECT value FROM jsonb_array_elements(r_note.conceptos)
          LOOP
            IF jsonb_typeof(r_item) IS DISTINCT FROM 'object' THEN EXIT attribute_receivable; END IF;
            FOREACH r_field IN ARRAY ARRAY['cantidad','precio_unitario'] LOOP
              r_value := btrim(r_item->>r_field);
              IF coalesce(jsonb_typeof(r_item->r_field),'null') NOT IN ('number','string')
                OR r_value !~ r_decimal THEN EXIT attribute_receivable; END IF;
            END LOOP;
            IF (r_item->>'cantidad')::numeric<=0 OR (r_item->>'precio_unitario')::numeric<0 THEN EXIT attribute_receivable; END IF;
            r_base := round((r_item->>'cantidad')::numeric*(r_item->>'precio_unitario')::numeric,2);
            r_type := r_item->>'tipo_iva';
            r_iva := CASE r_type WHEN 'gravado_16' THEN .16 WHEN 'gravado_8' THEN .08
              WHEN 'tasa_0' THEN 0 WHEN 'exento' THEN 0 WHEN 'no_objeto' THEN 0 END;
            IF r_iva IS NULL THEN EXIT attribute_receivable; END IF;
            r_isr := 0; r_retiva := 0;
            FOREACH r_field IN ARRAY ARRAY['tasa_iva','tasa_ret_isr','tasa_ret_iva'] LOOP
              IF coalesce(jsonb_typeof(r_item->r_field),'null')='null' THEN CONTINUE; END IF;
              r_value := btrim(r_item->>r_field);
              IF jsonb_typeof(r_item->r_field) NOT IN ('number','string') OR r_value !~ r_decimal THEN EXIT attribute_receivable; END IF;
              r_amount := r_value::numeric;
              IF r_amount<0 THEN EXIT attribute_receivable; END IF;
              IF r_field='tasa_iva' AND r_amount<>r_iva THEN EXIT attribute_receivable; END IF;
              IF r_field='tasa_ret_isr' THEN r_isr:=r_amount; END IF;
              IF r_field='tasa_ret_iva' THEN r_retiva:=r_amount; END IF;
            END LOOP;
            r_gross := r_base+round(r_base*r_iva,2)-round(r_base*r_isr,2)-round(r_base*r_retiva,2);
            IF r_gross<0 THEN EXIT attribute_receivable; END IF;
            r_cf := NULL; r_key := NULL;
            IF lower(btrim(r_item->>'concepto_factura_id')) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
              r_cf := lower(btrim(r_item->>'concepto_factura_id'))::uuid;
            END IF;
            SELECT cf.embarque_id::text INTO r_key FROM public.conceptos_factura cf
              WHERE cf.id=r_cf AND cf.factura_id=_invoice.id AND cf.organization_id=_org
                AND cf.deleted_at IS NULL AND cf.embarque_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.embarques e WHERE e.id=cf.embarque_id
                  AND e.organization_id=_org AND e.deleted_at IS NULL);
            IF r_key IS NULL OR NOT (r_debts ? r_key) THEN EXIT attribute_receivable; END IF;
            r_note_total := r_note_total+r_gross;
            r_note_lines := r_note_lines||jsonb_build_array(jsonb_build_object('shipment',r_key,'gross',r_gross));
          END LOOP;
          -- NC.monto is fiscal gross. Do not rescale base or guess a tax rate.
          IF r_note_total<>r_note.monto THEN EXIT attribute_receivable; END IF;
          r_running := 0; r_previous := 0;
          FOR r_entry IN SELECT value FROM jsonb_array_elements(r_note_lines) LOOP
            r_running := r_running+(r_entry->>'gross')::numeric;
            r_converted := public.nc_convertida_a_moneda_factura(r_running,r_note.moneda::text,
              r_note.tipo_cambio,_factura_moneda,_factura_tc);
            r_key := r_entry->>'shipment';
            r_debts := jsonb_set(r_debts,ARRAY[r_key],to_jsonb((r_debts->>r_key)::numeric-(r_converted-r_previous)));
            r_previous := r_converted;
          END LOOP;
        END LOOP;
        IF EXISTS (SELECT 1 FROM jsonb_each_text(r_debts) d WHERE d.value::numeric<0
          OR d.value IN ('NaN','Infinity','-Infinity')) THEN EXIT attribute_receivable; END IF;
        SELECT sum(d.value::numeric),count(*) FILTER (WHERE d.value::numeric>0)
          INTO r_net_total,r_positive FROM jsonb_each_text(r_debts) d;
        r_amount := coalesce((r_debts->>_embarque_id::text)::numeric,0);
        IF r_net_total IS NULL OR r_balance>r_net_total THEN EXIT attribute_receivable; END IF;
        IF r_amount=0 THEN r_pending:=0;
        ELSIF r_balance=r_net_total THEN r_pending:=r_amount; -- no active collection
        ELSIF r_positive=1 THEN r_pending:=r_balance; -- sole remaining debtor
        END IF; -- otherwise collection has no shipment lineage: unknown, not proration
      END attribute_receivable;
      _pending_total := _pending_total+public.a_mxn(r_pending,_factura_moneda,_tc_doc,_tc_doc);
      IF _pending_total::text IN ('NaN','Infinity','-Infinity') THEN _pending_total:=NULL; END IF;
    EXCEPTION WHEN numeric_value_out_of_range OR division_by_zero THEN
      -- Unknown debt must not invalidate independently verified sale income.
      _pending_total := NULL;
    END receivable_lineage;
    -- Preserve positive line attribution; attributed NC details below reconcile
    -- to the same exact/provisional debit as the headline, including NULLs.
    _invoice_valued := NOT _invoice_bad;
    FOR _line_income IN
      SELECT lower(trim(coalesce(nullif(cf.descripcion,''),'(sin concepto)'))) AS concepto,
             cf.total, cf.embarque_id
      FROM public.conceptos_factura cf
      WHERE cf.factura_id = _invoice.id AND cf.deleted_at IS NULL
        AND (cf.embarque_id = _embarque_id OR cf.embarque_id IS NULL)
    LOOP
      _line_mxn := NULL;
      BEGIN
        IF coalesce(_line_income.total,0)::text IN ('NaN','Infinity','-Infinity') THEN
          _invoice_bad := true;
        END IF;
        IF _invoice_valued AND coalesce(_line_income.total,0)::text
          NOT IN ('NaN','Infinity','-Infinity') THEN
          _line_mxn := public.a_mxn(coalesce(_line_income.total,0)
            * CASE WHEN _line_income.embarque_id = _embarque_id THEN 1::numeric ELSE _factor END,
            _factura_moneda,_tc_doc,_tc_doc);
        END IF;
      EXCEPTION WHEN numeric_value_out_of_range THEN
        _invoice_bad := true; _overflows := _overflows + 1;
      END;
      _detail_rows := _detail_rows || jsonb_build_array(jsonb_build_object(
        'concepto',_line_income.concepto,'real_mxn',_line_mxn));
    END LOOP;
    IF _invoice_bad THEN _invoice_no_value := _invoice_no_value + 1; END IF;
  END LOOP;
  _detail_rows := _detail_rows || coalesce((SELECT jsonb_agg(jsonb_build_object(
    'concepto',n.concepto,'real_mxn',-n.monto_mxn))
    FROM jsonb_to_recordset(_fnc_data) n(concepto text,monto_mxn numeric)),'[]'::jsonb);
  FOR _line_income IN SELECT * FROM jsonb_to_recordset(_detail_rows)
    AS x(concepto text,real_mxn numeric)
  LOOP
    _line_name := _line_income.concepto;
    BEGIN
      _detail_sum := CASE WHEN _detail_data ? _line_name
        THEN (_detail_data->>_line_name)::numeric ELSE 0::numeric END;
      _detail_sum := _detail_sum + _line_income.real_mxn;
    EXCEPTION WHEN numeric_value_out_of_range THEN
      _detail_sum := NULL; _income_overflow := true; _overflows := _overflows + 1;
    END;
    _detail_data := jsonb_set(_detail_data,ARRAY[_line_name],coalesce(to_jsonb(_detail_sum),'null'::jsonb));
  END LOOP;
  IF _income_overflow THEN _income_total := NULL; END IF;
  _income_incomplete := _nc_no_base > 0 OR _nc_no_value > 0
    OR _invoice_no_value > 0 OR _proportional > 0 OR _overflows > 0;
  -- Insurance coverage is isolated per policy. Existing supplier cost,
  -- credit-note, debt and detail CTEs below keep their original arithmetic.
  _cov_usd := _tc_usd; _cov_eur := _tc_eur; _cov_org := _org;
  FOR _cov_policy IN SELECT s.* FROM public.seguros_embarque s
    WHERE s.embarque_id = _embarque_id AND s.deleted_at IS NULL
      AND s.proveedor_factura_id IS NOT NULL
    ORDER BY s.id
  LOOP
  -- The reader and existing write trigger use this identical decision block.
  -- B*S/A remains a rational until comparison. No quotient establishes
  -- membership or complete coverage; accounting factors remain unchanged.
  _cov_state := 'sin_atribucion'; _cov_base_mxn := NULL;
  _cov_c := NULL; _cov_n := NULL; _cov_tc := NULL; _cov_full := false;
  <<exact_coverage>>
  BEGIN
    SELECT pf.* INTO _cov_invoice FROM public.proveedor_facturas pf
      WHERE pf.id = _cov_policy.proveedor_factura_id
        AND pf.organization_id = _cov_org
        AND pf.deleted_at IS NULL AND pf.estado::text NOT IN ('Borrador','Cancelada');
    IF NOT FOUND THEN EXIT exact_coverage; END IF;
    IF _cov_invoice.subtotal IS NULL
      OR _cov_invoice.subtotal::text IN ('NaN','Infinity','-Infinity') THEN
      EXIT exact_coverage;
    END IF;
    IF _cov_invoice.subtotal < 0 THEN EXIT exact_coverage; END IF;
    _cov_p := _cov_policy.prima;
    IF _cov_p IS NULL OR _cov_p::text IN ('NaN','Infinity','-Infinity') THEN
      _cov_state := 'sin_valoracion'; EXIT exact_coverage;
    END IF;
    IF _cov_p < 0 THEN _cov_state := 'sin_valoracion'; EXIT exact_coverage; END IF;
    -- Validate BEFORE arithmetic. PostgreSQL numeric multiplication can silently
    -- round at scale 16383; unsupported intermediate scale is unknown/rejected,
    -- never epsilon or a rounded product. Integer-digit overflow is caught below.
    SELECT coalesce(bool_or(pfc.monto::text IN ('NaN','Infinity','-Infinity')
             OR coalesce(nullif(pfc.cantidad,0),1)::text IN ('NaN','Infinity','-Infinity')
             OR scale(pfc.monto)+scale(coalesce(nullif(pfc.cantidad,0),1)) > 16383),false),
           coalesce(bool_or(coalesce(nullif(pfc.cantidad,0),1) < 0),false)
      INTO _cov_bad, _cov_negative
      FROM public.proveedor_facturas_conceptos pfc
      JOIN public.conceptos_costo cc ON cc.id = pfc.concepto_costo_id
      WHERE pfc.proveedor_factura_id = _cov_invoice.id
        AND cc.deleted_at IS NULL AND cc.organization_id = _cov_org
        AND cc.origen <> 'ajuste_factura_proveedor'
        AND (pfc.monto > 0 OR pfc.monto::text IN ('NaN','Infinity','-Infinity'));
    IF _cov_bad THEN _cov_state := 'sin_valoracion'; EXIT exact_coverage; END IF;
    IF _cov_negative THEN _cov_state := 'asignacion_indeterminada'; EXIT exact_coverage; END IF;
    SELECT coalesce(sum(pfc.monto * coalesce(nullif(pfc.cantidad,0),1)),0),
           coalesce(sum(pfc.monto * coalesce(nullif(pfc.cantidad,0),1))
             FILTER (WHERE cc.embarque_id = _cov_policy.embarque_id),0)
      INTO _cov_a, _cov_s
      FROM public.proveedor_facturas_conceptos pfc
      JOIN public.conceptos_costo cc ON cc.id = pfc.concepto_costo_id
      WHERE pfc.proveedor_factura_id = _cov_invoice.id
        AND cc.deleted_at IS NULL AND cc.organization_id = _cov_org
        AND cc.origen <> 'ajuste_factura_proveedor' AND pfc.monto > 0;
    IF _cov_a > 0 AND _cov_s > 0 THEN
      -- Cancel identities symbolically before any potentially large product.
      IF _cov_invoice.subtotal >= _cov_a THEN _cov_c := _cov_s;
      ELSIF _cov_s = _cov_a THEN _cov_c := _cov_invoice.subtotal;
      ELSE
        IF scale(_cov_invoice.subtotal)+scale(_cov_s) > 16383 THEN
          _cov_state := 'sin_valoracion'; EXIT exact_coverage;
        END IF;
        _cov_n := _cov_invoice.subtotal * _cov_s;
      END IF;
    ELSIF _cov_a = 0 AND _cov_invoice.embarque_id = _cov_policy.embarque_id THEN
      _cov_c := _cov_invoice.subtotal;
    ELSE EXIT exact_coverage;
    END IF;
    IF _cov_invoice.moneda::text = _cov_policy.moneda::text THEN
      IF _cov_c IS NOT NULL THEN _cov_full := _cov_c >= _cov_p;
      ELSE
        IF scale(_cov_p)+scale(_cov_a) > 16383 THEN
          _cov_state := 'sin_valoracion'; EXIT exact_coverage;
        END IF;
        _cov_full := _cov_n >= _cov_p * _cov_a;
      END IF;
      _cov_state := CASE WHEN _cov_full THEN 'completa' ELSE 'insuficiente' END;
      -- Nominal eligibility needs no FX. Keep the existing separate diagnostic
      -- that a nominally complete link can still have unvalued accounting cost.
      BEGIN
        SELECT t.tc INTO _cov_tc FROM public.tc_para_documento(
          _cov_invoice.fecha_emision,_cov_invoice.moneda::text,_cov_invoice.tipo_cambio_usd,
          CASE WHEN _cov_invoice.moneda::text = 'EUR' THEN _cov_eur ELSE _cov_usd END) t;
        IF _cov_invoice.moneda::text = 'MXN' OR (_cov_tc > 1
          AND _cov_tc::text NOT IN ('NaN','Infinity','-Infinity')) THEN
          _cov_base_mxn := public.a_mxn(coalesce(_cov_c,
            _cov_invoice.subtotal * (_cov_s / nullif(_cov_a,0))),
            _cov_invoice.moneda::text,_cov_tc,_cov_tc);
          IF _cov_base_mxn::text IN ('NaN','Infinity','-Infinity') THEN _cov_base_mxn := NULL; END IF;
        END IF;
      EXCEPTION WHEN numeric_value_out_of_range OR division_by_zero THEN _cov_base_mxn := NULL;
      END;
      EXIT exact_coverage;
    END IF;
    _cov_state := 'sin_valoracion';
    _cov_fx := CASE WHEN _cov_policy.moneda::text = 'EUR' THEN _cov_eur ELSE _cov_usd END;
    IF _cov_policy.moneda::text <> 'MXN' AND (_cov_fx IS NULL
      OR _cov_fx::text IN ('NaN','Infinity','-Infinity') OR _cov_fx <= 1) THEN EXIT exact_coverage; END IF;
    IF _cov_policy.moneda::text <> 'MXN' AND scale(_cov_p)+scale(_cov_fx) > 16383 THEN EXIT exact_coverage; END IF;
    _cov_r := public.a_mxn(_cov_p,_cov_policy.moneda::text,nullif(_cov_usd,0),nullif(_cov_eur,0));
    IF _cov_r IS NULL OR _cov_r::text IN ('NaN','Infinity','-Infinity') THEN EXIT exact_coverage; END IF;
    -- Premium is stored numeric(14,2); a_mxn foreign output is on the 4-place
    -- grid. Check the precondition rather than silently rely on future schema.
    IF _cov_r <> round(_cov_r,4) THEN EXIT exact_coverage; END IF;
    SELECT t.tc INTO _cov_tc FROM public.tc_para_documento(
      _cov_invoice.fecha_emision,_cov_invoice.moneda::text,_cov_invoice.tipo_cambio_usd,
      CASE WHEN _cov_invoice.moneda::text = 'EUR' THEN _cov_eur ELSE _cov_usd END) t;
    IF _cov_invoice.moneda::text <> 'MXN' AND (_cov_tc IS NULL
      OR _cov_tc::text IN ('NaN','Infinity','-Infinity') OR _cov_tc <= 1) THEN EXIT exact_coverage; END IF;
    IF _cov_c IS NOT NULL THEN
      IF _cov_invoice.moneda::text <> 'MXN' AND scale(_cov_c)+scale(_cov_tc) > 16383 THEN EXIT exact_coverage; END IF;
      _cov_base_mxn := public.a_mxn(_cov_c,_cov_invoice.moneda::text,_cov_tc,_cov_tc);
      IF _cov_base_mxn IS NULL OR _cov_base_mxn::text IN ('NaN','Infinity','-Infinity') THEN EXIT exact_coverage; END IF;
      _cov_full := _cov_base_mxn >= _cov_r;
    ELSIF _cov_invoice.moneda::text = 'MXN' THEN
      IF scale(_cov_r)+scale(_cov_a) > 16383 THEN EXIT exact_coverage; END IF;
      _cov_full := _cov_n >= _cov_r * _cov_a;
      -- This private value is only checked for NULL; no amount is exposed.
      _cov_base_mxn := _cov_invoice.subtotal * (_cov_s / _cov_a);
    ELSIF _cov_invoice.moneda::text IN ('USD','EUR') THEN
      IF scale(_cov_n)+scale(_cov_tc) > 16383
        OR scale(_cov_r)+scale(_cov_a) > 16383 THEN EXIT exact_coverage; END IF;
      -- EXACT inverse of existing round(nonnegative MXN,4), half away from 0.
      -- 20000 is twice the currency grid; it is not a new monetary tolerance.
      _cov_full := _cov_r <= 0 OR 20000 * _cov_n * _cov_tc >= (20000 * _cov_r - 1) * _cov_a;
      _cov_base_mxn := public.a_mxn(_cov_invoice.subtotal * (_cov_s / _cov_a),
        _cov_invoice.moneda::text,_cov_tc,_cov_tc);
    ELSE EXIT exact_coverage;
    END IF;
    _cov_state := CASE WHEN _cov_full THEN 'completa' ELSE 'insuficiente' END;
  EXCEPTION WHEN numeric_value_out_of_range OR division_by_zero THEN
    -- One unrepresentable coverage may not abort all other P&L documents.
    -- The existing writer turns this same unknown state into its coverage error.
    _cov_state := 'sin_valoracion'; _cov_base_mxn := NULL;
  END exact_coverage;
    _cov_data := _cov_data || jsonb_build_array(jsonb_build_object(
      'estado',_cov_state,'base_mxn',_cov_base_mxn));
  END LOOP;
  WITH
  -- P1 (v13.823.274): el presupuesto usa EXCLUSIVAMENTE el T/C congelado del
  -- embarque (misma base que la pestaña Costos). Antes se derivaba del DOF de
  -- ETA/ETD, por lo que el presupuesto cambiaba al mover la ETA.
  cv AS (
    SELECT lower(trim(coalesce(descripcion,'(sin concepto)'))) AS concepto,
           moneda::text AS moneda, coalesce(total,0)::numeric AS monto,
           CASE WHEN UPPER(moneda::text) = 'EUR' THEN NULLIF(_tc_eur,0) ELSE NULLIF(_tc_usd,0) END AS tc_doc
    FROM public.conceptos_venta
    WHERE embarque_id = _embarque_id AND deleted_at IS NULL
  ),
  cc AS (
    SELECT lower(trim(coalesce(concepto,'(sin concepto)'))) AS concepto,
           moneda::text AS moneda, coalesce(monto,0)::numeric AS monto,
           proveedor_id, coalesce(proveedor_nombre,'(sin proveedor)') AS proveedor_nombre,
           CASE WHEN UPPER(moneda::text) = 'EUR' THEN NULLIF(_tc_eur,0) ELSE NULLIF(_tc_usd,0) END AS tc_doc
    FROM public.conceptos_costo
    WHERE embarque_id = _embarque_id AND deleted_at IS NULL
  ),
  seg AS (
    SELECT 'seguro de carga'::text AS concepto, moneda::text AS moneda,
           coalesce(prima,0)::numeric AS monto,
           NULL::uuid AS proveedor_id, aseguradora AS proveedor_nombre,
           CASE WHEN UPPER(moneda::text) = 'EUR' THEN NULLIF(_tc_eur,0) ELSE NULLIF(_tc_usd,0) END AS tc_doc
    FROM public.seguros_embarque s
    WHERE s.embarque_id = _embarque_id AND s.deleted_at IS NULL
      -- An existing link is never replaced with a guessed premium/residual.
      -- Its current coverage is diagnosed below from the same canonical pf.
      AND s.proveedor_factura_id IS NULL
  ),
  -- C29 (v13.823.381): una factura fusionada puede cubrir VARIOS embarques
  -- (`factura_embarques` + `conceptos_factura.embarque_id`). Antes se filtraba
  -- por `facturas.embarque_id`, así que el total completo caía en el embarque
  -- del header y los demás quedaban en cero.
  --
  -- Regla de atribución (sólo lectura; no cambia importes guardados):
  --   * Si la factura tiene líneas etiquetadas con embarque, el factor de este
  --     embarque = (líneas de este embarque) / (líneas etiquetadas). La suma de
  --     los factores de todos los embarques es 1, así que el total no se
  --     duplica ni se infla entre P&L.
  --   * Si NO tiene líneas etiquetadas (facturas legacy), se usa el embarque
  --     del header con factor 1 (comportamiento anterior).
  -- Los importes de nivel factura (nota de crédito y saldo) se reparten con el
  -- MISMO factor: es una asignación proporcional explícita a los importes de
  -- las líneas, no un dato fiscal nuevo.
  f_neto AS (
    SELECT * FROM jsonb_to_recordset(_net_data) AS x(id uuid,moneda text,estado text,
      tc_doc numeric,monto numeric,monto_mxn numeric)
  ),
  -- Audit 124/130: allocations and fiscal lines are two representations of
  -- the same expense. Allocations define membership; the header is a fallback
  -- only when there are no active, non-budget-adjustment allocations.
  pf_cand AS (
    SELECT pf.id, pf.proveedor_id, coalesce(pf.proveedor_nombre,'(sin proveedor)') AS proveedor_nombre,
           pf.embarque_id, pf.total, pf.subtotal::numeric AS base_gravable,
           pf.moneda::text AS moneda, pf.estado::text AS estado,
           (SELECT t.tc FROM public.tc_para_documento(pf.fecha_emision, pf.moneda::text,
             pf.tipo_cambio_usd, CASE WHEN pf.moneda::text = 'EUR' THEN _tc_eur ELSE _tc_usd END) t) AS tc_doc
    FROM public.proveedor_facturas pf
    WHERE pf.deleted_at IS NULL AND pf.organization_id = _org
      AND pf.estado::text NOT IN ('Borrador','Cancelada')
      AND (pf.embarque_id = _embarque_id OR EXISTS (
        SELECT 1 FROM public.proveedor_facturas_conceptos pfc
        JOIN public.conceptos_costo cc ON cc.id = pfc.concepto_costo_id
        WHERE pfc.proveedor_factura_id = pf.id AND cc.embarque_id = _embarque_id
          AND cc.deleted_at IS NULL AND cc.origen <> 'ajuste_factura_proveedor'))
  ),
  pf_asignaciones AS (
    SELECT pfc.proveedor_factura_id AS factura_id, cc.embarque_id,
           lower(trim(coalesce(nullif(pfc.descripcion,''),cc.concepto,'(sin concepto)'))) AS concepto,
           pfc.monto * coalesce(nullif(pfc.cantidad,0),1) AS monto,
           coalesce(nullif(pfc.cantidad,0),1) AS cantidad_efectiva
    FROM public.proveedor_facturas_conceptos pfc
    JOIN pf_cand pf ON pf.id = pfc.proveedor_factura_id
    JOIN public.conceptos_costo cc ON cc.id = pfc.concepto_costo_id
    WHERE cc.deleted_at IS NULL AND cc.organization_id = _org
      AND cc.origen <> 'ajuste_factura_proveedor'
      AND pfc.monto > 0
  ),
  pf_reparto AS (
    SELECT pf.*,
           coalesce((SELECT sum(a.monto) FROM pf_asignaciones a WHERE a.factura_id = pf.id),0) AS asignado,
           coalesce((SELECT sum(a.monto) FROM pf_asignaciones a WHERE a.factura_id = pf.id
             AND a.embarque_id = _embarque_id),0) AS asignado_embarque
    FROM pf_cand pf
  ),
  -- Partial allocation is not permission to expand it. Unassigned residue
  -- remains unassigned, even with an inbox/header origin, and qualifies profit.
  -- A fiscal edit can reduce the invoice below its preserved allocations. Cap
  -- that provisional split proportionally so cost/credit/debt never exceed the
  -- document, without mutating links or treating the distribution as complete.
  pf AS (
    SELECT p.*, CASE WHEN asignado > 0 THEN asignado_embarque / greatest(base_gravable,asignado)
                    WHEN embarque_id = _embarque_id THEN 1::numeric ELSE 0::numeric END AS factor
    FROM pf_reparto p
    WHERE asignado_embarque > 0 OR (asignado = 0 AND embarque_id = _embarque_id)
  ),
  -- Coverage decisions are exact and guarded above, independent of rounded
  -- accounting factors. Aggregate diagnostics retain their existing contract.
  seg_cobertura AS (
    SELECT * FROM jsonb_to_recordset(_cov_data) AS x(estado text,base_mxn numeric)
  ),
  pnc AS (
    -- Expense base is explicit, not gross credit / a guessed tax rate.
    -- Legacy credits without base remain unvalued and qualify the result.
    SELECT n.proveedor_factura_id,
           public.monto_pago_en_moneda_factura(n.subtotal, n.moneda::text, n.tipo_cambio, pf.moneda)
             * pf.factor AS base,
           CASE WHEN n.moneda::text = 'MXN' THEN n.subtotal
                WHEN n.tipo_cambio_mxn > 0 THEN n.subtotal * n.tipo_cambio_mxn END * pf.factor AS base_mxn,
           pf.moneda
    FROM public.proveedor_notas_credito n JOIN pf ON pf.id = n.proveedor_factura_id
    WHERE n.deleted_at IS NULL AND n.estado::text = 'Aplicada'
  ),
  pf_neto AS (
    SELECT pf.id, pf.proveedor_id, pf.proveedor_nombre, pf.moneda, pf.estado, pf.tc_doc,
           pf.base_gravable * pf.factor
             - coalesce((SELECT sum(base) FROM pnc WHERE proveedor_factura_id = pf.id),0) AS monto,
           public.a_mxn(pf.base_gravable * pf.factor, pf.moneda, pf.tc_doc, pf.tc_doc)
             - coalesce((SELECT sum(base_mxn) FROM pnc WHERE proveedor_factura_id = pf.id),0) AS monto_mxn
    FROM pf
  ),
  pf_saldo AS (
    SELECT pf.id, pf.moneda, pf.estado, pf.tc_doc,
           GREATEST(pf.total
             - coalesce((SELECT sum(public.monto_pago_en_moneda_factura(n.monto, n.moneda::text, n.tipo_cambio, pf.moneda))
                 FROM public.proveedor_notas_credito n WHERE n.proveedor_factura_id = pf.id
                   AND n.deleted_at IS NULL AND n.estado::text = 'Aplicada'),0)
             - coalesce((SELECT sum(pp.monto_en_moneda_factura) FROM public.pagos_proveedor pp
                 WHERE pp.proveedor_factura_id = pf.id AND pp.deleted_at IS NULL),0), 0) * pf.factor AS saldo
    FROM pf
  ),
  pf_detalle AS (
    -- Allocated lines replace fiscal lines, and never include budget adjustments.
    -- Apply the same cap as the headline; partial allocations are not expanded.
    SELECT pf.id, a.concepto, pf.moneda, pf.tc_doc,
           a.monto * pf.base_gravable / greatest(pf.base_gravable,pf.asignado) AS monto
    FROM pf JOIN pf_asignaciones a ON a.factura_id = pf.id
    WHERE a.embarque_id = _embarque_id
    UNION ALL
    -- Fiscal monto is a unit amount: quantity is applied exactly once.
    SELECT pf.id, lower(trim(coalesce(nullif(pfc.descripcion,''),'(sin concepto)'))),
           pf.moneda, pf.tc_doc, pfc.monto * coalesce(nullif(pfc.cantidad,0),1)
    FROM pf JOIN public.proveedor_facturas_conceptos pfc ON pfc.proveedor_factura_id = pf.id
    WHERE pf.asignado = 0 AND pfc.concepto_costo_id IS NULL
    UNION ALL
    -- Reconcile missing/partial fiscal detail explicitly to the document base.
    SELECT pf.id, '(factura completa / base sin detalle)'::text, pf.moneda, pf.tc_doc,
           pf.base_gravable - coalesce((SELECT sum(pfc.monto * coalesce(nullif(pfc.cantidad,0),1))
             FROM public.proveedor_facturas_conceptos pfc
             WHERE pfc.proveedor_factura_id = pf.id AND pfc.concepto_costo_id IS NULL),0)
    FROM pf WHERE pf.asignado = 0
  ),
  -- Audit 129: a premium or an unrelated invoice cannot document an active
  -- operational concept. Only its explicit positive effective allocation to a
  -- current canonical supplier invoice establishes documentary presence.
  -- This does not compare the invoiced amount with the budget or alter 124/130.
  cc_documentacion AS (
    SELECT EXISTS (
      SELECT 1 FROM public.proveedor_facturas_conceptos pfc
      JOIN pf ON pf.id = pfc.proveedor_factura_id
      WHERE pfc.concepto_costo_id = c.id AND pfc.monto > 0
        AND pfc.monto * coalesce(nullif(pfc.cantidad,0),1) > 0
    ) AS documentado
    FROM public.conceptos_costo c
    WHERE c.embarque_id = _embarque_id AND c.organization_id = _org
      AND c.deleted_at IS NULL AND c.origen <> 'ajuste_factura_proveedor'
  ),
  estado_costos AS (
    SELECT CASE WHEN (NOT EXISTS (SELECT 1 FROM pf) AND NOT EXISTS (SELECT 1 FROM seg))
      OR EXISTS (SELECT 1 FROM cc_documentacion WHERE NOT documentado)
      OR EXISTS (SELECT 1 FROM pnc WHERE base IS NULL OR base_mxn IS NULL)
      OR EXISTS (SELECT 1 FROM pf WHERE asignado > 0 AND abs(base_gravable - asignado) > 0.01)
      OR EXISTS (SELECT 1 FROM pf WHERE moneda <> 'MXN' AND tc_doc IS NULL)
      OR EXISTS (SELECT 1 FROM seg WHERE moneda <> 'MXN' AND tc_doc IS NULL)
      OR EXISTS (SELECT 1 FROM seg_cobertura WHERE estado <> 'completa' OR base_mxn IS NULL)
      THEN 'incompleto' ELSE 'completo' END AS estado
  ),
  totales AS (
    SELECT
      _income_total AS venta_real_mxn,
      (SELECT coalesce(sum(monto_mxn),0) FROM pf_neto)
        + (SELECT coalesce(sum(public.a_mxn(monto, moneda, tc_doc, tc_doc)),0) FROM seg) AS costo_real_mxn
  )
  SELECT jsonb_build_object(
    'embarque_id', _embarque_id,
    'tipo_cambio_usd', _tc_usd,
    'tipo_cambio_eur', _tc_eur,
    'estado_costos', (SELECT estado FROM estado_costos),
    'estado_ingresos', CASE WHEN _income_incomplete THEN 'incompleto' ELSE 'completo' END,
    'ingresos_documentacion', jsonb_build_object(
      'evaluada',true,'facturas',_invoice_count,'notas_credito_activas',_active_nc,
      'notas_credito_sin_base',_nc_no_base,'notas_credito_sin_valoracion',_nc_no_value,
      'facturas_sin_valoracion',_invoice_no_value,'repartos_provisionales',_proportional,
      'desbordamientos',_overflows
    ),
    -- Aggregate presence only; no guessed links, budget equality or identities.
    'costos_documentacion', jsonb_build_object(
      'evaluada', true,
      'conceptos', (SELECT count(*) FROM cc_documentacion),
      'documentados', (SELECT count(*) FROM cc_documentacion WHERE documentado),
      'sin_documentar', (SELECT count(*) FROM cc_documentacion WHERE NOT documentado)
    ),
    -- Additive aggregate only: no new invoice/policy identities or candidates.
    'seguros_cobertura', jsonb_build_object(
      'evaluada', true,
      'vinculados', (SELECT count(*) FROM seg_cobertura),
      'completos', (SELECT count(*) FROM seg_cobertura WHERE estado = 'completa'),
      'inconsistentes', (SELECT count(*) FROM seg_cobertura WHERE estado <> 'completa'),
      'sin_atribucion', (SELECT count(*) FROM seg_cobertura WHERE estado = 'sin_atribucion'),
      'asignacion_indeterminada', (SELECT count(*) FROM seg_cobertura WHERE estado = 'asignacion_indeterminada'),
      'sin_valoracion', (SELECT count(*) FROM seg_cobertura WHERE estado = 'sin_valoracion'),
      'insuficientes', (SELECT count(*) FROM seg_cobertura WHERE estado = 'insuficiente')
    ),
    'notas_credito_sin_base', (SELECT count(*) FROM pnc WHERE base IS NULL OR base_mxn IS NULL),
    'costo_sin_asignar_mxn', (SELECT coalesce(sum(public.a_mxn(greatest(base_gravable-asignado,0), moneda,tc_doc,tc_doc)),0) FROM pf WHERE asignado > 0),
    'facturas_sobreasignadas', (SELECT count(*) FROM pf WHERE asignado > base_gravable + 0.01),
    'costo_sobreasignado_mxn', (SELECT coalesce(sum(public.a_mxn(greatest(asignado-base_gravable,0), moneda,tc_doc,tc_doc)),0) FROM pf WHERE asignado > 0),
    'tc_por_documento', true,
    'excluidos_sin_tc', (
      (SELECT count(*) FROM cv WHERE moneda <> 'MXN' AND tc_doc IS NULL)
      + (SELECT count(*) FROM cc WHERE moneda <> 'MXN' AND tc_doc IS NULL)
      + (SELECT count(*) FROM f_neto WHERE moneda <> 'MXN' AND tc_doc IS NULL)
      + (SELECT count(*) FROM pf_neto WHERE moneda <> 'MXN' AND tc_doc IS NULL)
    ),
    'venta', jsonb_build_object(
      'presupuestada_mxn', (SELECT coalesce(sum(public.a_mxn(monto, moneda, tc_doc, tc_doc)),0) FROM cv),
      'real_mxn', t.venta_real_mxn,
      'pdte_cobro_mxn', _pending_total
    ),
    'costo', jsonb_build_object(
      'presupuestado_mxn', (SELECT coalesce(sum(public.a_mxn(monto, moneda, tc_doc, tc_doc)),0) FROM cc),
      'real_mxn', t.costo_real_mxn,
      'pdte_pago_mxn', (SELECT coalesce(sum(public.a_mxn(saldo, moneda, tc_doc, tc_doc)),0)
                         FROM pf_saldo)
    ),
    'utilidad_mxn', NULL,
    'por_concepto', (
      SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.real_mxn DESC NULLS LAST, x.presupuestada_mxn DESC), '[]'::jsonb) FROM (
        SELECT concepto,
               coalesce(sum(presup),0) AS presupuestada_mxn,
               CASE WHEN count(*) FILTER (WHERE real IS NULL)>0 THEN NULL
                 ELSE coalesce(sum(real),0) END AS real_mxn
        FROM (
          SELECT concepto,
                 public.a_mxn(monto, moneda, tc_doc, tc_doc) AS presup,
                 0::numeric AS real FROM cv
          UNION ALL
          SELECT d.key, 0::numeric, (d.value #>> '{}')::numeric
          FROM jsonb_each(_detail_data) d
        ) u GROUP BY concepto
      ) x
    ),
    'por_concepto_costo', (
      SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY (x.presupuestado_mxn + x.real_mxn) DESC), '[]'::jsonb) FROM (
        SELECT concepto,
               coalesce(sum(presup),0) AS presupuestado_mxn,
               coalesce(sum(real),0) AS real_mxn
        FROM (
          SELECT concepto,
                 public.a_mxn(monto, moneda, tc_doc, tc_doc) AS presup,
                 0::numeric AS real FROM cc
          UNION ALL
          SELECT concepto, 0::numeric, public.a_mxn(monto, moneda, tc_doc, tc_doc)
          FROM pf_detalle WHERE monto <> 0
          UNION ALL
          SELECT '(nota de crédito proveedor)'::text, 0::numeric,
                 -pnc.base_mxn
          FROM pnc JOIN pf ON pf.id = pnc.proveedor_factura_id
          UNION ALL
          SELECT concepto, 0::numeric,
                 public.a_mxn(monto, moneda, tc_doc, tc_doc)
          FROM seg
        ) u GROUP BY concepto
      ) x
    ),
    'por_proveedor', (
      SELECT coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) FROM (
        SELECT u.proveedor_id, coalesce(max(p.nombre), max(u.proveedor_nombre)) AS proveedor_nombre,
               coalesce(sum(presup_mxn),0) AS presupuestado_mxn,
               coalesce(sum(real_mxn),0) AS real_mxn,
               coalesce(sum(facturas_count),0) AS facturas_count
        FROM (
          SELECT proveedor_id, proveedor_nombre,
                 public.a_mxn(monto, moneda, tc_doc, tc_doc) AS presup_mxn,
                 0::numeric AS real_mxn, 0 AS facturas_count, false AS es_seguro FROM cc
          UNION ALL SELECT proveedor_id, proveedor_nombre, 0::numeric,
                 monto_mxn, 1, false FROM pf_neto
          UNION ALL SELECT proveedor_id, proveedor_nombre, 0::numeric,
                 public.a_mxn(monto, moneda, tc_doc, tc_doc), 1, true FROM seg
        ) u LEFT JOIN public.proveedores p
          ON p.id = u.proveedor_id AND p.organization_id = _org AND p.deleted_at IS NULL
        GROUP BY u.proveedor_id, CASE WHEN u.proveedor_id IS NULL THEN u.proveedor_nombre END, u.es_seguro
      ) x
    )
  ) INTO _base FROM totales t;
  BEGIN
    IF NOT _income_incomplete AND _base->>'estado_costos' = 'completo' THEN
      _net := round((_base#>>'{venta,real_mxn}')::numeric - (_base#>>'{costo,real_mxn}')::numeric,2);
      _base := _base || jsonb_build_object('utilidad_mxn',_net,'margen_real_pct',
        CASE WHEN (_base#>>'{venta,real_mxn}')::numeric > 0
          THEN _net / (_base#>>'{venta,real_mxn}')::numeric * 100 ELSE NULL END);
    ELSE
      _base := _base || jsonb_build_object('margen_real_pct',NULL);
    END IF;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    _base := _base || jsonb_build_object('utilidad_mxn',NULL,'margen_real_pct',NULL,
      'estado_ingresos','incompleto');
    _base := jsonb_set(_base,'{ingresos_documentacion,desbordamientos}',to_jsonb(_overflows+1));
  END;
  RETURN _base;
END;
$function$;

REVOKE ALL ON FUNCTION public.pnl_financiero_embarque(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pnl_financiero_embarque(uuid) TO authenticated, service_role;

--> statement-breakpoint

-- supabase/schema/embarques/cerrar_embarque.sql
-- Espejo canónico de public.cerrar_embarque
-- Fuente vigente (mayor timestamp): 20260911000100_replay_cerrar_reabrir_org_scope_helper_service_role.sql
-- Vigilado por `bun run audit:replay-mirror` y `audit:schema-functions`.
-- DEFECTO 1 (P0, cross-tenant): el rol se valida EN LA ORG DEL EMBARQUE
-- (v_emb.organization_id) tras el SELECT ... FOR UPDATE, no de forma global.

CREATE OR REPLACE FUNCTION public._cerrar_embarque_confirmado(p_embarque_id uuid, p_forzar boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_emb embarques%ROWTYPE;
  v_uid uuid := auth.uid();
  v_validacion jsonb;
  v_snapshot jsonb;
  v_pnl jsonb;
  v_is_admin boolean;
  v_forzado boolean := false;
  v_automatico boolean := COALESCE(current_setting('app.cierre_automatico', true), 'off') = 'on';
  -- BL-09: cursor de recálculo de comisiones pendientes.
  v_pago_recalc uuid;
  v_recalculadas int := 0;
BEGIN
  IF v_uid IS NULL AND NOT v_automatico THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  SELECT * INTO v_emb FROM embarques WHERE id = p_embarque_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Embarque no encontrado';
  END IF;
  -- DEFECTO 1: el rol se valida EN LA ORG DEL EMBARQUE (v_emb.organization_id),
  -- no de forma global. super_admin sigue autorizado globalmente por la
  -- semántica ya embebida en has_any_role_in_org_exact.
  v_is_admin :=
    NOT v_automatico AND
    public.has_any_role_in_org_exact(v_uid, ARRAY['admin','admin_org']::app_role[], v_emb.organization_id);
  IF NOT v_automatico AND NOT (
    v_is_admin OR
    public.has_any_role_in_org_exact(v_uid, ARRAY['gerente_operaciones','coordinador_logistico']::app_role[], v_emb.organization_id)
  ) THEN
    RAISE EXCEPTION 'No autorizado para cerrar embarques. Esta acción es responsabilidad del coordinador logístico.';
  END IF;
  IF p_forzar AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo administración puede autorizar un cierre forzado' USING ERRCODE = '42501';
  END IF;
  IF v_emb.estado::text = 'Cerrado' THEN
    RAISE EXCEPTION 'El embarque ya está cerrado';
  END IF;
  IF v_emb.estado::text NOT IN ('Entregado','EIR','Por liquidar') THEN
    RAISE EXCEPTION 'Solo se pueden cerrar embarques en estado Entregado, EIR o Por liquidar (actual: %)', v_emb.estado::text;
  END IF;
  v_validacion := validar_cierre_embarque(p_embarque_id);
  IF NOT COALESCE((v_validacion->>'puede_cerrar')::boolean, false) THEN
    IF v_automatico THEN
      RAISE EXCEPTION 'LC_CIERRE_AUTOMATICO_NO_APLICA';
    ELSIF v_is_admin AND p_forzar THEN
      v_forzado := true;
    ELSE
      RAISE EXCEPTION 'Validaciones de cierre no satisfechas: %', v_validacion::text;
    END IF;
  END IF;
  BEGIN
    v_pnl := pnl_financiero_embarque(p_embarque_id);
  EXCEPTION WHEN OTHERS THEN
    v_pnl := '{}'::jsonb;
  END;
  v_snapshot := jsonb_build_object(
    'cerrado_at', now(),
    'cerrado_por', v_uid,
    'forzado_admin', v_forzado,
    'automatico', v_automatico,
    'pnl', v_pnl,
    'validaciones', v_validacion,
    'totales', jsonb_build_object(
      'cxc_total', (SELECT COALESCE(sum(total),0) FROM facturas WHERE embarque_id = p_embarque_id AND deleted_at IS NULL AND estado <> 'Cancelada'),
      'cxp_total', (SELECT COALESCE(sum(total),0) FROM proveedor_facturas WHERE embarque_id = p_embarque_id AND deleted_at IS NULL AND estado <> 'Cancelada'),
      'seguros_prima_total', (SELECT COALESCE(sum(prima),0) FROM seguros_embarque WHERE embarque_id = p_embarque_id AND deleted_at IS NULL)
    )
  );
  PERFORM set_config('app.bypass_cierre','on', true);
  UPDATE embarques
     SET estado = 'Cerrado'::estado_embarque,
         cerrado_at = now(),
         cerrado_por = v_uid,
         cerrado_snapshot = v_snapshot,
         reabierto_at = NULL,
         reabierto_por = NULL,
         reabierto_motivo = NULL,
         updated_at = now()
   WHERE id = p_embarque_id;
  FOR v_pago_recalc IN
    SELECT pf.id
      FROM pagos_factura pf
      JOIN facturas f ON f.id = pf.factura_id
      JOIN comisiones_devengadas cd ON cd.pago_factura_id = pf.id
     WHERE f.embarque_id = p_embarque_id
       AND pf.deleted_at IS NULL
       AND cd.estado = 'Devengada'
       AND cd.nota IS NOT NULL
     ORDER BY pf.id
  LOOP
    BEGIN
      PERFORM public.calcular_comision_pago(v_pago_recalc);
      v_recalculadas := v_recalculadas + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'BL-09: recálculo de comisión del pago % falló: % %', v_pago_recalc, SQLSTATE, SQLERRM;
    END;
  END LOOP;
  UPDATE comisiones_devengadas
     SET definitiva = true,
         pnl_base = COALESCE((v_pnl->>'utilidad_mxn')::numeric, (v_pnl->>'utilidad')::numeric, 0),
         calculo_snapshot = v_pnl,
         updated_at = now()
   WHERE embarque_id = p_embarque_id;
  PERFORM set_config('app.bypass_cierre','off', true);
  INSERT INTO cierre_embarque_log(embarque_id, organization_id, accion, usuario_id, motivo, snapshot)
  VALUES (
    p_embarque_id,
    v_emb.organization_id,
    CASE WHEN v_forzado THEN 'cerrar_forzado'
         WHEN v_automatico THEN 'cerrar_automatico'
         ELSE 'cerrar' END,
    v_uid,
    CASE WHEN v_forzado THEN 'Cierre forzado por administrador con checklist incompleto'
         WHEN v_automatico THEN 'Cierre automático: se liquidó el último saldo por cobrar y por pagar'
         ELSE NULL END,
    v_snapshot
  );
  PERFORM public.registrar_bitacora(
    'embarques',
    CASE WHEN v_forzado THEN 'cerrar_embarque_forzado'
         WHEN v_automatico THEN 'cerrar_embarque_automatico'
         ELSE 'cerrar_embarque' END,
    p_embarque_id,
    COALESCE(v_emb.expediente, ''),
    v_snapshot,
    v_emb.organization_id,
    v_uid
  );
  RETURN jsonb_build_object('ok', true, 'forzado_admin', v_forzado, 'automatico', v_automatico,
                            'comisiones_recalculadas', v_recalculadas,
                            'snapshot', v_snapshot);
END;
$$;

REVOKE ALL ON FUNCTION public._cerrar_embarque_confirmado(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cerrar_embarque(p_embarque_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public._cerrar_embarque_confirmado(p_embarque_id, false)
$$;

REVOKE ALL ON FUNCTION public.cerrar_embarque(p_embarque_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cerrar_embarque(p_embarque_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cerrar_embarque(p_embarque_id uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.forzar_cierre_embarque(p_embarque_id uuid, p_confirmacion text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_confirmacion IS DISTINCT FROM 'FORZAR CIERRE' THEN
    RAISE EXCEPTION 'Confirma el cierre forzado de forma explícita' USING ERRCODE = '22023';
  END IF;
  RETURN public._cerrar_embarque_confirmado(p_embarque_id, true);
END;
$$;
REVOKE ALL ON FUNCTION public.forzar_cierre_embarque(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forzar_cierre_embarque(uuid, text) TO authenticated;

--> statement-breakpoint

-- supabase/schema/embarques/reabrir_embarque.sql
-- Espejo canónico de public.reabrir_embarque
-- Fuente vigente (mayor timestamp): 20260911000100_replay_cerrar_reabrir_org_scope_helper_service_role.sql
-- Vigilado por `bun run audit:replay-mirror` y `audit:schema-functions`.
-- DEFECTO 1 (consistencia): el check de admin ahora es org-scoped
-- (has_any_role_in_org_exact) en vez de has_role() global.

CREATE OR REPLACE FUNCTION public.reabrir_embarque(p_embarque_id uuid, p_usuario_email text, p_motivo text, p_request_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_estado_actual text;
  v_resp jsonb;
  v_es_admin boolean;
  v_motivo text := NULLIF(trim(COALESCE(p_motivo, '')), '');
  v_actor_id uuid := auth.uid();
  v_actor_email text;
BEGIN
  SELECT email INTO v_actor_email FROM auth.users WHERE id = v_actor_id;
  v_actor_email := COALESCE(v_actor_email, 'usuario:' || COALESCE(v_actor_id::text, 'desconocido'));

  IF v_motivo IS NULL OR length(v_motivo) < 20 THEN
    RAISE EXCEPTION 'Motivo de reapertura requerido (mínimo 20 caracteres)';
  END IF;

  SELECT organization_id
    INTO v_org_id
    FROM embarques
   WHERE id = p_embarque_id
     AND deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Embarque no encontrado';
  END IF;

  v_es_admin := public.has_any_role_in_org_exact(v_actor_id, ARRAY['admin','admin_org']::app_role[], v_org_id);
  IF NOT v_es_admin THEN
    RAISE EXCEPTION 'Solo administradores pueden reabrir embarques cerrados';
  END IF;

  PERFORM public._assert_writer(v_org_id);

  v_resp := public.idempotency_claim(p_request_id, 'reabrir_embarque');
  IF v_resp IS NOT NULL THEN
    IF v_resp ? 'id' AND (v_resp->>'id')::uuid IS DISTINCT FROM p_embarque_id THEN
      RAISE EXCEPTION 'LC_REAPERTURA_INTENTO_DISTINTO: el intento corresponde a otro embarque'
        USING ERRCODE = '22023';
    END IF;
    IF v_resp ? 'motivo' AND v_resp->>'motivo' IS DISTINCT FROM v_motivo THEN
      RAISE EXCEPTION 'LC_REAPERTURA_INTENTO_DISTINTO: el intento se guardó con otro motivo'
        USING ERRCODE = '22023';
    END IF;
    RETURN v_resp - 'motivo';
  END IF;

  SELECT estado::text INTO v_estado_actual
  FROM embarques
  WHERE id = p_embarque_id AND organization_id = v_org_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Embarque no encontrado';
  END IF;

  IF v_estado_actual <> 'Cerrado' THEN
    RAISE EXCEPTION 'Solo embarques en estado Cerrado pueden reabrirse (estado actual: %)', v_estado_actual;
  END IF;

  PERFORM set_config('app.bypass_cierre','on', true);
  PERFORM set_config('app.bypass_transicion','on', true);

  UPDATE embarques
     SET estado = 'Por liquidar'::estado_embarque,
         cerrado_snapshot = NULL,
         reabierto_at = now(),
         reabierto_por = auth.uid(),
         reabierto_motivo = v_motivo,
         updated_at = now()
   WHERE id = p_embarque_id;

  PERFORM set_config('app.bypass_transicion','off', true);

  UPDATE comisiones_devengadas
     SET definitiva = false,
         pnl_base = NULL,
         calculo_snapshot = NULL,
         updated_at = now()
   WHERE embarque_id = p_embarque_id;

  PERFORM set_config('app.bypass_cierre','off', true);

  INSERT INTO notas_embarque (embarque_id, contenido, tipo, usuario, organization_id)
  VALUES (p_embarque_id, 'Embarque reabierto desde Cerrado a Por liquidar. Motivo: ' || v_motivo,
          'cambio_estado'::tipo_nota, v_actor_email, v_org_id);

  INSERT INTO eventos_embarque (embarque_id, tipo, descripcion, ubicacion, fecha, usuario, organization_id)
  VALUES (p_embarque_id, 'Otro'::tipo_evento_tracking, 'Embarque reabierto por administrador', '', now(), v_actor_email, v_org_id);

  BEGIN
    INSERT INTO cierre_embarque_log(embarque_id, organization_id, accion, usuario_id, motivo, snapshot)
    VALUES (p_embarque_id, v_org_id, 'reabrir', auth.uid(), v_motivo, NULL);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM public.registrar_bitacora(
    'embarques', 'reabrir_embarque', p_embarque_id, '',
    jsonb_build_object('motivo', v_motivo), v_org_id, auth.uid()
  );

  v_resp := jsonb_build_object('id', p_embarque_id, 'estado', 'Por liquidar');
  PERFORM public.idempotency_store(p_request_id, v_resp || jsonb_build_object('motivo', v_motivo));
  RETURN v_resp;
END;
$function$;

REVOKE ALL ON FUNCTION public.reabrir_embarque(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_embarque(uuid, text, text, uuid) TO authenticated, service_role;

--> statement-breakpoint

-- supabase/schema/facturacion/assert_factura_viva_para_pago.sql
-- Fuente canónica de public.assert_factura_viva_para_pago() (trigger de pagos_factura).
-- Ola 1 (major release): notas de crédito CONVERTIDAS a la moneda de la factura
-- (canon public.nc_aplicadas_en_moneda_factura), tolerancia unificada en 0.005
-- (medio centavo, igual que tg_pago_factura_no_sobrepago) y guard de fecha
-- futura al alta del cobro (espejo de LC_LOTE_FECHA_FUTURA).
-- FIX3 (M-4): el guard de fecha futura cubre INSERT y UPDATE (fecha_pago sale
-- de la lista "sólo metadatos"), nueva regla LC_PAGO_FECHA_PREVIA_EMISION
-- (paridad con el lote CxC) y la función pasa a SECURITY DEFINER para poder
-- llamar al canon de NCs tras el REVOKE de los helpers a `authenticated`.
-- Al modificar: edita ESTE archivo y genera la migración con el mismo cuerpo.

CREATE OR REPLACE FUNCTION public.assert_factura_viva_para_pago()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_estado text;
  v_cancel text;
  v_total numeric;
  v_fecha_emision date;
  v_pagos_otros numeric;
  v_ncs numeric;
  v_saldo_disponible_previo numeric;
  v_saldo_post numeric;
  v_solo_metadatos boolean := false;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- FIX-63: un UPDATE que NO toca el dinero (p. ej. sincronizar el estatus del
  -- REP ante el SAT, adjuntar PDF/XML o marcar el acuse) es mantenimiento
  -- documental, no un cobro nuevo. Esos updates deben pasar aunque la factura
  -- esté cancelada o con cancelación en trámite.
  IF TG_OP = 'UPDATE' THEN
    v_solo_metadatos := (
      NEW.factura_id IS NOT DISTINCT FROM OLD.factura_id
      AND NEW.monto IS NOT DISTINCT FROM OLD.monto
      AND NEW.monto_aplicado_factura IS NOT DISTINCT FROM OLD.monto_aplicado_factura
      AND NEW.moneda IS NOT DISTINCT FROM OLD.moneda
      AND NEW.tipo_cambio IS NOT DISTINCT FROM OLD.tipo_cambio
      AND NEW.ret_isr IS NOT DISTINCT FROM OLD.ret_isr
      AND NEW.ret_iva IS NOT DISTINCT FROM OLD.ret_iva
      -- FIX3 (M-4): un cambio de fecha ya no es "sólo metadatos".
      AND NEW.fecha_pago IS NOT DISTINCT FROM OLD.fecha_pago
      AND OLD.deleted_at IS NULL
    );
    IF v_solo_metadatos THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Ola 1: espejo de LC_LOTE_FECHA_FUTURA (cobro en lote). Un cobro con fecha
  -- futura ensucia aging, REP y reportes de flujo.
  -- FIX3 (M-4): aplica también en UPDATE.
  IF NEW.fecha_pago IS NOT NULL AND NEW.fecha_pago > public.fecha_negocio_mx() THEN
    RAISE EXCEPTION 'LC_PAGO_FECHA_FUTURA: la fecha del cobro no puede ser futura'
      USING ERRCODE = 'check_violation',
            HINT    = json_build_object('fecha_pago', NEW.fecha_pago)::text;
  END IF;

  -- FIX-23: bloquear la factura padre para serializar pagos concurrentes.
  PERFORM 1 FROM public.facturas WHERE id = NEW.factura_id FOR UPDATE;

  SELECT estado::text, COALESCE(total, 0), COALESCE(cancellation_status, 'none'),
         fecha_emision
    INTO v_estado, v_total, v_cancel, v_fecha_emision
  FROM public.facturas
  WHERE id = NEW.factura_id;

  IF v_estado IN ('Cancelada','Sustituida','Borrador') THEN
    RAISE EXCEPTION 'LC_PAGO_FACTURA_NO_VIVA: la factura está en estado % y no admite pagos', v_estado
      USING ERRCODE = 'check_violation',
            HINT    = json_build_object('estado_factura', v_estado)::text;
  END IF;

  IF v_cancel IN ('pending','verifying') THEN
    RAISE EXCEPTION 'LC_FACTURA_EN_CANCELACION: la factura tiene una cancelación en trámite ante el SAT y no admite cobros'
      USING ERRCODE = 'check_violation',
            HINT    = json_build_object('cancellation_status', v_cancel)::text;
  END IF;

  -- FIX3 (M-4): paridad con el lote CxC — el cobro no puede ser anterior a la
  -- emisión de la factura. Facturas sin fecha_emision quedan fuera de la regla.
  IF NEW.fecha_pago IS NOT NULL
     AND v_fecha_emision IS NOT NULL
     AND NEW.fecha_pago < v_fecha_emision THEN
    RAISE EXCEPTION 'LC_PAGO_FECHA_PREVIA_EMISION: la fecha del cobro no puede ser anterior a la emisión de la factura'
      USING ERRCODE = 'check_violation',
            HINT    = json_build_object(
              'fecha_pago', NEW.fecha_pago,
              'fecha_emision', v_fecha_emision
            )::text;
  END IF;

  -- N7 (v13.823.390): un pago cuyo REP quedó CANCELADO ante el SAT está
  -- ANULADO y NO consume saldo (mismo predicado canónico que
  -- public._saldo_factura_calc y cartera_pendiente). Sin este filtro, tras
  -- cancelar un REP la UI mostraba saldo pero la BD rechazaba el cobro de
  -- reemplazo como sobrepago.
  SELECT COALESCE(SUM(pf.monto_aplicado_factura), 0) INTO v_pagos_otros
  FROM public.pagos_factura pf
  WHERE pf.factura_id = NEW.factura_id
    AND pf.deleted_at IS NULL
    AND NOT public.pago_rep_anulado(pf.estado_rep)
    AND pf.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Ola 1: NC convertidas a la moneda de la factura (antes SUM(monto) crudo).
  v_ncs := public.nc_aplicadas_en_moneda_factura(NEW.factura_id);

  v_saldo_disponible_previo := v_total - v_pagos_otros - v_ncs;
  v_saldo_post := v_saldo_disponible_previo - COALESCE(NEW.monto_aplicado_factura, 0);

  IF v_saldo_post < -0.005 THEN
    RAISE EXCEPTION 'LC_PAGO_SOBREPAGO: el pago excede el saldo pendiente'
      USING ERRCODE = 'check_violation',
            HINT    = json_build_object(
              'saldo_disponible', v_saldo_disponible_previo,
              'monto_intentado', NEW.monto_aplicado_factura,
              'notas_credito_aplicadas', v_ncs
            )::text;
  END IF;

  RETURN NEW;
END;
$function$;

-- FIX-45: ninguna función financiera es ejecutable por anon.
REVOKE ALL ON FUNCTION public.assert_factura_viva_para_pago() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_factura_viva_para_pago() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_factura_viva_para_pago() TO service_role;

--> statement-breakpoint

-- supabase/schema/facturacion/registrar_pago_cliente_lote.sql
-- ============================================================
-- Ola 11 · RBD-08: los pagos individuales del cobro en lote se insertaban
-- con pagos_factura.tipo_cambio = 1 duro aunque el lote capturaba TC. En
-- USD/EUR eso subestima monto_cobrado_mxn en calcular_comision_pago (rama
-- v_tc_pago = 1 ⇒ monto extranjero contado como MXN). Ahora se guarda el
-- TC del lote (v_tc) cuando la moneda es extranjera; en MXN se conserva 1.
-- Es seguro porque desde RFE-03 (20260821030200) la RPC exige v_tc > 0
-- para moneda extranjera (LC_COBRO_LOTE_TC_REQUERIDO).
-- ACUMULATIVA: incluye RFE-02/RNF-03 (fecha), RFE-03 (TC requerido),
-- RNF-01 (idempotencia) y RNF-02 (cuadre exacto). Sincroniza la fuente
-- canónica (1:1). Sin backfill de históricos en esta migración.
-- ============================================================
-- v13.718.0 (Ola 8): la autorización de rol financiero se evalúa por
-- membresía en la organización del documento (has_any_role_in_org).
-- v13.729.0 (FIX B-6): la lista de roles vuelve a ser la EXACTA previa al
-- piloto, sin expansión de jerarquía (has_any_role_in_org_exact);
-- auxiliar_contable queda fuera por decisión conservadora.

CREATE OR REPLACE FUNCTION public.registrar_pago_cliente_lote(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_cliente_id uuid := (p_payload->>'cliente_id')::uuid;
  v_fecha date := COALESCE((p_payload->>'fecha_pago')::date, public.fecha_negocio_mx());
  v_moneda public.moneda := (p_payload->>'moneda')::public.moneda;
  v_tc numeric := NULLIF(p_payload->>'tipo_cambio_usd','')::numeric;
  -- Ola 5 · RG4-5: importe real recibido del cliente (nuevo en el payload).
  v_importe numeric := NULLIF(p_payload->>'importe_recibido','')::numeric;
  v_forma text := COALESCE(NULLIF(TRIM(p_payload->>'forma_pago'), ''), '03');
  v_referencia text := COALESCE(NULLIF(TRIM(p_payload->>'referencia'), ''), '');
  v_cuenta_id uuid := NULLIF(p_payload->>'cuenta_bancaria_id','')::uuid;
  v_notas text := COALESCE(p_payload->>'notas','');
  -- Ola 11 · RNF-01: llave de idempotencia del cliente (opcional).
  v_request_id uuid := NULLIF(p_payload->>'request_id','')::uuid;
  v_cached jsonb;
  v_intento jsonb;
  v_intento_anterior jsonb;
  v_reparto jsonb;
  v_resp jsonb;
  v_cuenta public.cuentas_bancarias;
  v_cliente_nombre text;
  v_total numeric := 0;
  v_lote_id uuid;
  v_renglon jsonb;
  v_factura_id uuid;
  v_monto numeric;
  v_saldo numeric;
  v_fecha_emision date;
  v_pago_id uuid;
  v_n int := 0;
  v_pagos jsonb := '[]'::jsonb;
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id, nombre INTO v_org, v_cliente_nombre
  FROM public.clientes WHERE id = v_cliente_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'LC_COBRO_LOTE_CLIENTE_NO_EXISTE: El cliente no existe.';
  END IF;

  IF v_org <> public.current_user_org_id()
     AND NOT public.has_role(v_uid,'super_admin'::app_role) THEN
    RAISE EXCEPTION 'LC_COBRO_LOTE_CLIENTE_OTRA_ORG: El cliente pertenece a otra organización.';
  END IF;

  -- Ola 8 + FIX B-6: rol financiero por membresía en la organización del
  -- cliente, con la lista EXACTA previa al piloto {admin, admin_org,
  -- super_admin, contador, tesorero} y SIN expansión de jerarquía:
  -- `auxiliar_contable` queda fuera por decisión conservadora.
  IF NOT public.has_any_role_in_org_exact(v_uid,
       ARRAY['admin','admin_org','super_admin','contador','tesorero']::public.app_role[],
       v_org) THEN
    RAISE EXCEPTION 'LC_COBRO_LOTE_SIN_ROL: Sólo administración, contabilidad o tesorería pueden registrar cobros en lote.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_array((r->>'factura_id')::uuid, ROUND(COALESCE((r->>'monto')::numeric, 0), 2))
    ORDER BY (r->>'factura_id')::uuid, (r->>'monto')::numeric), '[]'::jsonb)
  INTO v_reparto
  FROM jsonb_array_elements(COALESCE(p_payload->'renglones', '[]'::jsonb)) r;
  v_intento := jsonb_build_array(v_org, v_cliente_id, v_fecha, v_moneda, v_tc,
    ROUND(v_importe, 2), v_forma, v_referencia, v_cuenta_id, v_notas, v_reparto);

  v_cached := public.idempotency_claim(v_request_id, 'registrar_pago_cliente_lote');
  IF v_cached IS NOT NULL THEN
    IF COALESCE((v_cached->>'__idempotency_pending')::boolean, false) THEN
      RAISE EXCEPTION 'LC_COBRO_LOTE_EN_PROCESO: Este cobro en lote ya está en proceso; verifica el historial antes de reintentar.'
        USING ERRCODE = '42501';
    END IF;
    v_intento_anterior := v_cached->'intento';
    IF v_intento_anterior IS NULL THEN
      -- Antes de guardar la huella, recuperar sólo desde el lote y su reparto persistidos.
      SELECT jsonb_build_array(l.organization_id, l.cliente_id, l.fecha_pago, l.moneda,
        l.tipo_cambio_usd, ROUND(l.monto_total, 2), l.forma_pago, l.referencia, l.cuenta_bancaria_id, l.notas,
        (SELECT jsonb_agg(jsonb_build_array(p.factura_id, ROUND(p.monto, 2)) ORDER BY p.factura_id)
          FROM public.pagos_factura p
          WHERE p.lote_id = l.id AND p.organization_id = v_org AND p.deleted_at IS NULL))
      INTO v_intento_anterior
      FROM public.pagos_factura_lote l
      WHERE l.id = (v_cached->>'lote_id')::uuid AND l.organization_id = v_org
        AND l.created_by = v_uid AND l.deleted_at IS NULL;
    END IF;
    IF v_intento_anterior IS DISTINCT FROM v_intento THEN
      RAISE EXCEPTION 'LC_COBRO_LOTE_INTENTO_DISTINTO: Este intento ya se usó con otros datos. Revisa el lote en el historial antes de registrar otra operación.'
        USING ERRCODE = '22023';
    END IF;
    RETURN v_cached - 'intento';
  END IF;

  -- Ola 11 · RFE-02/RNF-03: misma regla que el cobro individual (FE-03).
  IF v_fecha > public.fecha_negocio_mx() THEN
    RAISE EXCEPTION 'LC_COBRO_LOTE_FECHA_FUTURA: La fecha del cobro no puede ser futura.'
      USING ERRCODE = '42501';
  END IF;

  -- Ola 11 · RFE-03 (patrón FE-01): lote extranjero sin TC no se registra.
  IF v_moneda <> 'MXN'::public.moneda AND (v_tc IS NULL OR v_tc <= 0) THEN
    RAISE EXCEPTION 'LC_COBRO_LOTE_TC_REQUERIDO: No hay tipo de cambio disponible para un cobro en %; reintenta cuando el servicio de tipos de cambio responda.', v_moneda
      USING ERRCODE = '42501';
  END IF;

  IF v_cuenta_id IS NOT NULL THEN
    SELECT * INTO v_cuenta FROM public.cuentas_bancarias
    WHERE id = v_cuenta_id AND deleted_at IS NULL;

    IF v_cuenta.id IS NULL THEN
      RAISE EXCEPTION 'LC_COBRO_LOTE_CUENTA_INVALIDA: La cuenta bancaria no existe o está dada de baja.';
    END IF;
    IF v_cuenta.organization_id <> v_org THEN
      RAISE EXCEPTION 'LC_COBRO_LOTE_CUENTA_OTRA_ORG: La cuenta bancaria pertenece a otra organización.';
    END IF;
    IF v_cuenta.moneda <> v_moneda THEN
      RAISE EXCEPTION 'LC_COBRO_LOTE_CUENTA_DIVISA: La cuenta está en % y el cobro en %.', v_cuenta.moneda, v_moneda;
    END IF;
  END IF;

  -- Ola 5 · RG4-6: una misma factura no puede aparecer dos veces.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_payload->'renglones','[]'::jsonb)) AS r
    GROUP BY (r->>'factura_id')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'LC_COBRO_LOTE_FACTURA_DUPLICADA: Hay facturas repetidas en el lote; cada factura sólo puede aparecer una vez.'
      USING ERRCODE = '42501';
  END IF;

  -- Validación de renglones: tenancy, cliente, moneda y saldo real por factura.
  -- BL-13 (migración 20260817143000): los locks FOR UPDATE se toman en orden
  -- determinista (factura_id), no en el orden del payload; dos lotes
  -- concurrentes con las mismas facturas en orden distinto hacían deadlock.
  FOR v_renglon IN
    SELECT r FROM jsonb_array_elements(COALESCE(p_payload->'renglones','[]'::jsonb)) AS r
    ORDER BY (r->>'factura_id')::uuid
  LOOP
    v_factura_id := (v_renglon->>'factura_id')::uuid;
    v_monto := ROUND(COALESCE((v_renglon->>'monto')::numeric, 0), 2);

    IF v_monto <= 0 THEN
      RAISE EXCEPTION 'LC_COBRO_LOTE_MONTO_INVALIDO: Cada factura del lote debe tener un importe mayor a cero.';
    END IF;

    -- Ola 1: las notas de crédito se restan CONVERTIDAS a la moneda de la
    -- factura (canon `public.nc_aplicadas_en_moneda_factura`); antes se sumaba
    -- `nc.monto` en crudo y una NC en USD inflaba el saldo de una factura MXN.
    SELECT
      f.total
      - COALESCE((SELECT SUM(pf.monto_aplicado_factura) FROM public.pagos_factura pf
                   WHERE pf.factura_id = f.id AND pf.deleted_at IS NULL
                     -- N7 (v13.823.390): REP cancelado = pago ANULADO, no
                     -- consume saldo (canon public.pago_rep_anulado).
                     AND NOT public.pago_rep_anulado(pf.estado_rep)), 0)
      - public.nc_aplicadas_en_moneda_factura(f.id),
      f.fecha_emision
      INTO v_saldo, v_fecha_emision
    FROM public.facturas f
    WHERE f.id = v_factura_id
      AND f.deleted_at IS NULL
      AND f.organization_id = v_org
      AND f.cliente_id = v_cliente_id
      AND f.moneda = v_moneda
    FOR UPDATE OF f;

    IF v_saldo IS NULL THEN
      RAISE EXCEPTION 'LC_COBRO_LOTE_FACTURA_INVALIDA: Una de las facturas no existe, no es del cliente seleccionado o está en otra moneda.';
    END IF;

    -- Ola 11 · RFE-02/RNF-03: no cobros anteriores a la emisión (aging/REP).
    IF v_fecha < v_fecha_emision THEN
      RAISE EXCEPTION 'LC_COBRO_LOTE_FECHA_PREVIA_EMISION: La fecha del cobro es anterior a la emisión de una de las facturas del lote.'
        USING ERRCODE = '42501';
    END IF;

    -- BUG-15: tolerancia unificada con el trigger tg_pago_factura_no_sobrepago
    -- (0.005 = medio centavo). Antes 0.009 aquí y 0.005 en el trigger: la RPC
    -- aceptaba sobrepagos que el trigger luego rechazaba.
    IF v_monto > ROUND(v_saldo, 2) + 0.005 THEN
      RAISE EXCEPTION 'LC_COBRO_LOTE_EXCEDE_SALDO: El importe aplicado a una factura excede su saldo pendiente.';
    END IF;

    v_total := v_total + v_monto;
    v_n := v_n + 1;
  END LOOP;

  IF v_n < 2 THEN
    RAISE EXCEPTION 'LC_COBRO_LOTE_MINIMO_FACTURAS: Un cobro en lote requiere al menos dos facturas.';
  END IF;

  -- Ola 5 · RG4-5: el reparto debe cuadrar EXACTAMENTE con el importe recibido.
  IF v_importe IS NULL OR v_importe <= 0 THEN
    RAISE EXCEPTION 'LC_COBRO_LOTE_IMPORTE_REQUERIDO: Captura el importe recibido del cliente.'
      USING ERRCODE = '42501';
  END IF;
  -- Ola 11 · RNF-02: exacto tras ROUND a 2 decimales (antes tolerancia 0.01,
  -- discrepante con los 0.009 del cliente y con el mensaje "EXACTO").
  IF ROUND(v_importe, 2) IS DISTINCT FROM ROUND(v_total, 2) THEN
    RAISE EXCEPTION 'LC_COBRO_LOTE_IMPORTE_NO_CUADRA: El reparto (%) no cuadra con el importe recibido (%); no se permite sobrante sin asignar.', v_total, v_importe
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pagos_factura_lote
    (organization_id, cliente_id, fecha_pago, moneda, monto_total, tipo_cambio_usd,
     forma_pago, referencia, cuenta_bancaria_id, notas, created_by)
  VALUES
    (v_org, v_cliente_id, v_fecha, v_moneda, v_total, v_tc,
     v_forma, v_referencia, v_cuenta_id, v_notas, v_uid)
  RETURNING id INTO v_lote_id;

  FOR v_renglon IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'renglones','[]'::jsonb)) LOOP
    v_factura_id := (v_renglon->>'factura_id')::uuid;
    v_monto := ROUND(COALESCE((v_renglon->>'monto')::numeric, 0), 2);

    INSERT INTO public.pagos_factura
      (organization_id, factura_id, fecha_pago, monto, moneda, tipo_cambio,
       monto_aplicado_factura, forma_pago, referencia, notas, created_by, lote_id)
    VALUES
      -- Ola 11 · RBD-08: el pago individual guarda el TC del lote en moneda
      -- extranjera (garantizado > 0 por LC_COBRO_LOTE_TC_REQUERIDO); en MXN
      -- se conserva 1 como antes.
      (v_org, v_factura_id, v_fecha, v_monto, v_moneda,
       CASE WHEN v_moneda = 'MXN'::public.moneda THEN 1 ELSE v_tc END,
       v_monto, v_forma, v_referencia, v_notas, v_uid, v_lote_id)
    RETURNING id INTO v_pago_id;

    v_pagos := v_pagos || jsonb_build_object('pago_id', v_pago_id, 'factura_id', v_factura_id);
  END LOOP;

  IF v_cuenta_id IS NOT NULL THEN
    INSERT INTO public.bbva_movimientos
      (organization_id, cuenta_bancaria_id, fecha, concepto, referencia,
       cargo, abono, hash_dedupe, estado_conciliacion,
       pago_factura_lote_id, conciliado_por, conciliado_at, importado_por)
    VALUES
      (v_org, v_cuenta_id, v_fecha,
       'Cobro en lote (' || v_n || ' facturas) — ' || COALESCE(v_cliente_nombre, 'cliente'),
       v_referencia, 0, v_total, 'cobro-lote-' || v_lote_id::text, 'Conciliado',
       v_lote_id, v_uid, now(), v_uid);
  END IF;

  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    INSERT INTO public.bitacora_actividad
      (organization_id, usuario_id, usuario_email, accion, modulo, entidad_id, entidad_nombre, detalles)
    VALUES (v_org, v_uid, COALESCE(v_email,''), 'registrar_pago_cliente_lote', 'facturacion',
            v_lote_id, 'Cobro en lote ' || v_lote_id::text,
            jsonb_build_object('cliente_id', v_cliente_id, 'monto_total', v_total,
                               'importe_recibido', v_importe,
                               'moneda', v_moneda, 'facturas', v_n,
                               'cuenta_bancaria_id', v_cuenta_id, 'referencia', v_referencia));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'bitacora insert failed en registrar_pago_cliente_lote: % %', SQLSTATE, SQLERRM;
  END;

  v_resp := jsonb_build_object('lote_id', v_lote_id, 'monto_total', v_total, 'pagos', v_pagos);
  -- Ola 11 · RNF-01: almacena la respuesta para los reintentos con la
  -- misma llave (no-op cuando request_id viene NULL).
  PERFORM public.idempotency_store(v_request_id, v_resp || jsonb_build_object('intento', v_intento));
  RETURN v_resp;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_pago_cliente_lote(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pago_cliente_lote(jsonb) TO authenticated, service_role;

--> statement-breakpoint

-- supabase/schema/facturacion/saldo_factura.sql
CREATE OR REPLACE FUNCTION public.saldo_factura(p_factura_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid; v_cliente uuid; v_uid uuid; v_caller_org uuid;
BEGIN
  SELECT f.organization_id, f.cliente_id INTO v_org, v_cliente
  FROM public.facturas f WHERE f.id = p_factura_id AND f.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_uid := auth.uid();
  v_caller_org := public.current_user_org_id();

  IF v_uid IS NOT NULL
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NOT public.rls_tenant_scope_ok(v_org) THEN
      RETURN 0;
    END IF;
    IF NOT public.has_role(v_uid, 'super_admin'::app_role)
       AND (v_caller_org IS NULL OR v_org IS DISTINCT FROM v_caller_org) THEN
      -- Portal: el usuario cliente sí puede consultar el saldo de SU factura.
      IF v_cliente IS NULL
         OR v_cliente NOT IN (SELECT public.current_user_client_ids()) THEN
        RETURN 0;
      END IF;
    END IF;
  END IF;

  RETURN public._saldo_factura_calc(p_factura_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.saldo_factura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saldo_factura(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.saldo_factura_bruto(p_factura_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid; v_uid uuid; v_caller_org uuid;
BEGIN
  SELECT f.organization_id INTO v_org
  FROM public.facturas f WHERE f.id = p_factura_id AND f.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_uid := auth.uid();
  v_caller_org := public.current_user_org_id();
  IF v_uid IS NOT NULL
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NOT public.rls_tenant_scope_ok(v_org)
       OR (NOT public.has_role(v_uid, 'super_admin'::app_role)
           AND (v_caller_org IS NULL OR v_org IS DISTINCT FROM v_caller_org)) THEN
      RETURN 0;
    END IF;
  END IF;

  RETURN public._saldo_factura_calc(p_factura_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.saldo_factura_bruto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saldo_factura_bruto(uuid) TO authenticated, service_role;

-- Guard: impide registrar NC en moneda no convertible.

--> statement-breakpoint

-- supabase/schema/tesoreria/eliminar_pago_proveedor.sql
-- Fuente canónica de public.eliminar_pago_proveedor.
-- v13.646.0 (BUG-07): al eliminar el pago se revierten también las
-- aplicaciones de anticipo asociadas para que el saldo del anticipo se libere.
-- v13.718.0 (Ola 8): la autorización de rol financiero se evalúa por
-- membresía en la organización del documento (has_any_role_in_org).
-- v13.729.0 (FIX B-6): la lista de roles vuelve a ser la EXACTA de
-- es_escritor_financiero, sin expansión de jerarquía.
-- Ola E1 · N21: se eliminó la condición muerta del CTE `baja`; sólo se dan de
-- baja los movimientos generados por el pago (hash_dedupe 'pago-<id>').
-- Fuente vigente (mayor timestamp): 20260828054537_ca60a1f3-16fa-4be8-9c12-ccc1097393ef.sql

CREATE OR REPLACE FUNCTION public.eliminar_pago_proveedor(_pago_id uuid, _motivo text DEFAULT NULL::text)
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
  v_costos int := 0;
  v_anticipos int := 0;
BEGIN
  SELECT id, proveedor_factura_id, organization_id, deleted_at, monto, moneda, lote_id
    INTO v_pago
  FROM public.pagos_proveedor
  WHERE id = _pago_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LC_PAGO_NO_ENCONTRADO: el pago % no existe', _pago_id USING ERRCODE = 'P0002';
  END IF;

  IF v_pago.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'pago_id', _pago_id, 'ya_eliminado', true,
      'movimientos_baja', 0, 'movimientos_desvinculados', 0, 'costos_recalculados', 0,
      'anticipos_revertidos', 0
    );
  END IF;

  IF NOT public.has_role(v_uid, 'super_admin'::app_role)
     AND v_pago.organization_id IS DISTINCT FROM public.current_user_org_id() THEN
    RAISE EXCEPTION 'LC_ORG_FORBIDDEN: el pago pertenece a otra organizacion'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role_in_org_exact(v_uid,
       ARRAY['super_admin','admin','admin_org','contador','tesorero','ejecutivo_cobranza']::public.app_role[],
       v_pago.organization_id) THEN
    RAISE EXCEPTION 'LC_PAGO_SIN_PERMISO: tu rol no puede eliminar pagos'
      USING ERRCODE = '42501';
  END IF;

  IF v_pago.lote_id IS NOT NULL THEN
    RAISE EXCEPTION 'LC_PAGO_LOTE_NO_ELIMINABLE: revierte el lote completo para conservar sus aplicaciones'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pagos_proveedor
     SET deleted_at = now(), deleted_by = v_uid
   WHERE id = _pago_id AND deleted_at IS NULL;

  WITH rev AS (
    UPDATE public.anticipos_aplicaciones
       SET deleted_at = now(), deleted_by = v_uid, updated_at = now()
     WHERE pago_proveedor_id = _pago_id
       AND deleted_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_anticipos FROM rev;

  -- Ola E1 · N21: sólo los movimientos GENERADOS por el pago (hash_dedupe) se
  -- dan de baja; los movimientos bancarios reales del estado de cuenta se
  -- desvinculan más abajo (nunca se borran).
  WITH baja AS (
    UPDATE public.bbva_movimientos
       SET deleted_at = now(), deleted_by = v_uid
     WHERE deleted_at IS NULL
       AND hash_dedupe = 'pago-' || _pago_id::text
    RETURNING 1
  )
  SELECT count(*) INTO v_baja FROM baja;

  WITH libre AS (
    UPDATE public.bbva_movimientos
       SET pago_proveedor_id = NULL,
           estado_conciliacion = 'Pendiente'::estado_conciliacion,
           conciliado_por = NULL,
           conciliado_at = NULL
     WHERE pago_proveedor_id = _pago_id
       AND deleted_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_desvinculados FROM libre;

  SELECT count(DISTINCT pfc.concepto_costo_id) INTO v_costos
  FROM public.proveedor_facturas_conceptos pfc
  WHERE pfc.proveedor_factura_id = v_pago.proveedor_factura_id
    AND pfc.concepto_costo_id IS NOT NULL;

  INSERT INTO public.bitacora_actividad
    (usuario_id, usuario_email, accion, modulo, entidad_id, detalles, organization_id)
  VALUES (
    COALESCE(v_uid, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE((SELECT u.email FROM auth.users u WHERE u.id = v_uid), 'sistema'),
    'eliminar_pago', 'cxp', v_pago.proveedor_factura_id,
    jsonb_build_object(
      'pago_id', _pago_id,
      'monto', v_pago.monto,
      'moneda', v_pago.moneda,
      'motivo', _motivo,
      'movimientos_baja', v_baja,
      'movimientos_desvinculados', v_desvinculados,
      'costos_recalculados', v_costos,
      'anticipos_revertidos', v_anticipos,
      'atomico', true
    ),
    v_pago.organization_id
  );

  RETURN jsonb_build_object(
    'pago_id', _pago_id,
    'proveedor_factura_id', v_pago.proveedor_factura_id,
    'ya_eliminado', false,
    'movimientos_baja', v_baja,
    'movimientos_desvinculados', v_desvinculados,
    'costos_recalculados', v_costos,
    'anticipos_revertidos', v_anticipos
  );
END;
$function$;

--> statement-breakpoint

-- supabase/schema/crm/oportunidad_motivo_reapertura.sql
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS motivo_reapertura text
  CHECK (motivo_reapertura IS NULL);
ALTER TABLE public.crm_historial_etapas ADD COLUMN IF NOT EXISTS motivo_reapertura text;
ALTER TABLE public.crm_historial_etapas ADD COLUMN IF NOT EXISTS motivo_perdida_anterior_id uuid;

CREATE OR REPLACE FUNCTION public._crm_registrar_cambio_etapa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_origen text;
  v_destino text;
  v_motivo text := nullif(btrim(NEW.motivo_reapertura), '');
  v_motivo_perdida uuid;
BEGIN
  NEW.motivo_reapertura := NULL;
  NEW.ultimo_movimiento_at := now();
  IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    SELECT tipo INTO v_origen FROM public.crm_etapas_pipeline
      WHERE id = OLD.etapa_id AND organization_id = OLD.organization_id;
    SELECT tipo INTO v_destino FROM public.crm_etapas_pipeline
      WHERE id = NEW.etapa_id AND organization_id = NEW.organization_id;
    IF v_origen = 'perdida' AND v_destino = 'abierta' THEN
      IF v_motivo IS NULL OR char_length(v_motivo) > 500 THEN
        RAISE EXCEPTION 'Escribe un motivo de reapertura de hasta 500 caracteres.'
          USING ERRCODE = '22023';
      END IF;
      v_motivo_perdida := OLD.motivo_perdida_id;
      NEW.motivo_perdida_id := NULL;
    ELSE
      v_motivo := NULL;
    END IF;
    INSERT INTO public.crm_historial_etapas (
      organization_id, oportunidad_id, etapa_origen_id, etapa_destino_id,
      dias_en_etapa, usuario_id, usuario_email, motivo_reapertura, motivo_perdida_anterior_id
    ) VALUES (
      NEW.organization_id, NEW.id, OLD.etapa_id, NEW.etapa_id,
      ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(OLD.etapa_desde_at, OLD.created_at, now()))) / 86400.0, 2),
      auth.uid(), NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'email',
      v_motivo, v_motivo_perdida
    );
    NEW.etapa_desde_at := now();
  END IF;
  RETURN NEW;
END;
$$;

--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
