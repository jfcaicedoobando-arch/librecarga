CREATE OR REPLACE FUNCTION public.obtener_evaluacion_fiscal_embarque(p_embarque_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_emb public.embarques; v_lineas jsonb; v_ambiente text;
BEGIN
  SELECT * INTO v_emb FROM public.embarques WHERE id=p_embarque_id AND deleted_at IS NULL;
  IF v_emb.id IS NULL OR v_emb.organization_id IS DISTINCT FROM public.org_scope() OR NOT public.has_any_role_in_org_exact(auth.uid(),
    ARRAY['admin','admin_org','contador','auxiliar_contable','operador','vendedor','gerente_comercial',
      'gerente_operaciones','coordinador_logistico','ejecutivo_pricing','customer_service','tesorero','ejecutivo_cobranza']::public.app_role[],v_emb.organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at,c.id),'[]') INTO v_lineas
    FROM public.conceptos_venta c WHERE embarque_id=p_embarque_id AND deleted_at IS NULL;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_lineas) l WHERE l->'evaluacion_fiscal' <> 'null'::jsonb) THEN
    RETURN jsonb_build_object('snapshot',NULL,'conceptos',v_lineas);
  END IF;
  SELECT l->'evaluacion_fiscal'->>'ambiente' INTO v_ambiente FROM jsonb_array_elements(v_lineas) l
    WHERE l->'evaluacion_fiscal' <> 'null'::jsonb LIMIT 1;
  RETURN jsonb_build_object('snapshot',public._isr_snapshot_documento(v_emb.organization_id,v_emb.cliente_id,v_ambiente,v_lineas),
    'conceptos',COALESCE((SELECT jsonb_agg(l||jsonb_build_object('evaluacion_fiscal',(l->'evaluacion_fiscal')-'emisor'-'receptor'))
      FROM jsonb_array_elements(v_lineas) l),'[]'));
END;
$$;
