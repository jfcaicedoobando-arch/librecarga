CREATE OR REPLACE FUNCTION public.obtener_perfil_fiscal_emisor(p_org_id uuid, p_ambiente text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_perfil public.perfiles_fiscales_emisor; v_cred public.facturapi_credenciales; v_rfc text;
BEGIN
  IF p_org_id IS DISTINCT FROM public.org_scope() OR NOT public.has_any_role_in_org_exact(
    auth.uid(), ARRAY['admin','admin_org','contador']::public.app_role[], p_org_id) THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF p_ambiente IS NULL OR p_ambiente NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_AMBIENTE_INVALIDO' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_cred FROM public.facturapi_credenciales WHERE organization_id = p_org_id;
  SELECT * INTO v_perfil FROM public.perfiles_fiscales_emisor
    WHERE organization_id = p_org_id AND ambiente = p_ambiente ORDER BY version DESC LIMIT 1;
  SELECT valor #>> '{}' INTO v_rfc FROM public.configuracion
    WHERE organization_id = p_org_id AND categoria = 'empresa' AND clave = 'rfc';
  RETURN public._perfil_fiscal_emisor_resultado(v_perfil, v_cred, v_rfc)
    || jsonb_build_object('ambiente', p_ambiente);
END;
$$;
REVOKE ALL ON FUNCTION public.obtener_perfil_fiscal_emisor(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_perfil_fiscal_emisor(uuid, text) TO authenticated, service_role;
