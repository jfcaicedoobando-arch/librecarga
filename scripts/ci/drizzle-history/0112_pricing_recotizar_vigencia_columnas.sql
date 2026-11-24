CREATE OR REPLACE FUNCTION public.crm_pricing_recotizar(p_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; v_motivo text := nullif(trim(coalesce(p_motivo, '')), ''); v_horas int;
BEGIN
  SELECT * INTO v FROM crm_solicitudes_pricing WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF v.id IS NULL OR v.organization_id IS DISTINCT FROM org_scope() THEN
    RAISE EXCEPTION 'LC_PRICING_NO_ENCONTRADA' USING ERRCODE = 'P0001';
  END IF;
  IF NOT _crm_es_pricing(v.organization_id) THEN RAISE EXCEPTION 'LC_PRICING_SIN_PERMISO' USING ERRCODE = '42501'; END IF;
  IF v.estado <> 'respondida' THEN RAISE EXCEPTION 'LC_PRICING_ESTADO_INVALIDO' USING ERRCODE = 'P0001'; END IF;
  IF length(coalesce(v_motivo, '')) < 5 THEN RAISE EXCEPTION 'LC_PRICING_MOTIVO_REQUERIDO' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO crm_pricing_opciones_versiones (organization_id, solicitud_id, version, motivo, opciones, tarifas, respondida_at, created_by)
  VALUES (v.organization_id, v.id, v.version, v_motivo,
    coalesce((SELECT jsonb_agg(to_jsonb(o) - 'organization_id' ORDER BY o.orden, o.created_at)
              FROM crm_pricing_opciones o WHERE o.solicitud_id = v.id), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'modo', t.modo, 'moneda', t.moneda,
                'vigente_desde', t.vigente_desde, 'vigente_hasta', t.vigente_hasta) ORDER BY t.created_at)
              FROM costeo_tarifas t WHERE t.organization_id = v.organization_id
                AND (t.solicitud_pricing_id = v.id OR t.id = v.tarifa_tarifario_id)), '[]'::jsonb),
    v.respondida_at, auth.uid());

  v_horas := _crm_pricing_horas_modo(v.complejidad, v.servicio);
  PERFORM set_config('lc.pricing_rpc', '1', true);
  UPDATE crm_solicitudes_pricing SET estado = 'en_proceso', version = v.version + 1, recotizada_at = now(),
    respondida_at = NULL, pausada_at = NULL, aviso_80_at = NULL, aviso_vencida_at = NULL,
    asignada_a = coalesce(asignada_a, auth.uid()),
    vence_at = CASE WHEN v_horas IS NULL THEN NULL ELSE _crm_pricing_sumar_horas_habiles(now(), v_horas) END
  WHERE id = p_id;
  PERFORM set_config('lc.pricing_rpc', '', true);
  PERFORM _crm_pricing_avisar_cambio(v.organization_id, v.id, v.solicitante_id, 'Pricing recotiza ' || v.folio,
    'Versión ' || (v.version + 1) || ' en proceso: ' || v_motivo);
  RETURN jsonb_build_object('id', v.id, 'version', v.version + 1);
END $$;
REVOKE ALL ON FUNCTION public.crm_pricing_recotizar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_pricing_recotizar(uuid, text) TO authenticated, service_role;