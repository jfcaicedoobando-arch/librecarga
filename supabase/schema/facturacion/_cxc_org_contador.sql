CREATE OR REPLACE FUNCTION public._cxc_org_contador(p_org uuid) RETURNS uuid LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org uuid := public.org_scope();
BEGIN
  IF p_org IS NULL OR p_org IS DISTINCT FROM v_org OR NOT public.has_org_role(auth.uid(), v_org, 'contador') THEN
    RAISE EXCEPTION 'Solo Contabilidad puede certificar un corte de la organización activa.' USING ERRCODE='42501';
  END IF;
  RETURN v_org;
END;
$$;
