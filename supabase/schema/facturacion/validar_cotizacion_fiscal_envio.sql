CREATE OR REPLACE FUNCTION public.validar_cotizacion_fiscal_envio(p_cotizacion_id uuid,p_expected_fingerprint text,p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cot public.cotizaciones; v_actual jsonb;
BEGIN
  SELECT * INTO v_cot FROM public.cotizaciones WHERE id=p_cotizacion_id AND deleted_at IS NULL;
  IF v_cot.id IS NULL OR p_usuario_id IS NULL OR NOT public.has_any_role_in_org_exact(p_usuario_id,
    ARRAY['admin','admin_org','gerente_comercial','vendedor','ejecutivo_pricing']::public.app_role[],v_cot.organization_id)
    OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE user_id=p_usuario_id AND organization_id=v_cot.organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE='42501';
  END IF;
  IF v_cot.evaluacion_fiscal IS NULL THEN
    IF p_expected_fingerprint IS NOT NULL THEN RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  IF v_cot.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado'
    OR p_expected_fingerprint IS DISTINCT FROM v_cot.evaluacion_fiscal->>'conceptos_fingerprint'
    OR v_cot.autorizada_at IS NULL OR v_cot.estado::text NOT IN ('Borrador','Solicitada','Enviada','Aceptada') THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  v_actual:=public._evaluar_documento_isr_resico(v_cot.organization_id,v_cot.cliente_id,v_cot.conceptos_venta);
  IF v_actual->'conceptos' IS DISTINCT FROM v_cot.conceptos_venta THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  RETURN v_cot.evaluacion_fiscal;
END;
$$;
