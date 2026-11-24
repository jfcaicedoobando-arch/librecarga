ALTER TABLE public.crm_solicitudes_pricing
  ADD COLUMN IF NOT EXISTS origen_cp text,
  ADD COLUMN IF NOT EXISTS destino_cp text,
  ADD COLUMN IF NOT EXISTS paradas text[],
  ADD COLUMN IF NOT EXISTS cruce_fronterizo boolean,
  ADD COLUMN IF NOT EXISTS in_bond boolean,
  ADD COLUMN IF NOT EXISTS tipo_unidad text,
  ADD COLUMN IF NOT EXISTS tarimas integer,
  ADD COLUMN IF NOT EXISTS arrastre_puerto text,
  ADD COLUMN IF NOT EXISTS retorno_vacio boolean,
  ADD COLUMN IF NOT EXISTS sobrepeso boolean;
ALTER TABLE public.crm_solicitudes_pricing
  ADD CONSTRAINT crm_sol_pricing_terrestre_campos CHECK (
    servicio = 'Terrestre' OR (origen_cp IS NULL AND destino_cp IS NULL AND paradas IS NULL
      AND cruce_fronterizo IS NULL AND in_bond IS NULL AND tipo_unidad IS NULL AND tarimas IS NULL
      AND arrastre_puerto IS NULL AND retorno_vacio IS NULL AND sobrepeso IS NULL)),
  ADD CONSTRAINT crm_sol_pricing_terrestre_valores CHECK (
    (origen_cp IS NULL OR origen_cp ~ '^[0-9]{5}$')
    AND (destino_cp IS NULL OR destino_cp ~ '^[0-9]{5}$')
    AND (paradas IS NULL OR cardinality(paradas) BETWEEN 1 AND 5)
    AND (in_bond IS NULL OR cruce_fronterizo IS TRUE)
    AND (tarimas IS NULL OR tarimas BETWEEN 1 AND 60)
    AND (tipo_unidad IS NULL OR char_length(tipo_unidad) <= 60)
    AND (arrastre_puerto IS NULL OR char_length(arrastre_puerto) <= 200));
CREATE OR REPLACE FUNCTION public._crm_pricing_hay_tarifa_vigente(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT sp.*, greatest((now() AT TIME ZONE 'America/Mexico_City')::date,
             coalesce(sp.fecha_tentativa_carga::date, (now() AT TIME ZONE 'America/Mexico_City')::date)) AS f
      FROM public.crm_solicitudes_pricing sp WHERE sp.id = p_id
  )
  SELECT EXISTS (
    SELECT 1 FROM s JOIN public.costeo_tarifas t ON t.organization_id = s.organization_id
     WHERE t.estado = 'vigente' AND t.estado_aprobacion = 'vigente'
       AND t.vigente_desde <= s.f AND t.vigente_hasta >= s.f
       AND (
         (s.servicio = 'Aéreo' AND t.modo = 'Aéreo'
           AND t.aeropuerto_origen = upper(substring(s.pol from '^\s*([A-Za-z]{3})(?:\s|$|—|-)'))
           AND t.aeropuerto_destino = upper(substring(s.pod from '^\s*([A-Za-z]{3})(?:\s|$|—|-)')))
         OR
         (s.servicio = 'Marítimo' AND s.submodalidad = 'FCL' AND coalesce(t.modo, 'Marítimo') = 'Marítimo'
           AND EXISTS (SELECT 1 FROM public.costeo_rutas r
               JOIN public.puertos po ON po.id = r.puerto_origen_id
               JOIN public.puertos pd ON pd.id = r.puerto_destino_id
              WHERE r.id = t.ruta_id
                AND upper(po.code) = upper(substring(s.pol from '\(([A-Za-z0-9]{5})\)\s*$'))
                AND upper(pd.code) = upper(substring(s.pod from '\(([A-Za-z0-9]{5})\)\s*$')))
           AND EXISTS (SELECT 1 FROM public.tipos_contenedor tc WHERE tc.id = t.tipo_contenedor_id
                AND lower(tc.name) = lower(trim(coalesce(nullif(s.tipo_carga, ''), s.container_size)))))
         OR
         (s.servicio = 'Terrestre' AND t.modo = 'Terrestre' AND t.submodalidad = s.submodalidad
           AND ((s.origen_cp IS NOT NULL AND t.origen_cp = s.origen_cp)
                OR lower(trim(t.origen_ciudad)) = lower(trim(s.pol)))
           AND ((s.destino_cp IS NOT NULL AND t.destino_cp = s.destino_cp)
                OR lower(trim(t.destino_ciudad)) = lower(trim(s.pod)))
           AND (s.submodalidad <> 'FTL' OR lower(trim(t.tipo_unidad)) = lower(trim(s.tipo_unidad))))
       )
  )
