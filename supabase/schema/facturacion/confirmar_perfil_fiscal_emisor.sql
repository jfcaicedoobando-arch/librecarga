CREATE OR REPLACE FUNCTION public.confirmar_perfil_fiscal_emisor(
  p_org_id uuid, p_ambiente text, p_perfil_id uuid, p_vigente_desde date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cred public.facturapi_credenciales; v_perfil public.perfiles_fiscales_emisor; v_estado jsonb;
BEGIN
  -- Obtener valida tanto organización activa como rol fiscal.
  PERFORM public.obtener_perfil_fiscal_emisor(p_org_id, p_ambiente);
  SELECT * INTO v_cred FROM public.facturapi_credenciales WHERE organization_id = p_org_id FOR UPDATE;
  SELECT * INTO v_perfil FROM public.perfiles_fiscales_emisor
    WHERE organization_id = p_org_id AND ambiente = p_ambiente ORDER BY version DESC LIMIT 1 FOR UPDATE;
  IF p_perfil_id IS NULL OR v_perfil.id IS DISTINCT FROM p_perfil_id THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_VERSION_CAMBIO' USING ERRCODE = '40001';
  END IF;
  v_estado := public.obtener_perfil_fiscal_emisor(p_org_id, p_ambiente);
  IF jsonb_array_length(v_estado->'problemas') > 0 THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_REQUIERE_REVISION' USING ERRCODE = '22023';
  END IF;
  IF p_vigente_desde > (now() AT TIME ZONE 'America/Mexico_City')::date THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_FECHA_FUTURA' USING ERRCODE = '22023';
  END IF;
  IF v_perfil.confirmado_at IS NULL THEN
    UPDATE public.perfiles_fiscales_emisor SET confirmado_at = now(), confirmado_por = auth.uid(),
      vigente_desde = p_vigente_desde WHERE id = p_perfil_id AND organization_id = p_org_id;
  END IF;
  RETURN public.obtener_perfil_fiscal_emisor(p_org_id, p_ambiente);
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_perfil_fiscal_emisor(uuid, text, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_perfil_fiscal_emisor(uuid, text, uuid, date) TO authenticated, service_role;
