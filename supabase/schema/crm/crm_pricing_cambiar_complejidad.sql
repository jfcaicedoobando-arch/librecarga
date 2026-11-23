CREATE OR REPLACE FUNCTION public.crm_pricing_cambiar_complejidad(p_id uuid, p_complejidad text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v record; v_horas int;
BEGIN
  SELECT * INTO v FROM crm_solicitudes_pricing WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF v.id IS NULL OR v.organization_id IS DISTINCT FROM org_scope() THEN RAISE EXCEPTION 'LC_PRICING_NO_ENCONTRADA' USING ERRCODE = 'P0001'; END IF;
  IF NOT _crm_pricing_es_gerente_ops(v.organization_id) THEN RAISE EXCEPTION 'LC_PRICING_SOLO_GERENTE_OPS' USING ERRCODE = '42501'; END IF;
  IF v.estado <> 'enviada' THEN RAISE EXCEPTION 'LC_PRICING_ESTADO_INVALIDO' USING ERRCODE = 'P0001'; END IF;
  IF p_complejidad NOT IN ('baja','media','alta') THEN RAISE EXCEPTION 'LC_PRICING_COMPLEJIDAD_INVALIDA' USING ERRCODE = 'P0001'; END IF;
  IF length(trim(coalesce(p_motivo, ''))) < 10 THEN RAISE EXCEPTION 'LC_PRICING_MOTIVO_REQUERIDO' USING ERRCODE = 'P0001'; END IF;
  IF p_complejidad = v.complejidad THEN RETURN jsonb_build_object('id', v.id, 'sin_cambio', true); END IF;
  v_horas := _crm_pricing_horas_modo(p_complejidad, v.servicio);
  PERFORM set_config('lc.pricing_rpc', '1', true);
  UPDATE crm_solicitudes_pricing SET complejidad = p_complejidad, complejidad_motivo = trim(p_motivo), plazo_motivo = NULL,
    vence_at = CASE WHEN v_horas IS NULL THEN NULL ELSE public._crm_pricing_sumar_horas_habiles(enviada_at, v_horas) END
   WHERE id = p_id;
  PERFORM set_config('lc.pricing_rpc', '', true);
  PERFORM _crm_pricing_avisar_cambio(v.organization_id, v.id, v.solicitante_id, 'Cambio de complejidad ' || v.folio,
    'Nueva complejidad: ' || p_complejidad || ' · Motivo: ' || trim(p_motivo));
  RETURN jsonb_build_object('id', v.id, 'sin_cambio', false);
END $function$;
