-- CANDIDATA: preparar/revisar; NO aplicada, NO registrada en el ledger.
-- El despliegue requiere autorización adicional y validación CI del esquema completo.
CREATE TABLE public.embarque_aprobaciones_margen (
  embarque_id uuid PRIMARY KEY REFERENCES public.embarques(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  solicitada_at timestamptz,
  solicitante_id uuid,
  autorizada_at timestamptz,
  autorizada_por uuid,
  snapshot_autorizado jsonb,
  motivo text
);
-- Sólo RPC: ni lectores internos pueden escribir/aprobar directamente.
REVOKE ALL ON public.embarque_aprobaciones_margen FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.embarque_aprobaciones_margen TO service_role;
ALTER TABLE public.embarque_aprobaciones_margen ENABLE ROW LEVEL SECURITY;
-- Sin políticas para clientes: tabla cerrada; acceso por funciones con validación de org/rol.

CREATE FUNCTION public._embarque_snapshot_margen(p_id uuid, p_embarque jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e jsonb; ventas jsonb; costos jsonb; divisas text[]; base text; r record;
  venta numeric := 0; costo numeric := 0; factor numeric;
  tc_usd numeric; tc_eur numeric; minimo numeric; calculable boolean := true;
BEGIN
  SELECT COALESCE(p_embarque, to_jsonb(b)) INTO e FROM public.embarques b WHERE id = p_id;
  IF e IS NULL THEN RAISE EXCEPTION 'LC_EMBARQUE_NO_ENCONTRADO' USING ERRCODE = 'P0001'; END IF;
  SELECT COALESCE(jsonb_agg(datos ORDER BY datos), '[]'::jsonb) INTO ventas FROM (
    SELECT jsonb_build_object('moneda', c.moneda, 'cantidad', c.cantidad,
      'precio_unitario', c.precio_unitario, 'monto', round(c.cantidad*c.precio_unitario, 2)) datos
    FROM public.conceptos_venta c WHERE c.embarque_id = p_id AND c.deleted_at IS NULL
  ) s;
  SELECT COALESCE(jsonb_agg(datos ORDER BY datos), '[]'::jsonb) INTO costos FROM (
    SELECT jsonb_build_object('moneda', c.moneda, 'monto', c.monto) datos
    FROM public.conceptos_costo c WHERE c.embarque_id = p_id AND c.deleted_at IS NULL
  ) s;
  SELECT array_agg(DISTINCT l->>'moneda' ORDER BY l->>'moneda') INTO divisas
    FROM jsonb_array_elements(ventas || costos) l;
  base := CASE WHEN cardinality(divisas) = 1 THEN divisas[1] ELSE 'USD' END;
  -- Un solo tipo de moneda no requiere conversión. FX sólo entra en la huella si se usa.
  IF cardinality(divisas) > 1 THEN
    IF 'MXN' = ANY(divisas) OR 'EUR' = ANY(divisas) THEN tc_usd := (e->>'tipo_cambio_usd')::numeric; END IF;
    IF 'EUR' = ANY(divisas) THEN tc_eur := (e->>'tipo_cambio_eur')::numeric; END IF;
  END IF;
  SELECT (valor #>> '{}')::numeric INTO minimo FROM public.configuracion
    WHERE organization_id = (e->>'organization_id')::uuid
      AND categoria = 'comercial' AND clave = 'margen_minimo_utilidad_pct';
  minimo := COALESCE(minimo, 8);
  FOR r IN SELECT l, true es_venta FROM jsonb_array_elements(ventas) l
    UNION ALL SELECT l, false FROM jsonb_array_elements(costos) l LOOP
    factor := CASE
      WHEN r.l->>'moneda' = base THEN 1
      WHEN r.l->>'moneda' = 'MXN' AND tc_usd > 0 THEN 1/tc_usd
      WHEN r.l->>'moneda' = 'EUR' AND tc_usd > 0 AND tc_eur > 0 THEN tc_eur/tc_usd
      ELSE NULL END;
    IF factor IS NULL OR (r.l->>'monto')::numeric IS NULL THEN calculable := false;
    ELSIF r.es_venta THEN venta := venta + (r.l->>'monto')::numeric*factor;
    ELSE costo := costo + (r.l->>'monto')::numeric*factor; END IF;
  END LOOP;
  calculable := calculable AND venta > 0;
  RETURN jsonb_build_object('ventas', ventas, 'costos', costos,
    'organization_id', e->'organization_id', 'cliente_id', e->'cliente_id', 'tipo_cambio_usd', tc_usd, 'tipo_cambio_eur', tc_eur,
    'moneda', base, 'venta', CASE WHEN calculable THEN venta END,
    'costo', CASE WHEN calculable THEN costo END,
    'margen_pct', CASE WHEN calculable THEN round((venta-costo)/venta*100, 2) END,
    'minimo_pct', minimo, 'calculable', calculable,
    'requiere_aprobacion', NOT calculable OR (venta-costo) < venta*minimo/100);
END $$;
REVOKE ALL ON FUNCTION public._embarque_snapshot_margen(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._embarque_snapshot_margen(uuid, jsonb) TO service_role;

CREATE FUNCTION public._embarque_solicitar_margen(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.embarques; a public.embarque_aprobaciones_margen; s jsonb; requiere boolean;
BEGIN
  SELECT * INTO e FROM public.embarques WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR e.estado NOT IN ('Borrador', 'Cotización') THEN RETURN; END IF;
  s := public._embarque_snapshot_margen(p_id);
  requiere := (s->>'requiere_aprobacion')::boolean;
  SELECT * INTO a FROM public.embarque_aprobaciones_margen WHERE embarque_id = p_id;
  IF a.embarque_id IS NOT NULL AND a.snapshot = s THEN RETURN; END IF;
  IF a.embarque_id IS NULL AND NOT requiere THEN RETURN; END IF;
  -- Bitácora conserva lo aprobado aun cuando una nueva versión lo invalida.
  INSERT INTO public.bitacora_actividad(organization_id, usuario_id, modulo, accion, entidad_id, detalles)
  VALUES(e.organization_id, auth.uid(), 'Embarques',
    CASE WHEN a.autorizada_at IS NOT NULL THEN 'Invalidó autorización de margen' ELSE 'Revisó margen de borrador' END,
    p_id, jsonb_build_object('anterior', a.snapshot, 'nuevo', s, 'revision', COALESCE(a.revision,0)+1,
      'autorizada_por', a.autorizada_por, 'autorizada_at', a.autorizada_at, 'motivo', a.motivo));
  INSERT INTO public.embarque_aprobaciones_margen(embarque_id, organization_id, snapshot, solicitada_at, solicitante_id)
  VALUES(p_id, e.organization_id, s, CASE WHEN requiere THEN clock_timestamp() END, auth.uid())
  ON CONFLICT (embarque_id) DO UPDATE SET snapshot = EXCLUDED.snapshot,
    revision = public.embarque_aprobaciones_margen.revision+1,
    solicitada_at = EXCLUDED.solicitada_at, solicitante_id = EXCLUDED.solicitante_id,
    autorizada_at = NULL, autorizada_por = NULL, snapshot_autorizado = NULL, motivo = NULL;
  IF NOT requiere THEN RETURN; END IF;
  INSERT INTO public.notificaciones_internas(organization_id, usuario_id, tipo, titulo, mensaje, enlace, entidad_tipo, entidad_id)
  SELECT DISTINCT e.organization_id, m.user_id, 'embarque_margen_por_autorizar', 'Margen de borrador por autorizar',
    COALESCE(e.cliente_nombre,'Sin cliente') || ' · Venta: ' || COALESCE(s->>'venta','N/D') || ' ' || (s->>'moneda')
      || ' · Costo: ' || COALESCE(s->>'costo','N/D') || ' · Margen: ' || COALESCE(s->>'margen_pct','N/D')
      || '% · Mínimo: ' || (s->>'minimo_pct') || '%',
    '/embarques/' || p_id, 'embarque', p_id
  FROM public.organization_members m WHERE m.organization_id = e.organization_id AND m.role IN ('admin','admin_org');
END $$;
REVOKE ALL ON FUNCTION public._embarque_solicitar_margen(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._embarque_solicitar_margen(uuid) TO service_role;

CREATE FUNCTION public.consultar_aprobacion_margen_embarque(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.embarques; a public.embarque_aprobaciones_margen; s jsonb; estado text;
BEGIN
  SELECT * INTO e FROM public.embarques WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND OR e.organization_id IS DISTINCT FROM public.org_scope() THEN
    RAISE EXCEPTION 'LC_EMBARQUE_NO_ENCONTRADO' USING ERRCODE = '42501'; END IF;
  -- Roles internos exactos; no usar el lector legacy que excluye roles modernos.
  IF NOT public.has_any_role_in_org_exact(auth.uid(), ARRAY['admin','admin_org','gerente_visor','gerente_comercial',
    'gerente_operaciones','coordinador_logistico','ejecutivo_pricing','vendedor','operador',
    'contador','tesorero','auxiliar_contable','ejecutivo_cobranza']::public.app_role[], e.organization_id) THEN
    RAISE EXCEPTION 'LC_EMBARQUE_MARGEN_SIN_PERMISO' USING ERRCODE = '42501'; END IF;
  s := public._embarque_snapshot_margen(p_id);
  SELECT * INTO a FROM public.embarque_aprobaciones_margen WHERE embarque_id = p_id;
  estado := CASE WHEN NOT (s->>'requiere_aprobacion')::boolean THEN 'no_requerida'
    WHEN a.autorizada_at IS NOT NULL AND a.snapshot_autorizado = s THEN 'aprobada'
    WHEN a.solicitada_at IS NOT NULL AND a.snapshot = s THEN 'pendiente' ELSE 'sin_solicitar' END;
  RETURN jsonb_build_object('estado', estado, 'snapshot', s, 'solicitada_at', a.solicitada_at,
    'autorizada_at', CASE WHEN estado = 'aprobada' THEN a.autorizada_at END,
    'puede_aprobar', public.has_any_role_in_org_exact(auth.uid(), ARRAY['admin','admin_org']::public.app_role[], e.organization_id));
END $$;
REVOKE ALL ON FUNCTION public.consultar_aprobacion_margen_embarque(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultar_aprobacion_margen_embarque(uuid) TO authenticated, service_role;

CREATE FUNCTION public.solicitar_aprobacion_margen_embarque(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.embarques;
BEGIN
  SELECT * INTO e FROM public.embarques WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR e.organization_id IS DISTINCT FROM public.org_scope() THEN
    RAISE EXCEPTION 'LC_EMBARQUE_NO_ENCONTRADO' USING ERRCODE = '42501'; END IF;
  PERFORM public._assert_writer(e.organization_id);
  IF e.estado NOT IN ('Borrador','Cotización') THEN
    RAISE EXCEPTION 'LC_EMBARQUE_MARGEN_ESTADO_INVALIDO' USING ERRCODE = 'P0001'; END IF;
  PERFORM public._embarque_solicitar_margen(p_id);
  RETURN public.consultar_aprobacion_margen_embarque(p_id);
END $$;
REVOKE ALL ON FUNCTION public.solicitar_aprobacion_margen_embarque(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_aprobacion_margen_embarque(uuid) TO authenticated;

CREATE FUNCTION public.aprobar_margen_embarque(p_id uuid, p_snapshot jsonb, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.embarques; a public.embarque_aprobaciones_margen; s jsonb;
BEGIN
  SELECT * INTO e FROM public.embarques WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR e.organization_id IS DISTINCT FROM public.org_scope() THEN
    RAISE EXCEPTION 'LC_EMBARQUE_NO_ENCONTRADO' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_any_role_in_org_exact(auth.uid(), ARRAY['admin','admin_org']::public.app_role[], e.organization_id) THEN
    RAISE EXCEPTION 'LC_EMBARQUE_MARGEN_SOLO_ADMIN' USING ERRCODE = '42501'; END IF;
  PERFORM public._assert_writer(e.organization_id);
  IF e.estado NOT IN ('Borrador','Cotización') THEN
    RAISE EXCEPTION 'LC_EMBARQUE_MARGEN_ESTADO_INVALIDO' USING ERRCODE = 'P0001'; END IF;
  s := public._embarque_snapshot_margen(p_id);
  IF s IS DISTINCT FROM p_snapshot THEN
    RAISE EXCEPTION 'LC_EMBARQUE_MARGEN_CONFLICTO: cambiaron los importes; recarga antes de aprobar' USING ERRCODE = '40001'; END IF;
  IF NOT (s->>'calculable')::boolean THEN
    RAISE EXCEPTION 'LC_EMBARQUE_MARGEN_NO_CALCULABLE: completa venta y tipos de cambio' USING ERRCODE = 'P0001'; END IF;
  IF length(btrim(COALESCE(p_motivo,''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'LC_EMBARQUE_MARGEN_MOTIVO: captura un motivo de 10 a 500 caracteres' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM public.embarque_aprobaciones_margen WHERE embarque_id = p_id;
  IF a.embarque_id IS NULL OR a.snapshot IS DISTINCT FROM s OR a.solicitada_at IS NULL THEN
    RAISE EXCEPTION 'LC_EMBARQUE_MARGEN_SIN_SOLICITUD' USING ERRCODE = 'P0001'; END IF;
  IF a.autorizada_at IS NOT NULL AND a.snapshot_autorizado = s THEN RETURN public.consultar_aprobacion_margen_embarque(p_id); END IF;
  UPDATE public.embarque_aprobaciones_margen SET autorizada_at = clock_timestamp(), autorizada_por = auth.uid(),
    snapshot_autorizado = s, motivo = btrim(p_motivo) WHERE embarque_id = p_id;
  INSERT INTO public.bitacora_actividad(organization_id, usuario_id, modulo, accion, entidad_id, detalles)
  VALUES(e.organization_id, auth.uid(), 'Embarques', 'Aprobó margen de borrador', p_id,
    jsonb_build_object('snapshot', s, 'motivo', btrim(p_motivo), 'revision', a.revision));
  INSERT INTO public.notificaciones_internas(organization_id, usuario_id, tipo, titulo, mensaje, enlace, entidad_tipo, entidad_id)
  SELECT e.organization_id, m.user_id, 'embarque_margen_aprobado', 'Margen del borrador aprobado',
    'Ya puedes confirmar el embarque cuando completes sus datos obligatorios.', '/embarques/' || p_id, 'embarque', p_id
  FROM public.organization_members m WHERE m.organization_id = e.organization_id AND m.user_id = a.solicitante_id;
  RETURN public.consultar_aprobacion_margen_embarque(p_id);
END $$;
REVOKE ALL ON FUNCTION public.aprobar_margen_embarque(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprobar_margen_embarque(uuid, jsonb, text) TO authenticated;

CREATE FUNCTION public._embarque_assert_margen_aprobado(p_id uuid, p_embarque jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb;
BEGIN
  s := public._embarque_snapshot_margen(p_id, p_embarque);
  IF (s->>'requiere_aprobacion')::boolean AND NOT EXISTS (
    SELECT 1 FROM public.embarque_aprobaciones_margen a WHERE a.embarque_id = p_id
      AND a.autorizada_at IS NOT NULL AND a.snapshot_autorizado = s
  ) THEN RAISE EXCEPTION 'LC_EMBARQUE_MARGEN_PENDIENTE: Administración debe aprobar el margen antes de iniciar operaciones'
    USING ERRCODE = 'P0001'; END IF;
END $$;
REVOKE ALL ON FUNCTION public._embarque_assert_margen_aprobado(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._embarque_assert_margen_aprobado(uuid, jsonb) TO service_role;

CREATE FUNCTION public._embarque_guard_inicio_margen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado NOT IN ('Borrador','Cotización','Cancelado') AND
    (TG_OP = 'INSERT' OR OLD.estado IN ('Borrador','Cotización','Cancelado')) THEN
    PERFORM public._embarque_assert_margen_aprobado(NEW.id, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._embarque_guard_inicio_margen() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._embarque_guard_inicio_margen() TO service_role;
CREATE TRIGGER trg_embarque_guard_inicio_margen BEFORE INSERT OR UPDATE ON public.embarques
FOR EACH ROW EXECUTE FUNCTION public._embarque_guard_inicio_margen();

-- Cada escritor de conceptos toma el mismo mutex que aprobación/transición, también vía API directa.
CREATE FUNCTION public._embarque_margen_lock_conceptos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE anterior uuid; siguiente uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN anterior := OLD.embarque_id; END IF;
  IF TG_OP <> 'DELETE' THEN siguiente := NEW.embarque_id; END IF;
  PERFORM id FROM public.embarques WHERE id IN (anterior, siguiente) ORDER BY id FOR UPDATE;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._embarque_margen_lock_conceptos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._embarque_margen_lock_conceptos() TO service_role;
CREATE TRIGGER trg_embarque_margen_lock BEFORE INSERT OR UPDATE OR DELETE ON public.conceptos_venta
FOR EACH ROW EXECUTE FUNCTION public._embarque_margen_lock_conceptos();
CREATE TRIGGER trg_embarque_margen_lock BEFORE INSERT OR UPDATE OR DELETE ON public.conceptos_costo
FOR EACH ROW EXECUTE FUNCTION public._embarque_margen_lock_conceptos();

CREATE FUNCTION public._embarque_margen_al_guardar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE anterior uuid; siguiente uuid; e public.embarques;
BEGIN
  IF TG_TABLE_NAME = 'embarques' THEN
    SELECT * INTO e FROM public.embarques WHERE id = NEW.id AND deleted_at IS NULL;
    -- Revalidación al commit: detecta cambios de conceptos hechos DESPUÉS del avance en la misma transacción.
    IF FOUND AND e.estado NOT IN ('Borrador','Cotización','Cancelado') AND
      (TG_OP = 'INSERT' OR OLD.estado IN ('Borrador','Cotización','Cancelado')) THEN
      PERFORM public._embarque_assert_margen_aprobado(e.id);
    END IF;
    PERFORM public._embarque_solicitar_margen(NEW.id);
  ELSE
    IF TG_OP <> 'INSERT' THEN anterior := OLD.embarque_id; END IF;
    IF TG_OP <> 'DELETE' THEN siguiente := NEW.embarque_id; END IF;
    IF anterior IS NOT NULL THEN PERFORM public._embarque_solicitar_margen(anterior); END IF;
    IF siguiente IS NOT NULL AND siguiente IS DISTINCT FROM anterior THEN PERFORM public._embarque_solicitar_margen(siguiente); END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._embarque_margen_al_guardar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._embarque_margen_al_guardar() TO service_role;
-- Diferidos: se evalúan las partidas FINALES, no los estados intermedios del guardado.
CREATE CONSTRAINT TRIGGER trg_embarque_margen_al_guardar AFTER INSERT OR UPDATE ON public.embarques
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public._embarque_margen_al_guardar();
CREATE CONSTRAINT TRIGGER trg_embarque_margen_al_guardar AFTER INSERT OR UPDATE OR DELETE ON public.conceptos_venta
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public._embarque_margen_al_guardar();
CREATE CONSTRAINT TRIGGER trg_embarque_margen_al_guardar AFTER INSERT OR UPDATE OR DELETE ON public.conceptos_costo
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public._embarque_margen_al_guardar();
