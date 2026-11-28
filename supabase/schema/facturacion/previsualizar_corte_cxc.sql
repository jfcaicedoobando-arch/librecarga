CREATE OR REPLACE FUNCTION public.previsualizar_corte_cxc(p_org uuid,p_fecha date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_datos jsonb;
BEGIN
  v_datos := public._cxc_calcular_corte(public._cxc_org_contador(p_org),p_fecha);
  RETURN v_datos || jsonb_build_object('fingerprint', encode(sha256(convert_to(v_datos::text,'UTF8')),'hex'));
END;
$$;
