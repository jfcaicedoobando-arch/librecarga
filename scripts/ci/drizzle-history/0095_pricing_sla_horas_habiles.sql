CREATE OR REPLACE FUNCTION public._crm_pricing_sumar_horas_habiles(p_inicio timestamptz, p_horas integer)
 RETURNS timestamptz
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
-- Horario hábil de Pricing (America/Mexico_City): L-V 09:00-18:00, sábado 09:00-14:00, domingo cerrado.
DECLARE v_local timestamp; v_rest numeric; v_dow int; v_ab timestamp; v_ci timestamp; v_disp numeric; i int;
BEGIN
  IF p_inicio IS NULL OR p_horas IS NULL THEN RETURN NULL; END IF;
  v_local := p_inicio AT TIME ZONE 'America/Mexico_City';
  v_rest := p_horas * 60;
  FOR i IN 1..500 LOOP
    v_dow := extract(isodow FROM v_local)::int;
    v_ab := date_trunc('day', v_local) + interval '9 hours';
    v_ci := date_trunc('day', v_local) + CASE WHEN v_dow = 6 THEN interval '14 hours' ELSE interval '18 hours' END;
    IF v_dow <> 7 AND v_local < v_ci THEN
      IF v_local < v_ab THEN v_local := v_ab; END IF;
      v_disp := extract(epoch FROM v_ci - v_local) / 60;
      IF v_rest <= v_disp THEN
        RETURN (v_local + make_interval(mins => v_rest::int)) AT TIME ZONE 'America/Mexico_City';
      END IF;
      v_rest := v_rest - v_disp;
    END IF;
    v_local := date_trunc('day', v_local) + interval '1 day';
  END LOOP;
  RAISE EXCEPTION 'LC_PRICING_PLAZO_FUERA_DE_RANGO' USING ERRCODE = 'P0001';
