CREATE OR REPLACE FUNCTION public.crm_pricing_ampliar_plazo(p_id uuid, p_horas integer, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM crm_solicitudes_pricing WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF v.id IS NULL OR v.organization_id IS DISTINCT FROM org_scope() THEN RAISE EXCEPTION 'LC_PRICING_NO_ENCONTRADA' USING ERRCODE = 'P0001'; END IF;
  IF NOT _crm_pricing_es_gerente_ops(v.organization_id) THEN RAISE EXCEPTION 'LC_PRICING_SOLO_GERENTE_OPS' USING ERRCODE = '42501'; END IF;
  IF v.estado <> 'enviada' OR v.complejidad <> 'alta' THEN RAISE EXCEPTION 'LC_PRICING_PLAZO_NO_AMPLIABLE' USING ERRCODE = 'P0001'; END IF;
  IF now() > v.enviada_at + interval '8 hours' THEN RAISE EXCEPTION 'LC_PRICING_PLAZO_FUERA_DE_TIEMPO' USING ERRCODE = 'P0001'; END IF;
  IF p_horas IS NULL OR p_horas <= 48 OR p_horas > 720 THEN RAISE EXCEPTION 'LC_PRICING_HORAS_INVALIDAS' USING ERRCODE = 'P0001'; END IF;
  IF length(trim(coalesce(p_motivo, ''))) < 10 THEN RAISE EXCEPTION 'LC_PRICING_MOTIVO_REQUERIDO' USING ERRCODE = 'P0001'; END IF;
  PERFORM set_config('lc.pricing_rpc', '1', true);
  UPDATE crm_solicitudes_pricing SET vence_at = public._crm_pricing_sumar_horas_habiles(enviada_at, p_horas), plazo_motivo = trim(p_motivo)
   WHERE id = p_id;
  PERFORM set_config('lc.pricing_rpc', '', true);
  PERFORM _crm_pricing_avisar_cambio(v.organization_id, v.id, v.solicitante_id, 'Nuevo plazo ' || v.folio,
    'Plazo de respuesta: ' || p_horas || ' h · Motivo: ' || trim(p_motivo));
  RETURN jsonb_build_object('id', v.id);
END $function$;
