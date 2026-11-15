CREATE OR REPLACE FUNCTION public._evaluar_isr_resico(
  p_org_id uuid, p_cliente_id uuid, p_ambiente text,
  p_cantidad numeric, p_precio_unitario numeric, p_tipo_iva text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_perfil public.perfiles_fiscales_emisor;
  v_cred public.facturapi_credenciales;
  v_cliente public.clientes;
  v_rfc_empresa text;
  v_perfil_estado jsonb;
  v_receptor text;
  v_estado text := 'pendiente';
  v_motivo text;
  v_tasa numeric;
  v_base numeric;
  v_fecha_rfc text;
  v_rfc_valido boolean := false;
BEGIN
  IF p_ambiente IS NULL OR p_ambiente NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'LC_ISR_AMBIENTE_INVALIDO' USING ERRCODE = '22023';
  END IF;
  IF p_cantidad IS NULL OR p_precio_unitario IS NULL
    OR p_cantidad::text IN ('NaN','Infinity','-Infinity')
    OR p_precio_unitario::text IN ('NaN','Infinity','-Infinity')
    OR p_cantidad <= 0 OR p_precio_unitario < 0
    OR scale(p_cantidad) > 6 OR scale(p_precio_unitario) > 6 THEN
    RAISE EXCEPTION 'LC_ISR_IMPORTES_INVALIDOS' USING ERRCODE = '22023';
  END IF;
  v_base := round(p_cantidad * p_precio_unitario, 2);
  SELECT * INTO v_cred FROM public.facturapi_credenciales WHERE organization_id = p_org_id;
  SELECT * INTO v_perfil FROM public.perfiles_fiscales_emisor
    WHERE organization_id = p_org_id AND ambiente = p_ambiente ORDER BY version DESC LIMIT 1;
  SELECT valor #>> '{}' INTO v_rfc_empresa FROM public.configuracion
    WHERE organization_id = p_org_id AND categoria = 'empresa' AND clave = 'rfc';
  SELECT * INTO v_cliente FROM public.clientes
    WHERE id = p_cliente_id AND organization_id = p_org_id AND deleted_at IS NULL;
  v_perfil_estado := public._perfil_fiscal_emisor_resultado(v_perfil, v_cred, v_rfc_empresa);
  v_receptor := upper(btrim(v_cliente.rfc));
  IF v_receptor ~ '^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$' THEN
    v_fecha_rfc := substring(v_receptor FROM length(v_receptor)-8 FOR 6);
    BEGIN
      PERFORM make_date(2000+substring(v_fecha_rfc FROM 1 FOR 2)::integer,
        substring(v_fecha_rfc FROM 3 FOR 2)::integer,substring(v_fecha_rfc FROM 5 FOR 2)::integer);
      v_rfc_valido := true;
    EXCEPTION WHEN datetime_field_overflow THEN v_rfc_valido := false;
    END;
  END IF;
  IF v_cred.ambiente IS DISTINCT FROM p_ambiente THEN
    v_motivo := 'ambiente_discordante';
  ELSIF v_perfil_estado->>'estado' IS DISTINCT FROM 'confirmado' THEN
    v_motivo := 'perfil_no_confirmado';
  ELSIF v_cliente.id IS NULL THEN
    v_motivo := 'receptor_no_identificado';
  ELSIF v_receptor IN ('XAXX010101000','XEXX010101000') THEN
    v_motivo := 'receptor_generico_o_extranjero';
  ELSIF NOT v_rfc_valido THEN
    v_motivo := 'receptor_no_identificado';
  ELSIF v_perfil.tipo_persona = 'moral' OR v_perfil.regimen_fiscal <> '626' THEN
    v_estado := 'no_aplica'; v_tasa := 0; v_motivo := 'emisor_fuera_regla_resico';
  ELSIF length(v_receptor) = 13 THEN
    v_estado := 'no_aplica'; v_tasa := 0; v_motivo := 'receptor_persona_fisica';
  ELSIF v_perfil.vigente_desde IS NULL OR v_perfil.vigente_desde > public.fecha_negocio_mx() THEN
    v_motivo := 'vigencia_perfil_pendiente';
  ELSIF p_tipo_iva IS NULL OR p_tipo_iva NOT IN ('gravado_16','gravado_8','tasa_0','exento') THEN
    v_motivo := CASE WHEN p_tipo_iva = 'no_objeto' THEN 'conflicto_no_objeto' ELSE 'clasificacion_pendiente' END;
  ELSE
    v_estado := 'aplica'; v_tasa := 0.0125; v_motivo := 'pf_resico_receptor_moral';
  END IF;
  RETURN jsonb_build_object(
    'regla_version','resico_113j_v1','precision_version','base_exacta_impuesto_2_v1',
    'estado',v_estado,'motivo',v_motivo,'ambiente',p_ambiente,
    'base',v_base,'base_exacta',p_cantidad*p_precio_unitario,'tasa_ret_isr',v_tasa,
    'monto_ret_isr',round(p_cantidad*p_precio_unitario*v_tasa,2),
    'perfil_id',v_perfil.id,'perfil_version',v_perfil.version,
    'emisor',jsonb_build_object('rfc',v_perfil.rfc,'tipo_persona',v_perfil.tipo_persona,
      'regimen_fiscal',v_perfil.regimen_fiscal,'vigente_desde',v_perfil.vigente_desde),
    'receptor',jsonb_build_object('id',v_cliente.id,'rfc',v_receptor));
END;
$$;
