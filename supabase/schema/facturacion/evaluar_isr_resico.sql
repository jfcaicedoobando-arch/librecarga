CREATE OR REPLACE FUNCTION public.evaluar_isr_resico(
  p_org_id uuid, p_cliente_id uuid, p_ambiente text,
  p_cantidad numeric, p_precio_unitario numeric, p_tipo_iva text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF p_org_id IS DISTINCT FROM public.org_scope() OR NOT public.has_any_role_in_org_exact(
    auth.uid(), ARRAY['admin','admin_org','contador','auxiliar_contable','operador',
      'vendedor','gerente_comercial','gerente_operaciones','coordinador_logistico',
      'ejecutivo_pricing','customer_service','tesorero','ejecutivo_cobranza']::public.app_role[], p_org_id) THEN
    RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  RETURN public._evaluar_isr_resico(p_org_id,p_cliente_id,p_ambiente,p_cantidad,p_precio_unitario,p_tipo_iva)
    - 'emisor' - 'receptor';
END;
$$;