$function$;
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
  IF v.solicitante_id IS NULL THEN v_faltan := v_faltan || 'Solicitante'::text; END IF;
  IF v.fecha IS NULL THEN v_faltan := v_faltan || 'Fecha'::text; END IF;
  IF coalesce(trim(v.cliente), '') = '' THEN v_faltan := v_faltan || 'Cliente'::text; END IF;
  IF v.servicio IS NULL THEN v_faltan := v_faltan || 'Modo de transporte'::text; END IF;
  IF v.servicio IN ('Marítimo','Terrestre') AND v.submodalidad IS NULL THEN v_faltan := v_faltan || 'Submodalidad'::text; END IF;
  IF v.tipo_operacion IS NULL THEN v_faltan := v_faltan || 'Tipo de operación'::text; END IF;
  IF v.incoterm IS NULL THEN v_faltan := v_faltan || 'Incoterm'::text; END IF;
  IF v.sector_economico IS NULL THEN v_faltan := v_faltan || 'Sector económico'::text; END IF;
  IF v.imo IS NULL THEN v_faltan := v_faltan || 'IMO'::text; END IF;
  IF coalesce(trim(v.commodity), '') = '' THEN v_faltan := v_faltan || 'Commodity'::text; END IF;
  IF v.tipo_carga IS NULL AND v.submodalidad IN ('FCL','Arrastre') THEN v_faltan := v_faltan || 'Tipo de contenedor'::text; END IF;
  IF v.cantidad IS NULL THEN v_faltan := v_faltan || 'Cantidad'::text; END IF;
  IF v.estibable IS NULL THEN v_faltan := v_faltan || 'Estibable'::text; END IF;
  IF coalesce(trim(v.peso), '') = '' THEN v_faltan := v_faltan || 'Peso'::text; END IF;
  IF v.unidad_medida IS NULL THEN v_faltan := v_faltan || 'Unidad de medida'::text; END IF;
  IF coalesce(trim(v.dimensiones), '') = '' THEN v_faltan := v_faltan || 'Dimensiones'::text; END IF;
  IF coalesce(trim(v.origen), '') = '' THEN v_faltan := v_faltan || 'País de origen'::text; END IF;
  IF coalesce(trim(v.pol), '') = '' THEN v_faltan := v_faltan || CASE WHEN v.servicio = 'Terrestre' THEN 'Ciudad de origen' ELSE 'Puerto de origen' END; END IF;
  IF coalesce(trim(v.destino), '') = '' THEN v_faltan := v_faltan || 'País de destino'::text; END IF;
  IF coalesce(trim(v.pod), '') = '' THEN v_faltan := v_faltan || CASE WHEN v.servicio = 'Terrestre' THEN 'Ciudad de destino' ELSE 'Puerto de destino' END; END IF;
  IF v.servicio = 'Terrestre' AND v.submodalidad = 'FTL' AND coalesce(trim(v.tipo_unidad), '') = '' THEN v_faltan := v_faltan || 'Tipo de unidad'::text; END IF;
  IF v.servicio = 'Terrestre' AND v.submodalidad = 'LTL' AND v.tarimas IS NULL THEN v_faltan := v_faltan || 'Tarimas'::text; END IF;
  IF v.submodalidad = 'LCL' AND v.volumen_cbm IS NULL THEN v_faltan := v_faltan || 'Volumen (CBM)'::text; END IF;
  IF v.imo IS TRUE AND v.imo_clase IS NULL THEN v_faltan := v_faltan || 'Clase IMO'::text; END IF;
  IF v.imo IS TRUE AND v.imo_un IS NULL THEN v_faltan := v_faltan || 'Número UN'::text; END IF;
  IF array_length(v_faltan, 1) > 0 THEN
    RAISE EXCEPTION 'LC_PRICING_INCOMPLETA: %', array_to_string(v_faltan, ', ') USING ERRCODE = 'P0001';
  END IF;
  IF v.servicio <> 'Marítimo' AND v.incoterm IN ('FAS','FOB','CFR','CIF') THEN
    RAISE EXCEPTION 'LC_PRICING_INCOTERM_MODO' USING ERRCODE = 'P0001';
  END IF;
  v_comp := CASE WHEN v.imo IS TRUE OR v.sector_economico = 'Carga Proyecto'
      OR v.tipo_carga ~* '(open ?top|flat ?rack|reefer|refriger|platform|plataforma|tank|isotanque|special|especial)'
    THEN 'alta' WHEN public._crm_pricing_hay_tarifa_vigente(p_id) THEN 'baja' ELSE 'media' END;
  v_horas := public._crm_pricing_horas_modo(v_comp, v.servicio);
  PERFORM set_config('lc.pricing_rpc', '1', true);
  UPDATE public.crm_solicitudes_pricing SET estado = 'enviada', enviada_at = now(), complejidad = v_comp,
    tipo_solicitud = coalesce(v.tipo_solicitud, 'nueva_ruta'),
    vence_at = CASE WHEN v_horas IS NULL THEN NULL ELSE public._crm_pricing_sumar_horas_habiles(now(), v_horas) END WHERE id = p_id;
  PERFORM set_config('lc.pricing_rpc', '', true);
  INSERT INTO public.notificaciones_internas (organization_id, usuario_id, tipo, titulo, mensaje, enlace, entidad_tipo, entidad_id)
  SELECT DISTINCT v.organization_id, om.user_id, 'crm_pricing_solicitud', 'Nueva solicitud de pricing ' || v.folio,
         coalesce(v.cliente, 'Sin cliente') || ' · ' || coalesce(v.pol, v.origen, '') || ' → ' || coalesce(v.pod, v.destino, '')
           || CASE WHEN v_horas IS NULL THEN ' · tarifa vigente disponible' ELSE ' · responder en ' || v_horas || ' h hábiles' END,
         '/costeo/solicitudes?id=' || v.id, 'crm_solicitud_pricing', v.id
    FROM public.organization_members om
   WHERE om.organization_id = v.organization_id AND om.role IN ('ejecutivo_pricing','gerente_operaciones');
  RETURN jsonb_build_object('id', v.id, 'ya_enviada', false);
END $function$;