-- Sólo cinco avisos seleccionados: permisos locales sin alterar auxiliares globales.
DO $review$ DECLARE v_def text; BEGIN
 v_def := pg_get_functiondef('public.crear_proforma_atomica(uuid,uuid,uuid,text,text,text,uuid[],numeric,numeric,numeric,numeric,numeric,numeric,text,text,integer,numeric,jsonb)'::regprocedure);
 IF md5(v_def) <> 'f742e54119b112cb4bd10ea751ab96fd' THEN RAISE EXCEPTION 'Definición cambió: crear_proforma_atomica'; END IF;
 v_def := replace(v_def,$old$    v_org := current_user_org_id();
  END IF;
  PERFORM public._assert_writer(v_org);
  -- Ola E1 · C5: el embarque debe existir en la organización y coincidir con
  -- el cliente recibido; antes se confiaba en los argumentos del cliente.
  IF NOT EXISTS (
$old$,$new$    v_org := current_user_org_id();
  END IF;
  PERFORM public._assert_writer(v_org);
  IF NOT public.has_any_role_in_org(auth.uid(),
    ARRAY['admin','operador','contador']::public.app_role[], v_org) THEN
    RAISE EXCEPTION 'Permisos insuficientes' USING ERRCODE = '42501';
  END IF;
  -- Ola E1 · C5: el embarque debe existir en la organización y coincidir con
  -- el cliente recibido; antes se confiaba en los argumentos del cliente.
  IF NOT EXISTS (
$new$);
 EXECUTE v_def;
END $review$;

DO $review$ DECLARE v_def text; BEGIN
 v_def := pg_get_functiondef('public.crm_vincular_cotizacion(uuid,jsonb,uuid,uuid)'::regprocedure);
 IF md5(v_def) <> '9fb71cf473e524b1215ad3ac799a3855' THEN RAISE EXCEPTION 'Definición cambió: crm_vincular_cotizacion'; END IF;
 v_def := replace(v_def,$old$
  IF NOT public.is_org_member(v_org)
     OR NOT public.rls_tenant_scope_ok(v_org)
     OR NOT public.puede_escribir_cotizaciones() THEN
    RAISE EXCEPTION 'LC_COTIZACION_SIN_PERMISO_ESCRITURA' USING ERRCODE = '42501';
  END IF;

$old$,$new$
  IF NOT public.is_org_member(v_org)
     OR NOT public.rls_tenant_scope_ok(v_org)
     OR NOT public.puede_escribir_cotizaciones()
     OR NOT public.has_any_role_in_org(auth.uid(),
       ARRAY['admin','admin_org','gerente_comercial','vendedor','ejecutivo_pricing',
             'coordinador_logistico','gerente_operaciones','operador','customer_service']::public.app_role[],
       v_org) THEN
    RAISE EXCEPTION 'LC_COTIZACION_SIN_PERMISO_ESCRITURA' USING ERRCODE = '42501';
  END IF;

$new$);
 EXECUTE v_def;
END $review$;

DO $review$ DECLARE v_def text; BEGIN
 v_def := pg_get_functiondef('public.duplicar_embarque_completo(uuid,jsonb,uuid)'::regprocedure);
 IF md5(v_def) <> 'aa6e5e8b32e24414d4de71f60f39dec9' THEN RAISE EXCEPTION 'Definición cambió: duplicar_embarque_completo'; END IF;
 v_def := replace(v_def,$old$  SELECT * INTO origen FROM embarques WHERE id = p_embarque_origen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Embarque origen no encontrado'; END IF;
  PERFORM public._assert_writer(origen.organization_id);

  FOR copia IN SELECT * FROM jsonb_array_elements(p_copias)
  LOOP
$old$,$new$  SELECT * INTO origen FROM embarques WHERE id = p_embarque_origen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Embarque origen no encontrado'; END IF;
  PERFORM public._assert_writer(origen.organization_id);
  IF NOT public.has_any_role_in_org(auth.uid(),
    ARRAY['admin','operador','contador']::public.app_role[], origen.organization_id) THEN
    RAISE EXCEPTION 'Permisos insuficientes' USING ERRCODE = '42501';
  END IF;


  FOR copia IN SELECT * FROM jsonb_array_elements(p_copias)
  LOOP
$new$);
 EXECUTE v_def;
END $review$;

DO $review$ DECLARE v_def text; BEGIN
 v_def := pg_get_functiondef('public.eliminar_pago_cliente(uuid,text)'::regprocedure);
 IF md5(v_def) <> '0462986b0e6d9f0ccd17bc7fb4a3c18e' THEN RAISE EXCEPTION 'Definición cambió: eliminar_pago_cliente'; END IF;
 v_def := replace(v_def,$old$    RAISE EXCEPTION 'LC_PAGO_NO_ENCONTRADO: el pago % no existe', _pago_id USING ERRCODE = 'P0002';
  END IF;

  IF v_pago.deleted_at IS NOT NULL THEN
    -- Idempotente: no se vuelve a tocar el banco ni la bitacora.
    RETURN jsonb_build_object(
      'pago_id', _pago_id, 'ya_eliminado', true,
      'movimientos_baja', 0, 'movimientos_desvinculados', 0
    );
  END IF;

  IF NOT public.has_role(v_uid, 'super_admin'::app_role)
     AND v_pago.organization_id IS DISTINCT FROM public.current_user_org_id() THEN
$old$,$new$    RAISE EXCEPTION 'LC_PAGO_NO_ENCONTRADO: el pago % no existe', _pago_id USING ERRCODE = 'P0002';
  END IF;


  IF NOT public.has_role(v_uid, 'super_admin'::app_role)
     AND v_pago.organization_id IS DISTINCT FROM public.current_user_org_id() THEN
$new$);
 v_def := replace(v_def,$old$      USING ERRCODE = '42501';
  END IF;

  IF NOT public.es_escritor_financiero(v_uid) THEN
    RAISE EXCEPTION 'LC_PAGO_SIN_PERMISO: tu rol no puede eliminar pagos'
      USING ERRCODE = '42501';
  END IF;

  IF v_pago.uuid_rep IS NOT NULL AND v_pago.rep_cancelado_en IS NULL THEN
$old$,$new$      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role_in_org_exact(v_uid,
    ARRAY['super_admin','admin','admin_org','contador','tesorero','ejecutivo_cobranza']::public.app_role[],
    v_pago.organization_id) THEN
    RAISE EXCEPTION 'LC_PAGO_SIN_PERMISO: tu rol no puede eliminar pagos'
      USING ERRCODE = '42501';
  END IF;

  IF v_pago.deleted_at IS NOT NULL THEN
    -- Idempotente: no se vuelve a tocar el banco ni la bitacora.
    RETURN jsonb_build_object(
      'pago_id', _pago_id, 'ya_eliminado', true,
      'movimientos_baja', 0, 'movimientos_desvinculados', 0
    );
  END IF;

  IF v_pago.uuid_rep IS NOT NULL AND v_pago.rep_cancelado_en IS NULL THEN
$new$);
 EXECUTE v_def;
END $review$;

DO $review$ DECLARE v_def text; BEGIN
 v_def := pg_get_functiondef('public.obtener_costos_cotizacion_version(uuid,integer)'::regprocedure);
 IF md5(v_def) <> 'df70156d0db5c647d6ca8f0aad6cfdda' THEN RAISE EXCEPTION 'Definición cambió: obtener_costos_cotizacion_version'; END IF;
 v_def := replace(v_def,$old$  IF v_org IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_members WHERE organization_id=v_org AND user_id=auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  v_target := COALESCE(p_version, v_actual);
  IF v_target = v_actual THEN
    RETURN QUERY SELECT to_jsonb(cc) FROM cotizacion_costos cc
      WHERE cc.cotizacion_id = p_cotizacion_id AND cc.deleted_at IS NULL;
  ELSE
    RETURN QUERY SELECT to_jsonb(ch) FROM cotizacion_costos_historico ch
      WHERE ch.cotizacion_id = p_cotizacion_id AND ch.version = v_target;
  END IF;
END $function$
$old$,$new$  IF v_org IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_members WHERE organization_id=v_org AND user_id=auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  IF NOT (
    (v_org = public.current_user_org_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
    AND public.rls_tenant_scope_ok(v_org)
    AND (public.puede_ver_costos_cotizacion(auth.uid())
         OR public.puede_ver_costos_cotizacion_propia(p_cotizacion_id, auth.uid()))
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  v_target := COALESCE(p_version, v_actual);
  IF v_target = v_actual THEN
    RETURN QUERY SELECT to_jsonb(cc) FROM cotizacion_costos cc
      WHERE cc.cotizacion_id = p_cotizacion_id AND cc.organization_id = v_org AND cc.deleted_at IS NULL;
  ELSE
    RETURN QUERY SELECT to_jsonb(ch) FROM cotizacion_costos_historico ch
      WHERE ch.cotizacion_id = p_cotizacion_id AND ch.organization_id = v_org AND ch.version = v_target;
  END IF;
END $function$
$new$);
 EXECUTE v_def;
END $review$;
