-- Perfil fiscal versionado. Solo el adaptador Facturapi registra datos importados.
-- No activa impuestos, modifica CFDI ni reinterpreta documentos anteriores.
CREATE TABLE public.perfiles_fiscales_emisor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  ambiente text NOT NULL CHECK (ambiente IN ('sandbox', 'live')),
  version integer NOT NULL CHECK (version > 0),
  facturapi_org_id text NOT NULL CHECK (length(facturapi_org_id) BETWEEN 1 AND 100),
  rfc text,
  razon_social text,
  tipo_persona text CHECK (tipo_persona IN ('fisica', 'moral')),
  regimen_fiscal text,
  codigo_postal text,
  origen text NOT NULL DEFAULT 'facturapi' CHECK (origen = 'facturapi'),
  credenciales_actualizadas_at timestamptz NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  sincronizado_por uuid NOT NULL REFERENCES auth.users(id),
  confirmado_at timestamptz,
  confirmado_por uuid REFERENCES auth.users(id),
  vigente_desde date,
  CONSTRAINT perfiles_fiscales_emisor_version_key UNIQUE (organization_id, ambiente, version),
  CONSTRAINT perfiles_fiscales_emisor_confirmacion_check
    CHECK ((confirmado_at IS NULL) = (confirmado_por IS NULL)),
  CONSTRAINT perfiles_fiscales_emisor_datos_length_check CHECK (
    length(rfc) <= 20 AND length(razon_social) <= 300
    AND length(regimen_fiscal) <= 10 AND length(codigo_postal) <= 10)
);
ALTER TABLE public.perfiles_fiscales_emisor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.perfiles_fiscales_emisor FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.perfiles_fiscales_emisor TO authenticated, service_role;
DROP POLICY IF EXISTS perfil_fiscal_emisor_lectura ON public.perfiles_fiscales_emisor;
CREATE POLICY perfil_fiscal_emisor_lectura ON public.perfiles_fiscales_emisor
  FOR SELECT TO authenticated USING (
    organization_id = (SELECT public.org_scope())
    AND public.has_any_role_in_org_exact((SELECT auth.uid()),
      ARRAY['admin','admin_org','contador']::public.app_role[], organization_id)
  );

CREATE OR REPLACE FUNCTION public._perfil_fiscal_emisor_resultado(
  p_perfil public.perfiles_fiscales_emisor,
  p_cred public.facturapi_credenciales,
  p_rfc_empresa text
) RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_problemas text[] := '{}'; v_estado text;
BEGIN
  IF p_perfil.id IS NULL THEN
    RETURN jsonb_build_object('perfil', NULL, 'version', 0, 'estado', 'sin_sincronizar',
      'problemas', CASE WHEN p_cred.organization_id IS NULL
        THEN jsonb_build_array('credenciales_pendientes') ELSE '[]'::jsonb END);
  END IF;
  IF p_cred.organization_id IS NULL OR p_cred.updated_at IS DISTINCT FROM p_perfil.credenciales_actualizadas_at THEN
    v_problemas := array_append(v_problemas, 'credenciales_cambiadas');
  END IF;
  IF p_cred.facturapi_org_id IS DISTINCT FROM p_perfil.facturapi_org_id THEN
    v_problemas := array_append(v_problemas, 'organizacion_discordante');
  END IF;
  IF p_perfil.tipo_persona IS NULL THEN v_problemas := array_append(v_problemas, 'rfc_invalido'); END IF;
  IF nullif(btrim(p_rfc_empresa), '') IS NULL THEN
    v_problemas := array_append(v_problemas, 'rfc_empresa_pendiente');
  ELSIF upper(btrim(p_rfc_empresa)) IS DISTINCT FROM p_perfil.rfc THEN
    v_problemas := array_append(v_problemas, 'rfc_empresa_discordante');
  END IF;
  IF nullif(btrim(p_perfil.razon_social), '') IS NULL THEN
    v_problemas := array_append(v_problemas, 'razon_social_pendiente');
  END IF;
  IF p_perfil.regimen_fiscal IS NULL OR p_perfil.regimen_fiscal <> ALL (
    ARRAY['601','603','605','606','607','608','610','611','612','614','615','616','620','621','622','623','624','625','626']) THEN
    v_problemas := array_append(v_problemas, 'regimen_invalido');
  END IF;
  IF p_perfil.codigo_postal IS NULL OR p_perfil.codigo_postal !~ '^[0-9]{5}$' THEN
    v_problemas := array_append(v_problemas, 'codigo_postal_invalido');
  END IF;
  v_estado := CASE WHEN cardinality(v_problemas) > 0 THEN 'requiere_revision'
    WHEN p_perfil.confirmado_at IS NOT NULL THEN 'confirmado' ELSE 'sin_confirmar' END;
  RETURN jsonb_build_object('perfil', to_jsonb(p_perfil) - 'credenciales_actualizadas_at',
    'version', p_perfil.version, 'estado', v_estado, 'problemas', to_jsonb(v_problemas));
END;
$$;
REVOKE ALL ON FUNCTION public._perfil_fiscal_emisor_resultado(public.perfiles_fiscales_emisor, public.facturapi_credenciales, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._perfil_fiscal_emisor_resultado(public.perfiles_fiscales_emisor, public.facturapi_credenciales, text) TO service_role;

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

-- Ola16 boundary in addition to the fiscal-role/active-organization read policy.
CREATE POLICY perfiles_fiscales_emisor_tenant_restrictive ON public.perfiles_fiscales_emisor
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id))
  WITH CHECK ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id));
