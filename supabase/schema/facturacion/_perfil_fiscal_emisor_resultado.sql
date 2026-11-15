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
