CREATE OR REPLACE FUNCTION public.consultar_apertura_cxc(p_org uuid) RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org uuid := public._cxc_org_contador(p_org);
BEGIN
  RETURN (SELECT desde FROM public.cxc_aperturas WHERE organization_id=v_org);
END;
$$;
