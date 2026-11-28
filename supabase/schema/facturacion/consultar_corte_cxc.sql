CREATE OR REPLACE FUNCTION public.consultar_corte_cxc(p_org uuid,p_fecha date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := public.org_scope();
  v_corte public.cxc_cortes;
BEGIN
  IF p_org IS NULL OR p_org IS DISTINCT FROM v_org OR NOT public.has_any_role_in_org_exact(auth.uid(),
    ARRAY['admin','admin_org','contador','tesorero','ejecutivo_cobranza','gerente_operaciones','gerente_visor','gerente_comercial']::public.app_role[],v_org)
    THEN RAISE EXCEPTION 'Corte no disponible.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_corte FROM public.cxc_cortes WHERE organization_id=v_org AND fecha=p_fecha
    ORDER BY revision DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('estado','sin_corte'); END IF;
  RETURN v_corte.datos || jsonb_build_object('estado',CASE WHEN v_corte.reabierto_en IS NULL THEN 'certificado' ELSE 'reabierto' END,
    'id',v_corte.id,'fecha',v_corte.fecha,'revision',v_corte.revision,'conciliadoEn',v_corte.conciliado_en);
END;
$$;
