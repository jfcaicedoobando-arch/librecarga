CREATE OR REPLACE FUNCTION public.evaluar_documento_isr_resico(p_org_id uuid,p_cliente_id uuid,p_conceptos jsonb,
  p_cotizacion_id uuid DEFAULT NULL,p_embarque_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_opt boolean; v_resultado jsonb;
BEGIN
  IF p_org_id IS DISTINCT FROM public.org_scope() OR NOT public.has_any_role_in_org_exact(auth.uid(),
    ARRAY['admin','admin_org','contador','auxiliar_contable','operador','vendedor','gerente_comercial',
      'gerente_operaciones','coordinador_logistico','ejecutivo_pricing','customer_service','tesorero','ejecutivo_cobranza']::public.app_role[],p_org_id) THEN
    RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE='42501';
  END IF;
  v_opt:=public._isr_documento_habilitado(p_org_id);
  IF p_cotizacion_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.cotizaciones WHERE id=p_cotizacion_id AND organization_id=p_org_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE='42501';
    END IF;
    v_opt:=v_opt OR EXISTS(SELECT 1 FROM public.cotizaciones WHERE id=p_cotizacion_id AND evaluacion_fiscal IS NOT NULL);
  END IF;
  IF p_embarque_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.embarques WHERE id=p_embarque_id AND organization_id=p_org_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE='42501';
    END IF;
    v_opt:=v_opt OR EXISTS(SELECT 1 FROM public.conceptos_venta WHERE embarque_id=p_embarque_id AND evaluacion_fiscal IS NOT NULL);
  END IF;
  IF NOT v_opt THEN RETURN jsonb_build_object('snapshot',NULL,'conceptos',p_conceptos); END IF;
  v_resultado:=public._evaluar_documento_isr_resico(p_org_id,p_cliente_id,p_conceptos);
  RETURN jsonb_set(v_resultado,'{conceptos}',COALESCE((SELECT jsonb_agg(l||jsonb_build_object('evaluacion_fiscal',
    (l->'evaluacion_fiscal')-'emisor'-'receptor')) FROM jsonb_array_elements(v_resultado->'conceptos') l),'[]'));
END;
$$;
