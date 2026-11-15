CREATE OR REPLACE FUNCTION public.registrar_perfil_fiscal_emisor(
  p_org_id uuid, p_ambiente text, p_actor uuid, p_credenciales_actualizadas_at timestamptz,
  p_version_esperada integer, p_datos jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cred public.facturapi_credenciales; v_version integer; v_rfc text; v_tipo text; v_id uuid;
BEGIN
  IF NOT public.has_any_role_in_org_exact(p_actor,
    ARRAY['admin','admin_org','contador']::public.app_role[], p_org_id) THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF p_ambiente IS NULL OR p_ambiente NOT IN ('sandbox','live') OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object'
    OR coalesce(length(p_datos->>'facturapi_org_id'), 0) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_DATOS_INVALIDOS' USING ERRCODE = '22023';
  END IF;
  -- Serializa sincronización/confirmación y detecta rotación durante la llamada externa.
  SELECT * INTO v_cred FROM public.facturapi_credenciales WHERE organization_id = p_org_id FOR UPDATE;
  IF v_cred.organization_id IS NULL OR v_cred.updated_at IS DISTINCT FROM p_credenciales_actualizadas_at THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_CONFIG_CAMBIO' USING ERRCODE = '40001';
  END IF;
  SELECT coalesce(max(version), 0) INTO v_version FROM public.perfiles_fiscales_emisor
    WHERE organization_id = p_org_id AND ambiente = p_ambiente;
  IF v_version IS DISTINCT FROM p_version_esperada THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_VERSION_CAMBIO' USING ERRCODE = '40001';
  END IF;
  -- Vincular solo si falta; un ID distinto se conserva y produce una discordancia visible.
  IF v_cred.facturapi_org_id IS NULL THEN
    UPDATE public.facturapi_credenciales SET facturapi_org_id = p_datos->>'facturapi_org_id'
      WHERE organization_id = p_org_id RETURNING * INTO v_cred;
  END IF;
  v_rfc := nullif(upper(btrim(p_datos->>'rfc')), '');
  IF v_rfc NOT IN ('XAXX010101000','XEXX010101000') THEN
    v_tipo := CASE WHEN v_rfc ~ '^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$' THEN 'fisica'
      WHEN v_rfc ~ '^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$' THEN 'moral' END;
  END IF;
  INSERT INTO public.perfiles_fiscales_emisor (
    organization_id, ambiente, version, facturapi_org_id, rfc, razon_social, tipo_persona,
    regimen_fiscal, codigo_postal, credenciales_actualizadas_at, sincronizado_por
  ) VALUES (
    p_org_id, p_ambiente, v_version + 1, p_datos->>'facturapi_org_id', v_rfc,
    nullif(btrim(p_datos->>'razon_social'), ''), v_tipo, nullif(btrim(p_datos->>'regimen_fiscal'), ''),
    nullif(btrim(p_datos->>'codigo_postal'), ''), v_cred.updated_at, p_actor
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_perfil_fiscal_emisor(uuid, text, uuid, timestamptz, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_perfil_fiscal_emisor(uuid, text, uuid, timestamptz, integer, jsonb) TO service_role;