END $function$;
REVOKE ALL ON FUNCTION public._crm_pricing_sumar_horas_habiles(timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._crm_pricing_sumar_horas_habiles(timestamptz, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_enviar_solicitud_pricing(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v record; v_horas int; v_comp text; v_faltan text[] := '{}';
BEGIN
  SELECT * INTO v FROM public.crm_solicitudes_pricing WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF v.id IS NULL OR v.organization_id IS DISTINCT FROM public.org_scope() THEN
    RAISE EXCEPTION 'LC_PRICING_NO_ENCONTRADA' USING ERRCODE = 'P0001';
  END IF;
  IF v.estado = 'enviada' THEN RETURN jsonb_build_object('id', v.id, 'vence_at', v.vence_at, 'ya_enviada', true); END IF;
  IF v.estado <> 'borrador' THEN RAISE EXCEPTION 'LC_PRICING_ESTADO_INVALIDO' USING ERRCODE = 'P0001'; END IF;
  IF v.created_by IS DISTINCT FROM auth.uid() AND NOT public._crm_es_pricing(v.organization_id) THEN
    RAISE EXCEPTION 'LC_PRICING_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  -- Obligatorios: todo excepto notas, delivery, fecha tentativa de carga y adjuntos.
  IF v.solicitante_id IS NULL THEN v_faltan := v_faltan || 'Solicitante'::text; END IF;
  IF v.fecha IS NULL THEN v_faltan := v_faltan || 'Fecha'::text; END IF;
  IF coalesce(trim(v.cliente), '') = '' THEN v_faltan := v_faltan || 'Cliente'::text; END IF;
  IF v.servicio IS NULL THEN v_faltan := v_faltan || 'Modo de transporte'::text; END IF;
  IF v.tipo_operacion IS NULL THEN v_faltan := v_faltan || 'Tipo de operación'::text; END IF;
  IF v.incoterm IS NULL THEN v_faltan := v_faltan || 'Incoterm'::text; END IF;
  IF v.sector_economico IS NULL THEN v_faltan := v_faltan || 'Sector económico'::text; END IF;
  IF v.imo IS NULL THEN v_faltan := v_faltan || 'IMO'::text; END IF;
  IF coalesce(trim(v.commodity), '') = '' THEN v_faltan := v_faltan || 'Commodity'::text; END IF;
  IF v.tipo_carga IS NULL THEN v_faltan := v_faltan || 'Tipo de contenedor'::text; END IF;
  IF v.cantidad IS NULL THEN v_faltan := v_faltan || 'Cantidad'::text; END IF;
  IF v.estibable IS NULL THEN v_faltan := v_faltan || 'Estibable'::text; END IF;
  IF coalesce(trim(v.peso), '') = '' THEN v_faltan := v_faltan || 'Peso'::text; END IF;
  IF v.unidad_medida IS NULL THEN v_faltan := v_faltan || 'Unidad de medida'::text; END IF;
  IF coalesce(trim(v.dimensiones), '') = '' THEN v_faltan := v_faltan || 'Dimensiones'::text; END IF;
  IF coalesce(trim(v.origen), '') = '' THEN v_faltan := v_faltan || 'País de origen'::text; END IF;
  IF coalesce(trim(v.pol), '') = '' THEN v_faltan := v_faltan || 'Puerto de origen'::text; END IF;
  IF coalesce(trim(v.destino), '') = '' THEN v_faltan := v_faltan || 'País de destino'::text; END IF;
  IF coalesce(trim(v.pod), '') = '' THEN v_faltan := v_faltan || 'Puerto de destino'::text; END IF;
  IF array_length(v_faltan, 1) > 0 THEN
    RAISE EXCEPTION 'LC_PRICING_INCOMPLETA: %', array_to_string(v_faltan, ', ') USING ERRCODE = 'P0001';
  END IF;
  -- Complejidad automática: especial si hay IMO, carga proyecto o contenedor especial.
  v_comp := CASE WHEN v.imo IS TRUE OR v.sector_economico = 'Carga Proyecto'
      OR v.tipo_carga ~* '(open ?top|flat ?rack|reefer|refriger|platform|plataforma|tank|isotanque|special|especial)'
    THEN 'alta' ELSE 'media' END;
  v_horas := public._crm_pricing_horas(v_comp);
  PERFORM set_config('lc.pricing_rpc', '1', true);
  UPDATE public.crm_solicitudes_pricing SET estado = 'enviada', enviada_at = now(), complejidad = v_comp,
    tipo_solicitud = coalesce(v.tipo_solicitud, 'nueva_ruta'),
    vence_at = public._crm_pricing_sumar_horas_habiles(now(), v_horas) WHERE id = p_id;
  PERFORM set_config('lc.pricing_rpc', '', true);
  INSERT INTO public.notificaciones_internas (organization_id, usuario_id, tipo, titulo, mensaje, enlace, entidad_tipo, entidad_id)
  SELECT DISTINCT v.organization_id, om.user_id, 'crm_pricing_solicitud', 'Nueva solicitud de pricing ' || v.folio,
         coalesce(v.cliente, 'Sin cliente') || ' · ' || coalesce(v.pol, v.origen, '') || ' → ' || coalesce(v.pod, v.destino, '')
           || ' · responder en ' || v_horas || ' h',
         '/costeo/solicitudes?id=' || v.id, 'crm_solicitud_pricing', v.id
    FROM public.organization_members om
   WHERE om.organization_id = v.organization_id AND om.role IN ('ejecutivo_pricing','gerente_operaciones');
  RETURN jsonb_build_object('id', v.id, 'ya_enviada', false);
END $function$;

CREATE OR REPLACE FUNCTION public.crm_pricing_ampliar_plazo(p_id uuid, p_horas integer, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM crm_solicitudes_pricing WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF v.id IS NULL OR v.organization_id IS DISTINCT FROM org_scope() THEN RAISE EXCEPTION 'LC_PRICING_NO_ENCONTRADA' USING ERRCODE = 'P0001'; END IF;
  IF NOT _crm_pricing_es_gerente_ops(v.organization_id) THEN RAISE EXCEPTION 'LC_PRICING_SOLO_GERENTE_OPS' USING ERRCODE = '42501'; END IF;
  IF v.estado <> 'enviada' OR v.complejidad <> 'alta' THEN RAISE EXCEPTION 'LC_PRICING_PLAZO_NO_AMPLIABLE' USING ERRCODE = 'P0001'; END IF;
  IF now() > v.enviada_at + interval '8 hours' THEN RAISE EXCEPTION 'LC_PRICING_PLAZO_FUERA_DE_TIEMPO' USING ERRCODE = 'P0001'; END IF;
  IF p_horas IS NULL OR p_horas <= 48 OR p_horas > 720 THEN RAISE EXCEPTION 'LC_PRICING_HORAS_INVALIDAS' USING ERRCODE = 'P0001'; END IF;
  IF length(trim(coalesce(p_motivo, ''))) < 10 THEN RAISE EXCEPTION 'LC_PRICING_MOTIVO_REQUERIDO' USING ERRCODE = 'P0001'; END IF;
  PERFORM set_config('lc.pricing_rpc', '1', true);
  UPDATE crm_solicitudes_pricing SET vence_at = public._crm_pricing_sumar_horas_habiles(enviada_at, p_horas), plazo_motivo = trim(p_motivo)
   WHERE id = p_id;
  PERFORM set_config('lc.pricing_rpc', '', true);
  PERFORM _crm_pricing_avisar_cambio(v.organization_id, v.id, v.solicitante_id, 'Nuevo plazo ' || v.folio,
    'Plazo de respuesta: ' || p_horas || ' h · Motivo: ' || trim(p_motivo));
  RETURN jsonb_build_object('id', v.id);
END $function$;

CREATE OR REPLACE FUNCTION public.crm_pricing_cambiar_complejidad(p_id uuid, p_complejidad text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v record; v_horas int;
BEGIN
  SELECT * INTO v FROM crm_solicitudes_pricing WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF v.id IS NULL OR v.organization_id IS DISTINCT FROM org_scope() THEN RAISE EXCEPTION 'LC_PRICING_NO_ENCONTRADA' USING ERRCODE = 'P0001'; END IF;
  IF NOT _crm_pricing_es_gerente_ops(v.organization_id) THEN RAISE EXCEPTION 'LC_PRICING_SOLO_GERENTE_OPS' USING ERRCODE = '42501'; END IF;
  IF v.estado <> 'enviada' THEN RAISE EXCEPTION 'LC_PRICING_ESTADO_INVALIDO' USING ERRCODE = 'P0001'; END IF;
  IF p_complejidad NOT IN ('baja','media','alta') THEN RAISE EXCEPTION 'LC_PRICING_COMPLEJIDAD_INVALIDA' USING ERRCODE = 'P0001'; END IF;
  IF length(trim(coalesce(p_motivo, ''))) < 10 THEN RAISE EXCEPTION 'LC_PRICING_MOTIVO_REQUERIDO' USING ERRCODE = 'P0001'; END IF;
  IF p_complejidad = v.complejidad THEN RETURN jsonb_build_object('id', v.id, 'sin_cambio', true); END IF;
  v_horas := _crm_pricing_horas(p_complejidad);
  PERFORM set_config('lc.pricing_rpc', '1', true);
  UPDATE crm_solicitudes_pricing SET complejidad = p_complejidad, complejidad_motivo = trim(p_motivo), plazo_motivo = NULL,
    vence_at = CASE WHEN v_horas IS NULL THEN NULL ELSE public._crm_pricing_sumar_horas_habiles(enviada_at, v_horas) END
   WHERE id = p_id;
  PERFORM set_config('lc.pricing_rpc', '', true);
  PERFORM _crm_pricing_avisar_cambio(v.organization_id, v.id, v.solicitante_id, 'Cambio de complejidad ' || v.folio,
    'Nueva complejidad: ' || p_complejidad || ' · Motivo: ' || trim(p_motivo));
  RETURN jsonb_build_object('id', v.id, 'sin_cambio', false);
END $function$;