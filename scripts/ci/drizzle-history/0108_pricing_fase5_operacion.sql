CREATE TABLE public.crm_pricing_modos_ejecutivo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  modo text NOT NULL CHECK (modo IN ('Marítimo','Aéreo','Terrestre')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, modo)
);
GRANT SELECT ON public.crm_pricing_modos_ejecutivo TO authenticated;
GRANT ALL ON public.crm_pricing_modos_ejecutivo TO service_role;
ALTER TABLE public.crm_pricing_modos_ejecutivo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Miembros de la organización activa leen modos de Pricing"
  ON public.crm_pricing_modos_ejecutivo FOR SELECT TO authenticated
  USING (organization_id = public.org_scope());

ALTER TABLE public.crm_solicitudes_pricing
  ADD COLUMN asignada_a uuid,
  ADD COLUMN pausada_at timestamptz,
  ADD COLUMN info_motivo text,
  ADD COLUMN motivo_sin_opcion text,
  ADD COLUMN aviso_80_at timestamptz,
  ADD COLUMN aviso_vencida_at timestamptz;

ALTER TABLE public.crm_solicitudes_pricing DROP CONSTRAINT crm_solicitudes_pricing_estado_check;
ALTER TABLE public.crm_solicitudes_pricing ADD CONSTRAINT crm_solicitudes_pricing_estado_check CHECK (estado = ANY (ARRAY[
  'borrador','enviada','asignada','en_proceso','info_requerida','respondida','sin_opcion','cancelada']));

CREATE OR REPLACE FUNCTION public._crm_sol_pricing_before_upd()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.folio <> OLD.folio OR NEW.organization_id <> OLD.organization_id
     OR NEW.oportunidad_id <> OLD.oportunidad_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'LC_PRICING_INMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(current_setting('lc.pricing_rpc', true), '') <> '1' AND (
     NEW.estado IS DISTINCT FROM OLD.estado OR NEW.enviada_at IS DISTINCT FROM OLD.enviada_at
     OR NEW.vence_at IS DISTINCT FROM OLD.vence_at OR NEW.respondida_at IS DISTINCT FROM OLD.respondida_at
     OR NEW.complejidad_motivo IS DISTINCT FROM OLD.complejidad_motivo OR NEW.plazo_motivo IS DISTINCT FROM OLD.plazo_motivo
     OR NEW.asignada_a IS DISTINCT FROM OLD.asignada_a OR NEW.pausada_at IS DISTINCT FROM OLD.pausada_at
     OR NEW.info_motivo IS DISTINCT FROM OLD.info_motivo OR NEW.motivo_sin_opcion IS DISTINCT FROM OLD.motivo_sin_opcion
     OR NEW.aviso_80_at IS DISTINCT FROM OLD.aviso_80_at OR NEW.aviso_vencida_at IS DISTINCT FROM OLD.aviso_vencida_at
     OR (OLD.estado <> 'borrador' AND (NEW.complejidad IS DISTINCT FROM OLD.complejidad
         OR NEW.tipo_solicitud IS DISTINCT FROM OLD.tipo_solicitud))) THEN
    RAISE EXCEPTION 'LC_PRICING_ESTADO_SOLO_RPC' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public._crm_pricing_horas_habiles_entre(p_desde timestamptz, p_hasta timestamptz)
 RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE d date; v_fin date; ini timestamptz; fin timestamptz; dow int; total numeric := 0;
BEGIN
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta <= p_desde THEN RETURN 0; END IF;
  d := (p_desde AT TIME ZONE 'America/Mexico_City')::date;
  v_fin := (p_hasta AT TIME ZONE 'America/Mexico_City')::date;
  WHILE d <= v_fin AND d - (p_desde AT TIME ZONE 'America/Mexico_City')::date <= 400 LOOP
    dow := extract(isodow FROM d);
    IF dow <= 6 THEN
      ini := (d + time '09:00') AT TIME ZONE 'America/Mexico_City';
      fin := (d + CASE WHEN dow = 6 THEN time '14:00' ELSE time '18:00' END) AT TIME ZONE 'America/Mexico_City';
      ini := greatest(ini, p_desde); fin := least(fin, p_hasta);
      IF fin > ini THEN total := total + extract(epoch FROM fin - ini) / 3600; END IF;
    END IF;
    d := d + 1;
  END LOOP;
  RETURN round(total, 2);
