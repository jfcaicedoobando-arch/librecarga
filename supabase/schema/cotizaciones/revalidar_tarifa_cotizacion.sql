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