END $function$;
REVOKE ALL ON FUNCTION public._crm_pricing_horas_habiles_entre(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._crm_pricing_horas_habiles_entre(timestamptz, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_pricing_set_modos_ejecutivo(p_user_id uuid, p_modos text[])
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_org uuid := public.org_scope();
BEGIN
  IF v_org IS NULL OR NOT public._crm_pricing_es_gerente_ops(v_org) THEN
    RAISE EXCEPTION 'LC_PRICING_SOLO_GERENTE_OPS' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_members WHERE organization_id = v_org AND user_id = p_user_id
                   AND role IN ('ejecutivo_pricing','gerente_operaciones')) THEN
    RAISE EXCEPTION 'LC_PRICING_NO_ES_EJECUTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_modos, '{}')) m WHERE m NOT IN ('Marítimo','Aéreo','Terrestre')) THEN
    RAISE EXCEPTION 'LC_PRICING_MODO_INVALIDO' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM crm_pricing_modos_ejecutivo WHERE organization_id = v_org AND user_id = p_user_id
     AND modo <> ALL (coalesce(p_modos, '{}'));
  INSERT INTO crm_pricing_modos_ejecutivo (organization_id, user_id, modo)
  SELECT DISTINCT v_org, p_user_id, m FROM unnest(coalesce(p_modos, '{}')) m
  ON CONFLICT (organization_id, user_id, modo) DO NOTHING;
END $function$;
REVOKE ALL ON FUNCTION public.crm_pricing_set_modos_ejecutivo(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_pricing_set_modos_ejecutivo(uuid, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._crm_pricing_destinatarios_modo(p_org uuid, p_modo text)
 RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT DISTINCT om.user_id FROM organization_members om
   WHERE om.organization_id = p_org AND om.role IN ('ejecutivo_pricing','gerente_operaciones')
     AND (om.role = 'gerente_operaciones'
       OR NOT EXISTS (SELECT 1 FROM crm_pricing_modos_ejecutivo m WHERE m.organization_id = p_org AND m.modo = p_modo)
       OR EXISTS (SELECT 1 FROM crm_pricing_modos_ejecutivo m WHERE m.organization_id = p_org AND m.modo = p_modo AND m.user_id = om.user_id));
$function$;
REVOKE ALL ON FUNCTION public._crm_pricing_destinatarios_modo(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._crm_pricing_destinatarios_modo(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_pricing_cambiar_estado(p_id uuid, p_accion text, p_motivo text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v record; v_motivo text := nullif(trim(coalesce(p_motivo, '')), ''); v_pricing boolean; v_h numeric;
BEGIN
  SELECT * INTO v FROM crm_solicitudes_pricing WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF v.id IS NULL OR v.organization_id IS DISTINCT FROM org_scope() THEN
    RAISE EXCEPTION 'LC_PRICING_NO_ENCONTRADA' USING ERRCODE = 'P0001';
  END IF;
  v_pricing := _crm_es_pricing(v.organization_id);
  PERFORM set_config('lc.pricing_rpc', '1', true);
  IF p_accion = 'tomar' THEN
    IF NOT v_pricing THEN RAISE EXCEPTION 'LC_PRICING_SIN_PERMISO' USING ERRCODE = '42501'; END IF;
    IF v.estado NOT IN ('enviada','asignada') THEN RAISE EXCEPTION 'LC_PRICING_ESTADO_INVALIDO' USING ERRCODE = 'P0001'; END IF;
    UPDATE crm_solicitudes_pricing SET estado = 'asignada', asignada_a = auth.uid() WHERE id = p_id;
  ELSIF p_accion = 'iniciar' THEN
    IF NOT v_pricing THEN RAISE EXCEPTION 'LC_PRICING_SIN_PERMISO' USING ERRCODE = '42501'; END IF;
    IF v.estado NOT IN ('enviada','asignada') THEN RAISE EXCEPTION 'LC_PRICING_ESTADO_INVALIDO' USING ERRCODE = 'P0001'; END IF;
    UPDATE crm_solicitudes_pricing SET estado = 'en_proceso', asignada_a = coalesce(asignada_a, auth.uid()) WHERE id = p_id;
  ELSIF p_accion = 'pedir_info' THEN
    IF NOT v_pricing THEN RAISE EXCEPTION 'LC_PRICING_SIN_PERMISO' USING ERRCODE = '42501'; END IF;
    IF v.estado NOT IN ('enviada','asignada','en_proceso') THEN RAISE EXCEPTION 'LC_PRICING_ESTADO_INVALIDO' USING ERRCODE = 'P0001'; END IF;
    IF length(coalesce(v_motivo, '')) < 5 THEN RAISE EXCEPTION 'LC_PRICING_MOTIVO_REQUERIDO' USING ERRCODE = 'P0001'; END IF;
    UPDATE crm_solicitudes_pricing SET estado = 'info_requerida', pausada_at = now(), info_motivo = v_motivo,
      asignada_a = coalesce(asignada_a, auth.uid()) WHERE id = p_id;
    PERFORM _crm_pricing_avisar_cambio(v.organization_id, v.id, v.solicitante_id, 'Pricing necesita información ' || v.folio,
      'El plazo está en pausa hasta que respondas: ' || v_motivo);
  ELSIF p_accion = 'reanudar' THEN
    IF NOT v_pricing AND v.solicitante_id IS DISTINCT FROM auth.uid() AND v.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'LC_PRICING_SIN_PERMISO' USING ERRCODE = '42501';
    END IF;
    IF v.estado <> 'info_requerida' THEN RAISE EXCEPTION 'LC_PRICING_ESTADO_INVALIDO' USING ERRCODE = 'P0001'; END IF;
    v_h := _crm_pricing_horas_habiles_entre(v.pausada_at, now());
    UPDATE crm_solicitudes_pricing SET estado = 'en_proceso', pausada_at = NULL,
      vence_at = CASE WHEN vence_at IS NULL OR v_h <= 0 THEN vence_at
                      ELSE _crm_pricing_sumar_horas_habiles(vence_at, ceil(v_h)::int) END,
      aviso_80_at = NULL, aviso_vencida_at = NULL WHERE id = p_id;
    IF v.asignada_a IS NOT NULL AND v.asignada_a IS DISTINCT FROM auth.uid() THEN
      INSERT INTO notificaciones_internas (organization_id, usuario_id, tipo, titulo, mensaje, enlace, entidad_tipo, entidad_id)
      VALUES (v.organization_id, v.asignada_a, 'crm_pricing_solicitud', 'Información recibida ' || v.folio,
              'La solicitud volvió a En proceso y su plazo se reanudó.', '/costeo/solicitudes?id=' || v.id, 'crm_solicitud_pricing', v.id);
    END IF;
  ELSIF p_accion = 'sin_opcion' THEN
    IF NOT v_pricing THEN RAISE EXCEPTION 'LC_PRICING_SIN_PERMISO' USING ERRCODE = '42501'; END IF;
    IF v.estado NOT IN ('enviada','asignada','en_proceso','info_requerida') THEN RAISE EXCEPTION 'LC_PRICING_ESTADO_INVALIDO' USING ERRCODE = 'P0001'; END IF;
    IF length(coalesce(v_motivo, '')) < 10 THEN RAISE EXCEPTION 'LC_PRICING_MOTIVO_REQUERIDO' USING ERRCODE = 'P0001'; END IF;
    UPDATE crm_solicitudes_pricing SET estado = 'sin_opcion', motivo_sin_opcion = v_motivo, pausada_at = NULL,
      respondida_at = now(), asignada_a = coalesce(asignada_a, auth.uid()) WHERE id = p_id;
    PERFORM _crm_pricing_avisar_cambio(v.organization_id, v.id, v.solicitante_id, 'Sin opción de tarifa ' || v.folio,
      'Pricing no encontró opción: ' || v_motivo);
  ELSE
    RAISE EXCEPTION 'LC_PRICING_ACCION_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('lc.pricing_rpc', '', true);
  RETURN jsonb_build_object('id', v.id);
END $function$;
REVOKE ALL ON FUNCTION public.crm_pricing_cambiar_estado(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_pricing_cambiar_estado(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_pricing_avisos_sla()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; n int := 0; v_tipo text;
BEGIN
  PERFORM set_config('lc.pricing_rpc', '1', true);
  FOR r IN
    SELECT * FROM crm_solicitudes_pricing
     WHERE deleted_at IS NULL AND estado IN ('enviada','asignada','en_proceso')
       AND vence_at IS NOT NULL AND enviada_at IS NOT NULL
       AND ((aviso_vencida_at IS NULL AND now() >= vence_at)
         OR (aviso_80_at IS NULL AND now() >= enviada_at + (vence_at - enviada_at) * 0.8))
     ORDER BY vence_at LIMIT 500 FOR UPDATE SKIP LOCKED
  LOOP
    v_tipo := CASE WHEN now() >= r.vence_at THEN 'vencida' ELSE '80' END;
    INSERT INTO notificaciones_internas (organization_id, usuario_id, tipo, titulo, mensaje, enlace, entidad_tipo, entidad_id)
    SELECT r.organization_id, x.u, 'crm_pricing_solicitud',
           CASE WHEN v_tipo = 'vencida' THEN 'Solicitud vencida ' ELSE 'Solicitud por vencer ' END || r.folio,
           coalesce(r.cliente, 'Sin cliente') || CASE WHEN v_tipo = 'vencida' THEN ' · el plazo de respuesta ya venció'
             ELSE ' · se consumió el 80 % del plazo' END,
           '/costeo/solicitudes?id=' || r.id, 'crm_solicitud_pricing', r.id
      FROM (SELECT r.asignada_a AS u WHERE r.asignada_a IS NOT NULL
            UNION SELECT d FROM _crm_pricing_destinatarios_modo(r.organization_id, r.servicio) d WHERE r.asignada_a IS NULL) x;
    UPDATE crm_solicitudes_pricing SET
      aviso_80_at = coalesce(aviso_80_at, now()),
      aviso_vencida_at = CASE WHEN v_tipo = 'vencida' THEN now() ELSE aviso_vencida_at END
     WHERE id = r.id;
    n := n + 1;
  END LOOP;
  PERFORM set_config('lc.pricing_rpc', '', true);
  RETURN n;
END $function$;
REVOKE ALL ON FUNCTION public.crm_pricing_avisos_sla() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_pricing_avisos_sla() TO service_role;

DO $do$
DECLARE r record; def text; nuevo text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.crm_responder_solicitud_pricing(uuid)', $a$IF v.estado <> 'enviada' THEN$a$, $b$IF v.estado NOT IN ('enviada','asignada','en_proceso','info_requerida') THEN$b$),
    ('public.crm_cancelar_solicitud_pricing(uuid)', $a$IF v.estado = 'respondida' THEN$a$, $b$IF v.estado IN ('respondida','sin_opcion') THEN$b$),
    ('public._crm_pricing_opcion_guard()', $a$NOT IN ('enviada','respondida')$a$, $b$NOT IN ('enviada','asignada','en_proceso','info_requerida','respondida')$b$),
    ('public._costeo_tarifa_solicitud_guard()', $a$NOT IN ('enviada','respondida')$a$, $b$NOT IN ('enviada','asignada','en_proceso','info_requerida','respondida')$b$),
    ('public.crm_aplicar_tarifa_tarifario(uuid,uuid)', $a$NOT IN ('borrador','enviada')$a$, $b$NOT IN ('borrador','enviada','asignada','en_proceso','info_requerida')$b$),
    ('public.crm_pricing_cambiar_complejidad(uuid,text,text)', $a$IF v.estado <> 'enviada' THEN$a$, $b$IF v.estado NOT IN ('enviada','asignada','en_proceso','info_requerida') THEN$b$),
    ('public.crm_pricing_ampliar_plazo(uuid,integer,text)', $a$v.estado <> 'enviada' OR$a$, $b$v.estado NOT IN ('enviada','asignada','en_proceso') OR$b$),
    ('public.crm_enviar_solicitud_pricing(uuid)', $a$AND om.role IN ('ejecutivo_pricing','gerente_operaciones');$a$,
       $b$AND om.role IN ('ejecutivo_pricing','gerente_operaciones')
     AND om.user_id IN (SELECT public._crm_pricing_destinatarios_modo(v.organization_id, v.servicio));$b$)
  ) t(fn, viejo, nuevo_txt) LOOP
    def := pg_get_functiondef(r.fn::regprocedure);
    IF position(r.viejo IN def) = 0 THEN RAISE EXCEPTION 'Fase5: no se encontró el texto esperado en %', r.fn; END IF;
    nuevo := replace(def, r.viejo, r.nuevo_txt);
    EXECUTE nuevo;
  END LOOP;
END $do$;