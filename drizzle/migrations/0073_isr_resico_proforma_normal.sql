-- Persist the approved fiscal amounts and source lines of a normal proforma.
ALTER TABLE public.proformas ADD COLUMN evaluacion_fiscal jsonb, ADD COLUMN conceptos_fiscales jsonb;
ALTER TABLE public.proformas ADD CONSTRAINT proformas_evaluacion_fiscal_chk CHECK (
  (evaluacion_fiscal IS NULL AND conceptos_fiscales IS NULL) OR ((evaluacion_fiscal->>'schema_version' = 'cotizacion_fiscal_v1'
    AND evaluacion_fiscal->>'estado' = 'confirmado' AND jsonb_typeof(conceptos_fiscales) = 'array'
    AND jsonb_typeof(evaluacion_fiscal->'bloques') = 'array') IS TRUE));
CREATE TABLE public.proforma_liberaciones_portal (
  proforma_id uuid NOT NULL REFERENCES public.proformas(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  transaccion bigint NOT NULL,
  PRIMARY KEY (proforma_id, transaccion)
);
ALTER TABLE public.proforma_liberaciones_portal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proforma_liberaciones_portal FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.proforma_liberaciones_portal FROM PUBLIC, anon, authenticated, service_role;
-- No permissive policy: only the definer path can create and consume this transaction proof.
CREATE POLICY portal_liberacion_scope ON public.proforma_liberaciones_portal AS RESTRICTIVE TO authenticated
  USING (public.rls_tenant_scope_ok(organization_id)) WITH CHECK (public.rls_tenant_scope_ok(organization_id));

CREATE OR REPLACE FUNCTION public._isr_concepto_proforma_normal(p_linea jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT public._isr_base_revision_venta(p_linea) || jsonb_build_object(
    'id', p_linea->'id', 'descripcion', p_linea->'descripcion', 'total', p_linea->'total',
    'contenedor_id', p_linea->'contenedor_id', 'origen', p_linea->'origen',
    'cotizacion_concepto_origen_id', p_linea->'cotizacion_concepto_origen_id',
    'tasa_ret_isr', p_linea->'tasa_ret_isr', 'monto_ret_isr', p_linea->'monto_ret_isr',
    'evaluacion_fiscal', (p_linea->'evaluacion_fiscal')-'emisor'-'receptor');
$$;

CREATE OR REPLACE FUNCTION public._isr_snapshot_proforma_normal(p_org_id uuid, p_embarque_id uuid,
  p_cliente_id uuid, p_concepto_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_lineas jsonb;
  v_ambiente text;
  v_vigente jsonb;
  v_conceptos jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) INTO v_lineas
  FROM public.conceptos_venta c
  WHERE c.id = ANY(p_concepto_ids) AND c.organization_id = p_org_id
    AND c.embarque_id = p_embarque_id AND c.deleted_at IS NULL;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_lineas) l WHERE l->'evaluacion_fiscal' <> 'null'::jsonb) THEN
    -- Un embarque evaluado no puede facturar por la vía histórica eligiendo sólo sus renglones legacy.
    IF EXISTS (SELECT 1 FROM public.conceptos_venta c WHERE c.embarque_id = p_embarque_id
      AND c.organization_id = p_org_id AND c.deleted_at IS NULL AND c.evaluacion_fiscal IS NOT NULL) THEN
      RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;
  IF p_cliente_id IS NULL OR jsonb_array_length(v_lineas) <> cardinality(p_concepto_ids) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_lineas) l
    WHERE COALESCE(l->'evaluacion_fiscal'->>'estado', '') NOT IN ('aplica', 'no_aplica')
  ) THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  v_ambiente := v_lineas->0->'evaluacion_fiscal'->>'ambiente';
  v_vigente := public._evaluar_documento_isr_resico(p_org_id, p_cliente_id, v_lineas);
  IF v_vigente#>>'{snapshot,estado}' IS DISTINCT FROM 'confirmado' OR v_lineas IS DISTINCT FROM v_vigente->'conceptos' THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  SELECT jsonb_agg(public._isr_concepto_proforma_normal(l) || jsonb_build_object('embarque_contenedores',
    CASE WHEN ec.id IS NOT NULL THEN jsonb_build_object('id', ec.id, 'numero_contenedor', ec.numero_contenedor,
      'tipo_contenedor', ec.tipo_contenedor) END) ORDER BY l->>'created_at', l->>'id') INTO v_conceptos
  FROM jsonb_array_elements(v_lineas) l
  LEFT JOIN public.embarque_contenedores ec ON ec.id = (l->>'contenedor_id')::uuid
    AND ec.embarque_id = p_embarque_id AND ec.organization_id = p_org_id AND ec.deleted_at IS NULL;
  RETURN public._isr_snapshot_documento(p_org_id, p_cliente_id, v_ambiente, v_conceptos)
    || jsonb_build_object('conceptos', v_conceptos);
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_guard_proforma_normal() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.evaluacion_fiscal IS NOT NULL AND (
      current_user IS DISTINCT FROM pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID))
      OR NEW.es_consolidada OR NEW.embarque_id IS NULL OR NEW.deleted_at IS NOT NULL
      OR NEW.factura_id IS NOT NULL OR NEW.factura_secundaria_id IS NOT NULL
      OR NEW.estado_proforma IS DISTINCT FROM 'pendiente' OR NEW.estado_cliente IS DISTINCT FROM 'pendiente'
      OR NEW.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado'
      OR NEW.evaluacion_fiscal->>'organization_id' IS DISTINCT FROM NEW.organization_id::text
      OR NEW.evaluacion_fiscal->>'cliente_id' IS DISTINCT FROM NEW.cliente_id::text
    ) THEN RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.evaluacion_fiscal IS NOT NULL THEN
      RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.evaluacion_fiscal, NEW.conceptos_fiscales) IS DISTINCT FROM (OLD.evaluacion_fiscal, OLD.conceptos_fiscales) THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  IF OLD.evaluacion_fiscal IS NULL THEN RETURN NEW; END IF;
  IF (NEW.organization_id, NEW.cliente_id, NEW.embarque_id, NEW.es_consolidada, NEW.deleted_at,
      NEW.subtotal_usd, NEW.iva_usd, NEW.total_usd, NEW.subtotal_mxn, NEW.iva_mxn, NEW.total_mxn, NEW.tasa_iva_aplicada)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.cliente_id, OLD.embarque_id, OLD.es_consolidada, OLD.deleted_at,
      OLD.subtotal_usd, OLD.iva_usd, OLD.total_usd, OLD.subtotal_mxn, OLD.iva_mxn, OLD.total_mxn, OLD.tasa_iva_aplicada) THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  IF NEW.estado_proforma = 'facturada' OR NEW.factura_id IS NOT NULL OR NEW.factura_secundaria_id IS NOT NULL
    OR NEW.consolidada_en IS NOT NULL OR NEW.folio_factura_externa IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
  END IF;
  IF OLD.estado_cliente = 'rechazada' AND NEW.estado_cliente IS DISTINCT FROM OLD.estado_cliente THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_validar_vinculo_proforma_normal(p_anterior jsonb, p_nuevo jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_anterior uuid := (p_anterior->>'proforma_id')::uuid;
  v_nuevo uuid := (p_nuevo->>'proforma_id')::uuid;
  v_proforma public.proformas;
  v_linea jsonb := public._isr_concepto_proforma_normal(p_anterior);
BEGIN
  IF (p_anterior->'organization_id', p_anterior->'embarque_id', p_anterior->'deleted_at', p_anterior->'evaluacion_fiscal')
    IS DISTINCT FROM (p_nuevo->'organization_id', p_nuevo->'embarque_id', p_nuevo->'deleted_at', p_nuevo->'evaluacion_fiscal')
    OR v_linea IS DISTINCT FROM public._isr_concepto_proforma_normal(p_nuevo) THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_proforma FROM public.proformas WHERE id = COALESCE(v_anterior, v_nuevo) FOR NO KEY UPDATE;
  IF v_proforma.id IS NULL OR v_proforma.evaluacion_fiscal IS NULL OR v_proforma.es_consolidada
    OR v_proforma.organization_id IS DISTINCT FROM (p_anterior->>'organization_id')::uuid
    OR v_proforma.embarque_id IS DISTINCT FROM (p_anterior->>'embarque_id')::uuid
    OR (v_proforma.conceptos_fiscales @> jsonb_build_array(v_linea)) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
  END IF;
  IF v_anterior IS NOT NULL AND v_nuevo IS NULL
    AND p_nuevo->>'estado_facturacion' = 'pendiente'
    AND (v_proforma.estado_proforma = 'cancelada' OR v_proforma.estado_cliente = 'rechazada') THEN
    RETURN;
  END IF;
  IF (v_anterior IS NULL OR v_anterior = v_nuevo) AND v_nuevo IS NOT NULL
    AND p_nuevo->>'estado_facturacion' = 'en_proforma' AND v_proforma.deleted_at IS NULL
    AND v_proforma.estado_proforma IN ('pendiente', 'aprobada') AND v_proforma.estado_cliente <> 'rechazada' THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
END;
$$;

-- Called only after a portal responder has authorized and recorded a rejection.
CREATE OR REPLACE FUNCTION public._liberar_conceptos_proforma_portal(p_proforma_id uuid, p_org_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_liberados integer;
  v_bypass_prev text := COALESCE(current_setting('app.bypass_cierre', true), '');
BEGIN
  INSERT INTO public.proforma_liberaciones_portal (proforma_id, organization_id, transaccion)
    VALUES (p_proforma_id, p_org_id, txid_current());
  PERFORM set_config('app.bypass_cierre', 'on', true);
  v_liberados := public.liberar_conceptos_de_proforma(p_proforma_id);
  PERFORM set_config('app.bypass_cierre', v_bypass_prev, true);
  DELETE FROM public.proforma_liberaciones_portal WHERE proforma_id = p_proforma_id AND transaccion = txid_current();
  RETURN v_liberados;
END;
$$;

-- Internal admission check only. Existing table/RPC permissions still decide
-- whether the caller may write; this helper never grants a write capability.
-- audit:allow-no-grants
CREATE OR REPLACE FUNCTION public._h14_validar_actor_org_baja(p_org uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := COALESCE(NULLIF(current_setting('role', true), 'none'), SESSION_USER::text);
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'LC_FORBIDDEN: vínculo financiero fuera de la organización autorizada' USING ERRCODE = '42501';
  END IF;
  -- SET ROLE authenticated is still authenticated when session_user is postgres
  -- in the isolated tests. Only a genuine effective database owner/service role
  -- skips JWT admission; RC, mutex, references and tombstones remain mandatory.
  IF v_role IN ('postgres', 'service_role') THEN RETURN; END IF;
  v_org := public.current_user_org_id();
  IF v_role <> 'authenticated' OR v_uid IS NULL OR (
    public.has_role(v_uid, 'super_admin'::public.app_role) IS NOT TRUE
    AND (v_org IS NULL OR v_org IS DISTINCT FROM p_org)
  ) THEN
    RAISE EXCEPTION 'LC_FORBIDDEN: vínculo financiero fuera de la organización autorizada' USING ERRCODE = '42501';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public._h14_validar_actor_org_baja(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- The graph can initially have no shipment. This org anchor is acquired before
-- resolving it. Hash collisions only add contention; they never merge tenants.
-- audit:allow-no-grants
CREATE OR REPLACE FUNCTION public._h14_lock_grafo_baja_embarque(p_org uuid, p_esperar boolean)
RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_key bigint;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'LC_EMBARQUE_AISLAMIENTO_NO_SOPORTADO: esta operación requiere una transacción READ COMMITTED'
      USING ERRCODE = '25001';
  END IF;
  v_key := hashtextextended('librecarga:h14:grafo-financiero:' || p_org::text, 0);
  IF p_esperar IS TRUE THEN
    PERFORM pg_advisory_xact_lock(v_key);
  ELSIF pg_try_advisory_xact_lock(v_key) IS NOT TRUE THEN
    RAISE EXCEPTION 'LC_EMBARQUE_EN_USO: los vínculos financieros se están actualizando; consulta el estado y vuelve a intentarlo'
      USING ERRCODE = '55P03';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public._h14_lock_grafo_baja_embarque(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._h14_mutex_baja_embarque(p_org uuid, p_esperar boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._h14_validar_actor_org_baja(p_org);
  PERFORM public._h14_lock_grafo_baja_embarque(p_org, p_esperar);
END;
$function$;
REVOKE ALL ON FUNCTION public._h14_mutex_baja_embarque(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;

-- All relationship writers share the org anchor, including an empty graph.
-- No session flag or trigger-depth bypass can opt out of this invariant.
-- audit:allow-no-grants
CREATE OR REPLACE FUNCTION public._h14_guard_escritor_baja()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
  v_org uuid;
  v_old_org uuid := (v_old->>'organization_id')::uuid;
  v_new_org uuid := (v_new->>'organization_id')::uuid;
  v_keys text[];
  v_old_projection jsonb;
  v_new_projection jsonb;
  v_old_targets uuid[];
  v_new_targets uuid[];
  v_targets uuid[];
  v_validar uuid[];
  v_old_activa boolean;
  v_new_activa boolean;
  v_restaurar boolean;
  v_reactivar boolean := false;
  v_target uuid;
  v_deleted timestamptz;
  v_liberacion_portal boolean := false;
BEGIN
  v_keys := CASE TG_TABLE_NAME
    WHEN 'facturas' THEN ARRAY['id','organization_id','embarque_id','proforma_id','deleted_at','estado']
    WHEN 'proveedor_facturas' THEN ARRAY['id','organization_id','embarque_id','deleted_at','estado']
    WHEN 'factura_embarques' THEN ARRAY['organization_id','factura_id','embarque_id','activa']
    WHEN 'conceptos_factura' THEN ARRAY['id','organization_id','factura_id','embarque_id','proforma_id_origen','deleted_at']
    WHEN 'proformas' THEN ARRAY['id','organization_id','embarque_id','embarques_ids','proformas_origen','consolidada_en','factura_id','factura_secundaria_id','deleted_at','estado_proforma']
    WHEN 'proforma_conceptos_consolidados' THEN ARRAY['id','organization_id','proforma_id','embarque_id','deleted_at']
    WHEN 'conceptos_venta' THEN ARRAY['id','organization_id','proforma_id','embarque_id','deleted_at']
    WHEN 'conceptos_costo' THEN ARRAY['id','organization_id','embarque_id','deleted_at']
    WHEN 'proveedor_facturas_conceptos' THEN ARRAY['id','organization_id','proveedor_factura_id','concepto_costo_id']
    WHEN 'seguros_embarque' THEN ARRAY['id','organization_id','embarque_id','proveedor_factura_id','deleted_at']
    WHEN 'embarque_facturas_entrantes' THEN ARRAY['id','organization_id','embarque_id','proveedor_factura_id','deleted_at']
    WHEN 'embarque_garantias_contenedor' THEN ARRAY['id','organization_id','embarque_id','proveedor_factura_id','deleted_at']
    WHEN 'pagos_factura' THEN ARRAY['id','organization_id','factura_id','embarque_id','deleted_at']
    WHEN 'factura_notas_credito' THEN ARRAY['id','organization_id','factura_id','deleted_at']
    WHEN 'pagos_proveedor' THEN ARRAY['id','organization_id','proveedor_factura_id','deleted_at']
    WHEN 'proveedor_notas_credito' THEN ARRAY['id','organization_id','proveedor_factura_id','deleted_at']
    WHEN 'comisiones_devengadas' THEN ARRAY['id','organization_id','embarque_id','factura_id','pago_factura_id','definitiva']
    ELSE NULL END;
  IF v_keys IS NULL THEN
    RAISE EXCEPTION 'LC_FORBIDDEN: vínculo financiero fuera de la organización autorizada' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(k, v_old->k), jsonb_object_agg(k, v_new->k)
      INTO v_old_projection, v_new_projection FROM unnest(v_keys) AS u(k);
    IF v_old_projection IS NOT DISTINCT FROM v_new_projection THEN RETURN NEW; END IF;
  END IF;
  -- A document cannot migrate across tenants through this relationship guard.
  IF TG_OP = 'UPDATE' AND v_old_org IS DISTINCT FROM v_new_org THEN
    RAISE EXCEPTION 'LC_FORBIDDEN: vínculo financiero fuera de la organización autorizada' USING ERRCODE = '42501';
  END IF;
  v_org := COALESCE(v_new_org, v_old_org);
  IF TG_TABLE_NAME = 'conceptos_venta' AND TG_OP = 'UPDATE'
    AND v_old->>'proforma_id' IS NOT NULL AND v_new->>'proforma_id' IS NULL
    AND v_new->>'estado_facturacion' = 'pendiente' AND v_old->>'deleted_at' IS NULL
    AND (v_new - 'proforma_id' - 'estado_facturacion') = (v_old - 'proforma_id' - 'estado_facturacion') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.proforma_liberaciones_portal l
      JOIN public.proformas p ON p.id = l.proforma_id AND p.organization_id = l.organization_id
      JOIN public.embarques e ON e.id = p.embarque_id AND e.organization_id = p.organization_id
      WHERE l.proforma_id = (v_old->>'proforma_id')::uuid AND l.organization_id = v_org
        AND l.transaccion = txid_current() AND p.deleted_at IS NULL AND p.estado_cliente = 'rechazada'
        AND e.id = (v_old->>'embarque_id')::uuid
    ) INTO v_liberacion_portal;
  END IF;
  -- Do admission and composite-FK checks before any advisory/parent lock.
  IF NOT v_liberacion_portal THEN
    PERFORM public._h14_validar_fila_org_baja(v_org, TG_TABLE_NAME, v_old);
    PERFORM public._h14_validar_fila_org_baja(v_org, TG_TABLE_NAME, v_new);
    PERFORM public._h14_mutex_baja_embarque(v_org, false);
  ELSE
    PERFORM public._h14_lock_grafo_baja_embarque(v_org, false);
  END IF;
  -- Resolve again after the mutex: a source could have moved while admission
  -- ran. All relevant writers now share this anchor, even with no targets.
  IF NOT v_liberacion_portal THEN
    PERFORM public._h14_validar_fila_org_baja(v_org, TG_TABLE_NAME, v_old);
    PERFORM public._h14_validar_fila_org_baja(v_org, TG_TABLE_NAME, v_new);
  END IF;
  v_old_targets := public._h14_grafo_fila_baja(v_org, TG_TABLE_NAME, v_old);
  v_new_targets := public._h14_grafo_fila_baja(v_org, TG_TABLE_NAME, v_new);
  v_old_activa := public._h14_fila_bloqueante_baja(v_org, TG_TABLE_NAME, v_old);
  v_new_activa := public._h14_fila_bloqueante_baja(v_org, TG_TABLE_NAME, v_new);
  v_restaurar := TG_OP = 'UPDATE' AND v_old->>'deleted_at' IS NOT NULL AND v_new->>'deleted_at' IS NULL;
  IF TG_OP = 'UPDATE' THEN
    v_reactivar := CASE TG_TABLE_NAME
      WHEN 'facturas' THEN v_old->>'estado' IN ('Cancelada', 'Sustituida')
        AND v_new->>'estado' NOT IN ('Cancelada', 'Sustituida')
      WHEN 'proformas' THEN v_old->>'estado_proforma' IN ('cancelada', 'facturada')
        AND COALESCE(v_new->>'estado_proforma', 'pendiente') NOT IN ('cancelada', 'facturada')
      ELSE false END;
  END IF;
  SELECT COALESCE(array_agg(DISTINCT id ORDER BY id), ARRAY[]::uuid[]) INTO v_targets
    FROM unnest(v_old_targets || v_new_targets) AS u(id) WHERE id IS NOT NULL;
  BEGIN
    PERFORM 1 FROM public.embarques e WHERE e.organization_id = v_org AND e.id = ANY(v_targets)
      ORDER BY e.id FOR NO KEY UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'LC_EMBARQUE_EN_USO: los vínculos financieros se están actualizando; consulta el estado y vuelve a intentarlo'
      USING ERRCODE = '55P03';
  END;
  IF (SELECT count(*) FROM public.embarques e WHERE e.organization_id = v_org AND e.id = ANY(v_targets))
     IS DISTINCT FROM cardinality(v_targets)::bigint THEN
    RAISE EXCEPTION 'LC_FORBIDDEN: vínculo financiero fuera de la organización autorizada' USING ERRCODE = '42501';
  END IF;
  IF TG_OP <> 'DELETE' AND v_new_activa IS TRUE THEN
    IF TG_OP = 'INSERT' OR v_old_activa IS NOT TRUE OR v_restaurar IS TRUE OR v_reactivar IS TRUE THEN
      v_validar := v_new_targets;
    ELSE
      SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[]) INTO v_validar
        FROM unnest(v_new_targets) AS u(id) WHERE NOT (id = ANY(v_old_targets));
    END IF;
    FOREACH v_target IN ARRAY v_validar LOOP
      SELECT e.deleted_at INTO v_deleted FROM public.embarques e
        WHERE e.id = v_target AND e.organization_id = v_org;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'LC_FORBIDDEN: vínculo financiero fuera de la organización autorizada' USING ERRCODE = '42501';
      END IF;
      IF v_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'LC_EMBARQUE_ELIMINADO: no se pueden crear o activar vínculos financieros con un embarque eliminado'
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;
REVOKE ALL ON FUNCTION public._h14_guard_escritor_baja() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._isr_guard_concepto() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cliente uuid; v_eval jsonb; v_parent_org uuid; v_opt_in boolean; v_ambiente text; v_origen jsonb; v_cot public.cotizaciones;
  v_revision boolean := false;
  v_linea jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.evaluacion_fiscal IS NOT NULL THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL AND NEW.evaluacion_fiscal IS NULL THEN
    RAISE EXCEPTION 'LC_ISR_NO_DESACTIVAR' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'conceptos_venta' AND TG_OP = 'UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL
    AND (OLD.proforma_id IS NOT NULL OR NEW.proforma_id IS NOT NULL) THEN
    PERFORM public._isr_validar_vinculo_proforma_normal(to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'conceptos_venta' THEN
    -- An authenticated writer cannot create an open audit row or reuse a completed review.
    SELECT EXISTS (SELECT 1 FROM public.embarque_revisiones_fiscales r
      WHERE r.embarque_id = NEW.embarque_id AND r.organization_id = NEW.organization_id
        AND r.transaccion = txid_current() AND r.actor_id = auth.uid() AND r.aplicada_at IS NULL)
      INTO v_revision;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL AND (
    (to_jsonb(NEW)->'organization_id',to_jsonb(NEW)->'embarque_id',to_jsonb(NEW)->'proforma_id')
      IS DISTINCT FROM
    (to_jsonb(OLD)->'organization_id',to_jsonb(OLD)->'embarque_id',to_jsonb(OLD)->'proforma_id')
    OR (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      AND NOT (v_revision AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='conceptos_venta' THEN
    IF TG_OP='UPDATE' AND OLD.cotizacion_concepto_origen_id IS DISTINCT FROM NEW.cotizacion_concepto_origen_id THEN
      RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE='23514';
    END IF;
    v_opt_in := public._isr_documento_habilitado(NEW.organization_id) OR EXISTS(
      SELECT 1 FROM public.conceptos_venta WHERE embarque_id=NEW.embarque_id AND evaluacion_fiscal IS NOT NULL
    );
    IF TG_OP='UPDATE' AND OLD.embarque_id IS DISTINCT FROM NEW.embarque_id
      AND (v_opt_in OR NEW.evaluacion_fiscal IS NOT NULL) THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
    END IF;
    IF NEW.evaluacion_fiscal IS NULL AND NEW.proforma_id IS NULL AND NEW.estado_facturacion='pendiente'
      AND v_opt_in THEN
      NEW.evaluacion_fiscal:='{}';
    END IF;
  END IF;
  IF NEW.evaluacion_fiscal IS NULL THEN
    IF NEW.tasa_ret_isr IS NOT NULL OR NEW.monto_ret_isr IS NOT NULL THEN
      RAISE EXCEPTION 'LC_ISR_EVALUACION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    v_opt_in := (
      (TG_TABLE_NAME='conceptos_venta' AND EXISTS(SELECT 1 FROM public.conceptos_venta
        WHERE embarque_id=(to_jsonb(NEW)->>'embarque_id')::uuid AND evaluacion_fiscal IS NOT NULL))
      OR (TG_TABLE_NAME='proforma_conceptos_consolidados' AND EXISTS(SELECT 1 FROM public.proforma_conceptos_consolidados
        WHERE proforma_id=(to_jsonb(NEW)->>'proforma_id')::uuid AND evaluacion_fiscal IS NOT NULL))
    );
    -- Serialize opt-in against legacy conversion, not ordinary legacy edits.
    IF TG_TABLE_NAME='conceptos_venta' AND NEW.proforma_id IS NOT NULL THEN
      PERFORM 1 FROM public.embarques WHERE id=NEW.embarque_id FOR NO KEY UPDATE;
      SELECT EXISTS(SELECT 1 FROM public.conceptos_venta WHERE embarque_id=NEW.embarque_id
        AND evaluacion_fiscal IS NOT NULL) INTO v_opt_in;
      IF v_opt_in THEN RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514'; END IF;
    END IF;
    IF v_opt_in AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND
      (to_jsonb(NEW)->'embarque_id',to_jsonb(NEW)->'proforma_id',NEW.organization_id) IS DISTINCT FROM
      (to_jsonb(OLD)->'embarque_id',to_jsonb(OLD)->'proforma_id',OLD.organization_id))) THEN
      RAISE EXCEPTION 'LC_ISR_EVALUACION_REQUERIDA' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'conceptos_venta' THEN
    SELECT cliente_id,organization_id INTO v_cliente,v_parent_org FROM public.embarques WHERE id=NEW.embarque_id FOR NO KEY UPDATE;
    IF EXISTS(SELECT 1 FROM public.conceptos_venta c JOIN public.proformas pf ON pf.id = c.proforma_id
      WHERE c.embarque_id = NEW.embarque_id AND pf.evaluacion_fiscal IS NULL) THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
    END IF;
    IF NEW.proforma_id IS NOT NULL OR NEW.estado_facturacion <> 'pendiente' THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT cliente_id,organization_id INTO v_cliente,v_parent_org FROM public.proformas
      WHERE id=NEW.proforma_id AND estado_aprobacion='borrador' AND estado_proforma='pendiente'
      AND evaluacion_fiscal IS NULL
      AND enviada_at IS NULL AND factura_id IS NULL AND factura_secundaria_id IS NULL
      AND estado_cliente='pendiente' AND consolidada_en IS NULL FOR NO KEY UPDATE;
    IF EXISTS(SELECT 1 FROM public.conceptos_factura WHERE proforma_id_origen=NEW.proforma_id) THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
    END IF;
  END IF;
  IF v_parent_org IS DISTINCT FROM NEW.organization_id OR v_parent_org IS NULL THEN
    RAISE EXCEPTION 'LC_ISR_PADRE_INVALIDO' USING ERRCODE = '23514';
  END IF;
  IF v_revision AND NEW.deleted_at IS NULL THEN
    v_linea := public._evaluar_documento_isr_resico(NEW.organization_id, v_cliente, jsonb_build_array(to_jsonb(NEW)))
      ->'conceptos'->0;
    NEW.tipo_iva := v_linea->>'tipo_iva';
    NEW.total := round(NEW.cantidad * NEW.precio_unitario, 2);
    NEW.evaluacion_fiscal := v_linea->'evaluacion_fiscal';
    NEW.tasa_ret_isr := (v_linea->>'tasa_ret_isr')::numeric;
    NEW.monto_ret_isr := (v_linea->>'monto_ret_isr')::numeric;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='conceptos_venta' AND TG_OP='UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL THEN
    IF public._isr_base_revision_venta(to_jsonb(NEW)) IS DISTINCT FROM public._isr_base_revision_venta(to_jsonb(OLD))
      OR NEW.total IS DISTINCT FROM OLD.total THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    NEW.evaluacion_fiscal := OLD.evaluacion_fiscal;
    NEW.tasa_ret_isr := OLD.tasa_ret_isr;
    NEW.monto_ret_isr := OLD.monto_ret_isr;
    RETURN NEW;
  END IF;
  SELECT ambiente INTO v_ambiente FROM public.facturapi_credenciales WHERE organization_id=NEW.organization_id;
  IF TG_TABLE_NAME='conceptos_venta' AND TG_OP='INSERT' AND to_jsonb(NEW)->>'cotizacion_concepto_origen_id' IS NOT NULL THEN
    SELECT c.* INTO v_cot FROM public.cotizaciones c JOIN public.embarques e ON e.cotizacion_id=c.id
      WHERE e.id=NEW.embarque_id AND c.organization_id=NEW.organization_id AND c.deleted_at IS NULL;
    SELECT l INTO v_origen FROM jsonb_array_elements(v_cot.conceptos_venta) l WHERE l->>'id'=NEW.cotizacion_concepto_origen_id;
    IF v_cot.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado' OR v_cot.estado::text NOT IN ('Aceptada','En operación')
      OR v_origen IS NULL OR NEW.origen<>'cotizacion'
      OR (NEW.cantidad,NEW.precio_unitario,NEW.moneda::text,NEW.tipo_iva,NEW.tasa_iva_aplicada)
        IS DISTINCT FROM ((v_origen->>'cantidad')::numeric,(v_origen->>'precio_unitario')::numeric,v_origen->>'moneda',
          v_origen->>'tipo_iva',COALESCE((v_origen->>'tasa_iva_aplicada')::numeric,CASE v_origen->>'tipo_iva' WHEN 'gravado_16' THEN .16 WHEN 'gravado_8' THEN .08 ELSE 0 END)) THEN
      RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE='23514';
    END IF;
    v_eval:=public._evaluar_isr_resico(NEW.organization_id,v_cliente,COALESCE(v_ambiente,'sandbox'),NEW.cantidad,NEW.precio_unitario,NEW.tipo_iva);
    IF v_eval IS DISTINCT FROM v_origen->'evaluacion_fiscal' THEN RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514'; END IF;
    v_eval:=v_origen->'evaluacion_fiscal';
  ELSE
    v_eval := public._evaluar_isr_resico(NEW.organization_id,v_cliente,COALESCE(v_ambiente,'sandbox'),
      NEW.cantidad,NEW.precio_unitario,NEW.tipo_iva);
  END IF;
  NEW.evaluacion_fiscal := v_eval;
  NEW.tasa_ret_isr := (v_eval->>'tasa_ret_isr')::numeric;
  NEW.monto_ret_isr := (v_eval->>'monto_ret_isr')::numeric;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_guard_conversion_factura() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_proforma_id uuid := (to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME = 'facturas' THEN 'proforma_id' ELSE 'proforma_id_origen' END)::uuid;
BEGIN
  IF v_proforma_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'conceptos_factura' THEN
    PERFORM 1 FROM public.proformas WHERE id=v_proforma_id FOR NO KEY UPDATE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.proformas WHERE id=v_proforma_id AND evaluacion_fiscal IS NOT NULL
  ) OR (TG_TABLE_NAME='conceptos_factura' AND EXISTS (
    SELECT 1 FROM public.proforma_conceptos_consolidados WHERE proforma_id=v_proforma_id AND evaluacion_fiscal IS NOT NULL
  )) THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Fuente canónica. Forward: 20261006233000_proforma_operativa_compatibilidad.sql.
CREATE OR REPLACE FUNCTION public.crear_proforma_atomica(p_organization_id uuid, p_embarque_id uuid, p_cliente_id uuid, p_cliente_nombre text, p_expediente text, p_bl_master text, p_concepto_ids uuid[], p_subtotal_usd numeric, p_iva_usd numeric, p_total_usd numeric, p_subtotal_mxn numeric, p_iva_mxn numeric, p_total_mxn numeric, p_notas text, p_operador text, p_dias_credito integer, p_tasa_iva numeric, p_iva_overrides jsonb DEFAULT '{}'::jsonb) RETURNS public.proformas
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_numero text;
  v_estado_embarque text;
  v_cliente_embarque uuid;
  v_proforma public.proformas;
  v_override record;
  v_org uuid;
  v_sub_usd numeric := 0;
  v_iva_usd numeric := 0;
  v_sub_mxn numeric := 0;
  v_iva_mxn numeric := 0;
  v_total_usd numeric;
  v_total_mxn numeric;
  v_fiscal jsonb;
  v_usd jsonb;
  v_mxn jsonb;
  v_tc numeric;
  v_ocupados int;
  v_actualizados int;
  v_ajenos int;
  v_no_soportados int;
  v_overrides_fuera int;
  -- R170-02: fecha de negocio en hora México, no CURRENT_DATE (UTC).
  v_hoy_mx date := (now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  IF p_concepto_ids IS NULL OR array_length(p_concepto_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Debe seleccionar al menos un concepto';
  END IF;
  IF has_role(auth.uid(), 'super_admin'::app_role) THEN
    v_org := p_organization_id;
  ELSE
    v_org := current_user_org_id();
  END IF;
  PERFORM public._assert_writer(v_org);
  -- Ola E1 · C5: el embarque debe existir en la organización y coincidir con
  -- el cliente recibido; antes se confiaba en los argumentos del cliente.
  IF NOT EXISTS (
    SELECT 1 FROM public.embarques e
     WHERE e.id = p_embarque_id
       AND e.organization_id = v_org
       AND e.deleted_at IS NULL
       AND (p_cliente_id IS NULL OR e.cliente_id = p_cliente_id)
  ) THEN
    RAISE EXCEPTION 'LC_PROFORMA_EMBARQUE_INVALIDO: el embarque no existe en tu organización o no corresponde al cliente indicado'
      USING ERRCODE = 'P0001';
  END IF;
  -- El cierre operativo no se elude por un efecto lateral del trigger
  -- que mantiene tiene_proforma. Los guards vuelven a validar al vincular.
  SELECT estado::text, cliente_id, tipo_cambio_usd INTO v_estado_embarque, v_cliente_embarque, v_tc
  FROM public.embarques WHERE id = p_embarque_id AND organization_id = v_org AND deleted_at IS NULL
    AND (p_cliente_id IS NULL OR cliente_id = p_cliente_id) FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LC_PROFORMA_EMBARQUE_INVALIDO: recarga el embarque y verifica el cliente' USING ERRCODE = 'P0001';
  END IF;
  IF v_estado_embarque = 'Cerrado' THEN
    RAISE EXCEPTION 'LC_EMBARQUE_CERRADO: reabre el embarque antes de generar una proforma'
      USING ERRCODE = '23514';
  END IF;
  -- Bloquea los conceptos y valida que estén libres antes de crear la proforma.
  PERFORM 1 FROM public.conceptos_venta
   WHERE id = ANY(p_concepto_ids) AND organization_id = v_org
   ORDER BY id FOR UPDATE;
  -- Ola E1 · C5: ningún concepto puede venir de otro embarque ni estar borrado.
  SELECT COUNT(*) INTO v_ajenos
  FROM unnest(p_concepto_ids) AS s(id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.conceptos_venta cv
     WHERE cv.id = s.id
       AND cv.organization_id = v_org
       AND cv.embarque_id = p_embarque_id
       AND cv.deleted_at IS NULL
  );
  IF v_ajenos > 0 THEN
    RAISE EXCEPTION 'LC_CONCEPTOS_AJENOS: % concepto(s) no pertenecen a este embarque o fueron eliminados; recarga la pantalla', v_ajenos
      USING ERRCODE = 'P0001';
  END IF;
  -- Ola 2 · A: EUR (o cualquier moneda fuera de MXN/USD) no es soportado en
  -- venta; antes se proformaba y facturaba en $0 en silencio.
  SELECT COUNT(*) INTO v_no_soportados
  FROM public.conceptos_venta
  WHERE id = ANY(p_concepto_ids)
    AND organization_id = v_org
    AND moneda NOT IN ('MXN', 'USD');
  IF v_no_soportados > 0 THEN
    RAISE EXCEPTION 'LC_MONEDA_VENTA_NO_SOPORTADA: % concepto(s) de venta tienen una moneda no soportada; sólo se puede facturar en MXN o USD', v_no_soportados
      USING ERRCODE = 'P0001';
  END IF;
  SELECT COUNT(*) INTO v_ocupados
  FROM public.conceptos_venta
  WHERE id = ANY(p_concepto_ids)
    AND organization_id = v_org
    AND (proforma_id IS NOT NULL OR COALESCE(estado_facturacion, 'pendiente') <> 'pendiente');
  IF v_ocupados > 0 THEN
    RAISE EXCEPTION 'LC_CONCEPTOS_YA_ASIGNADOS: % concepto(s) ya están en otra proforma o facturados; recarga la pantalla', v_ocupados
      USING ERRCODE = 'P0001';
  END IF;
  IF p_iva_overrides IS NOT NULL AND p_iva_overrides <> '{}'::jsonb THEN
    -- Integridad: un override sólo puede tocar conceptos de ESTA selección.
    -- Antes, el UPDATE no filtraba por p_concepto_ids y podía cambiar
    -- aplica_iva de cualquier otro concepto del mismo embarque.
    SELECT COUNT(*) INTO v_overrides_fuera
    FROM jsonb_object_keys(p_iva_overrides) AS k(id)
    WHERE NOT (k.id::uuid = ANY(p_concepto_ids));
    IF v_overrides_fuera > 0 THEN
      RAISE EXCEPTION 'LC_OVERRIDE_FUERA_DE_SELECCION: % ajuste(s) de IVA apuntan a conceptos que no están en esta proforma; recarga la pantalla', v_overrides_fuera
        USING ERRCODE = 'P0001';
    END IF;
    FOR v_override IN
      SELECT key AS concepto_id, (value)::text::boolean AS aplica
      FROM jsonb_each(p_iva_overrides)
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.conceptos_venta cv
        WHERE cv.id = v_override.concepto_id::uuid AND cv.organization_id = v_org
          AND v_override.aplica IS DISTINCT FROM (public._tasa_iva_canonica(cv.tipo_iva, cv.tasa_iva_aplicada, cv.aplica_iva) > 0)
      ) THEN
        RAISE EXCEPTION 'LC_PROFORMA_IVA_OVERRIDE: el IVA no se cambia al generar; clasifica explícitamente el concepto de venta'
          USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;
  PERFORM public._assert_iva_proforma_coherente(tipo_iva, tasa_iva_aplicada, aplica_iva)
  FROM public.conceptos_venta WHERE id = ANY(p_concepto_ids) AND organization_id = v_org;
  v_fiscal := public._isr_snapshot_proforma_normal(v_org, p_embarque_id, v_cliente_embarque, p_concepto_ids);
  IF v_fiscal IS NULL THEN
    SELECT
    COALESCE(SUM(CASE WHEN moneda='USD' THEN ROUND(cantidad*precio_unitario, 2) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN moneda='USD'
                      THEN ROUND(ROUND(cantidad*precio_unitario, 2) * public._tasa_iva_canonica(tipo_iva, tasa_iva_aplicada, aplica_iva), 2)
                      ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN moneda='MXN' THEN ROUND(cantidad*precio_unitario, 2) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN moneda='MXN'
                      THEN ROUND(ROUND(cantidad*precio_unitario, 2) * public._tasa_iva_canonica(tipo_iva, tasa_iva_aplicada, aplica_iva), 2)
                      ELSE 0 END), 0)
    INTO v_sub_usd, v_iva_usd, v_sub_mxn, v_iva_mxn
    FROM public.conceptos_venta WHERE id = ANY(p_concepto_ids) AND organization_id = v_org;
    v_total_usd := v_sub_usd + v_iva_usd;
    v_total_mxn := v_sub_mxn + v_iva_mxn;
  ELSE
    IF v_org IS DISTINCT FROM public.org_scope() THEN RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE = '42501'; END IF;
    SELECT b INTO v_usd FROM jsonb_array_elements(v_fiscal->'bloques') b WHERE b->>'moneda' = 'USD';
    SELECT b INTO v_mxn FROM jsonb_array_elements(v_fiscal->'bloques') b WHERE b->>'moneda' = 'MXN';
    v_sub_usd := COALESCE((v_usd->>'subtotal')::numeric, 0);
    v_iva_usd := COALESCE((v_usd->>'iva')::numeric, 0);
    v_total_usd := COALESCE((v_usd->>'total')::numeric, 0);
    v_sub_mxn := COALESCE((v_mxn->>'subtotal')::numeric, 0);
    v_iva_mxn := COALESCE((v_mxn->>'iva')::numeric, 0);
    v_total_mxn := COALESCE((v_mxn->>'total')::numeric, 0);
  END IF;
  IF v_sub_usd > 0 THEN
    IF v_tc IS NULL OR v_tc <= 0 THEN
      RAISE EXCEPTION 'LC_PROFORMA_TC_REQUERIDO: el embarque no tiene tipo de cambio USD para convertir los conceptos en dólares'
        USING ERRCODE='P0001';
    END IF;
    v_sub_mxn := v_sub_mxn + round(v_sub_usd * v_tc, 2);
    v_iva_mxn := v_iva_mxn + round(v_iva_usd * v_tc, 2);
    IF v_fiscal IS NULL THEN
      v_total_mxn := v_sub_mxn + v_iva_mxn;
    ELSE
      v_total_mxn := v_total_mxn + round(v_total_usd * v_tc, 2);
      v_fiscal := v_fiscal || jsonb_build_object('tipo_cambio_usd', v_tc, 'total_equivalente_mxn', v_total_mxn);
    END IF;
  END IF;
  IF ABS(COALESCE(p_iva_usd,0) - v_iva_usd) > 0.01
     OR ABS(COALESCE(p_iva_mxn,0) - v_iva_mxn) > 0.01 THEN
    RAISE NOTICE 'crear_proforma_atomica: desfase cliente vs server';
  END IF;
  v_numero := public.generar_numero_proforma(v_org);
  INSERT INTO public.proformas (
    numero, embarque_id, cliente_id, cliente_nombre, expediente, bl_master,
    subtotal_usd, iva_usd, total_usd, subtotal_mxn, iva_mxn, total_mxn,
    notas, operador, dias_credito, organization_id, tasa_iva_aplicada,
    fecha_emision, evaluacion_fiscal, conceptos_fiscales
  ) VALUES (
    v_numero, p_embarque_id, CASE WHEN v_fiscal IS NULL THEN p_cliente_id ELSE v_cliente_embarque END,
    p_cliente_nombre, p_expediente, p_bl_master,
    v_sub_usd, v_iva_usd, v_total_usd,
    v_sub_mxn, v_iva_mxn, v_total_mxn,
    p_notas, p_operador, p_dias_credito, v_org, p_tasa_iva,
    v_hoy_mx, v_fiscal - 'conceptos', v_fiscal->'conceptos'
  )
  RETURNING * INTO v_proforma;
  UPDATE public.conceptos_venta
  SET estado_facturacion = 'en_proforma', proforma_id = v_proforma.id
  WHERE id = ANY(p_concepto_ids)
    AND organization_id = v_org
    AND embarque_id = p_embarque_id
    AND proforma_id IS NULL
    AND COALESCE(estado_facturacion, 'pendiente') = 'pendiente';
  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  IF v_actualizados <> array_length(p_concepto_ids, 1) THEN
    RAISE EXCEPTION 'LC_CONCEPTOS_YA_ASIGNADOS: los conceptos cambiaron de estado durante la operación; recarga la pantalla'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN v_proforma;
END;
$_$;

CREATE OR REPLACE FUNCTION public.eliminar_proforma_rpc(p_proforma_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org uuid; v_numero text; v_estado text; v_factura uuid; v_factura2 uuid;
  v_deleted timestamptz; v_embarque uuid; v_factura_viva boolean; v_fiscal boolean;
BEGIN
  SELECT organization_id, numero, estado_proforma, factura_id,
         factura_secundaria_id, deleted_at, embarque_id, evaluacion_fiscal IS NOT NULL
    INTO v_org, v_numero, v_estado, v_factura, v_factura2, v_deleted, v_embarque, v_fiscal
  FROM public.proformas WHERE id = p_proforma_id
  FOR UPDATE;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'LC_PROFORMA_NO_ENCONTRADA';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_org) THEN
    RAISE EXCEPTION 'LC_ORG_AJENA';
  END IF;
  IF auth.uid() IS NOT NULL AND v_fiscal AND v_org IS DISTINCT FROM public.org_scope() THEN
    RAISE EXCEPTION 'LC_ORG_AJENA' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_any_role_efectivo(
       auth.uid(),
       ARRAY['admin'::public.app_role, 'admin_org'::public.app_role,
             'operador'::public.app_role, 'contador'::public.app_role,
             'super_admin'::public.app_role]
     ) THEN
    RAISE EXCEPTION 'LC_PROFORMA_SIN_PERMISO: tu rol no puede cancelar proformas'
      USING ERRCODE = '42501';
  END IF;
  IF v_deleted IS NOT NULL OR v_estado = 'cancelada' THEN
    RETURN jsonb_build_object('numero', v_numero, 'embarque_id', v_embarque,
                              'eliminada', false, 'cancelada', false);
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.facturas fa
     WHERE fa.id IN (v_factura, v_factura2)
       AND fa.deleted_at IS NULL
       AND fa.estado::text NOT IN ('Cancelada', 'Sustituida')
  ) INTO v_factura_viva;
  IF v_factura_viva OR lower(COALESCE(v_estado, '')) = 'facturada' THEN
    RAISE EXCEPTION 'LC_PROFORMA_FACTURADA';
  END IF;
  -- Se conserva la proforma (histórico) y se liberan sus conceptos.
  UPDATE public.proformas SET estado_proforma = 'cancelada' WHERE id = p_proforma_id;
  UPDATE public.conceptos_venta
     SET estado_facturacion = 'pendiente', proforma_id = NULL
   WHERE proforma_id = p_proforma_id;
  RETURN jsonb_build_object('numero', v_numero, 'embarque_id', v_embarque,
                            'eliminada', false, 'cancelada', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.refacturar_proforma_rpc(p_proforma_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old public.proformas;
  v_conceptos uuid[];
  v_factura_num text;
  v_viva boolean;
BEGIN
  SELECT * INTO v_old FROM public.proformas WHERE id = p_proforma_id FOR UPDATE;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'LC_PROFORMA_NO_ENCONTRADA';
  END IF;
  IF NOT public.is_org_member(v_old.organization_id) THEN
    RAISE EXCEPTION 'LC_ORG_AJENA';
  END IF;
  IF v_old.evaluacion_fiscal IS NOT NULL AND v_old.organization_id IS DISTINCT FROM public.org_scope() THEN
    RAISE EXCEPTION 'LC_ORG_AJENA' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role_efectivo(auth.uid(),
       ARRAY['admin'::public.app_role,'admin_org'::public.app_role,
             'operador'::public.app_role,'contador'::public.app_role,
             'super_admin'::public.app_role]) THEN
    RAISE EXCEPTION 'LC_PROFORMA_SIN_PERMISO: tu rol no puede refacturar proformas'
      USING ERRCODE = '42501';
  END IF;
  IF v_old.deleted_at IS NOT NULL OR v_old.estado_proforma = 'cancelada' THEN
    RAISE EXCEPTION 'LC_REFACTURAR_PROFORMA_CANCELADA: esta proforma ya está cancelada';
  END IF;
  IF v_old.es_consolidada OR v_old.embarque_id IS NULL THEN
    RAISE EXCEPTION 'LC_REFACTURAR_CONSOLIDADA: las proformas consolidadas no se pueden refacturar desde aquí';
  END IF;
  -- Ninguna factura ligada puede seguir viva.
  SELECT EXISTS (
    SELECT 1 FROM public.facturas fa
     WHERE fa.deleted_at IS NULL
       AND (fa.proforma_id = p_proforma_id OR fa.id IN (v_old.factura_id, v_old.factura_secundaria_id))
       AND fa.estado::text NOT IN ('Cancelada','Sustituida')
  ) INTO v_viva;
  IF v_viva THEN
    RAISE EXCEPTION 'LC_PROFORMA_FACTURADA';
  END IF;
  SELECT fa.numero INTO v_factura_num FROM public.facturas fa
   WHERE fa.deleted_at IS NULL
     AND (fa.proforma_id = p_proforma_id OR fa.id IN (v_old.factura_id, v_old.factura_secundaria_id))
     AND fa.estado::text = 'Cancelada'
   ORDER BY fa.created_at DESC LIMIT 1;
  IF v_factura_num IS NULL THEN
    RAISE EXCEPTION 'LC_REFACTURAR_SIN_FACTURA_CANCELADA: sólo se refactura una proforma cuya factura fue cancelada';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO v_conceptos
    FROM public.conceptos_venta
   WHERE proforma_id = p_proforma_id AND deleted_at IS NULL;
  IF v_conceptos IS NULL THEN
    RAISE EXCEPTION 'LC_REFACTURAR_SIN_CONCEPTOS: la proforma no tiene conceptos para copiar';
  END IF;
  -- Cierra la proforma histórica y libera sus conceptos. La nueva proforma se
  -- arma en el formulario normal del embarque (editable y con sus validaciones).
  UPDATE public.proformas SET estado_proforma = 'cancelada' WHERE id = p_proforma_id;
  UPDATE public.conceptos_venta
     SET estado_facturacion = 'pendiente', proforma_id = NULL
   WHERE proforma_id = p_proforma_id;
  RETURN jsonb_build_object(
    'embarque_id', v_old.embarque_id,
    'anterior_numero', v_old.numero,
    'factura_cancelada', v_factura_num,
    'conceptos', to_jsonb(v_conceptos),
    'notas_sugeridas', trim(both from concat_ws(E'\n',
      '[Refacturación de proforma ' || v_old.numero || ' / Factura ' || v_factura_num || ' cancelada]',
      v_old.notas)));
END;
$$;

-- Canonical schema para public.portal_obtener_proforma_por_token
-- Sincronizado en FIX4 tanda 4 (N-2 · multimoneda dual).
--
-- Historial de fixes:
--   · antes se exponía una columna inexistente (`importe`) de la vista
--     `proforma_conceptos_consolidados`, que publica `total`. Se conserva el
--     nombre `importe` como clave de salida en el JSON del portal público
--     para no romper el contrato con el front.
--   · FIX3 (drift ronda 2): rate limit de BD restaurado (30 lecturas/min por
--     IP+identidad), mismo patrón que las demás RPCs de la whitelist anon.
--     check_ratelimit escribe en ratelimit_buckets → la función debe ser
--     VOLATILE.
--   · FIX4 N-2: la tabla proformas ya no tiene moneda/subtotal/iva/total
--     singulares (son *_mxn / *_usd). La RPC devuelve ambos juegos duales y
--     conserva las claves legacy singulares derivadas (MXN si
--     subtotal_mxn > 0 o ambos cero; si no, USD) para no romper el contrato
--     del front publicado.
CREATE OR REPLACE FUNCTION public.portal_obtener_proforma_por_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_proforma public.proformas%ROWTYPE;
  v_conceptos jsonb;
  v_estado_link text;
  v_rl jsonb;
  v_moneda_legacy text;
  v_bloques jsonb;
  v_mxn jsonb;
  v_usd jsonb;
BEGIN
  v_rl := public.check_ratelimit(
    'rpc:portal_obtener_proforma_por_token:'
      || COALESCE(NULLIF(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''), 'sin-ip')
      || ':' || COALESCE(auth.uid()::text, 'anon'),
    60, 30
  );
  IF (v_rl->>'ok') = 'false' THEN
    RAISE EXCEPTION 'Demasiadas solicitudes. Intenta de nuevo en % segundos.', COALESCE(v_rl->>'retry_after', '60')
      USING ERRCODE = 'P0001';
  END IF;

  IF p_token IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_proforma FROM public.proformas WHERE token_publico = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','token_invalido'); END IF;

  IF v_proforma.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error','token_invalido');
  END IF;

  IF v_proforma.estado_proforma = 'cancelada' THEN
    v_estado_link := 'cancelada';
  ELSIF v_proforma.token_expira_at IS NOT NULL AND v_proforma.token_expira_at < now() THEN
    v_estado_link := 'expirado';
  ELSIF v_proforma.estado_cliente <> 'pendiente' THEN
    v_estado_link := 'respondida';
  ELSE
    v_estado_link := 'activo';
  END IF;

  -- BL-11: link no vigente → no exponer montos, conceptos ni datos del cliente.
  IF v_estado_link <> 'activo' THEN
    RETURN jsonb_build_object(
      'estado_link', v_estado_link,
      'proforma', jsonb_build_object(
        'id', v_proforma.id,
        'numero', v_proforma.numero
      ),
      'conceptos', '[]'::jsonb
    );
  END IF;

  IF v_proforma.evaluacion_fiscal IS NOT NULL THEN
    -- Proyección pública de los importes y renglones guardados, sin perfil ni linaje interno.
    SELECT jsonb_agg(jsonb_build_object('moneda', b->'moneda', 'subtotal', b->'subtotal', 'iva', b->'iva',
      'ret_isr', b->'ret_isr', 'ret_iva', b->'ret_iva', 'total', b->'total') ORDER BY b->>'moneda')
      INTO v_bloques FROM jsonb_array_elements(v_proforma.evaluacion_fiscal->'bloques') b;
    SELECT b INTO v_mxn FROM jsonb_array_elements(v_bloques) b WHERE b->>'moneda' = 'MXN';
    SELECT b INTO v_usd FROM jsonb_array_elements(v_bloques) b WHERE b->>'moneda' = 'USD';
    SELECT jsonb_agg(jsonb_build_object('id', c->'id', 'descripcion', c->'descripcion', 'cantidad', c->'cantidad',
      'precio_unitario', c->'precio_unitario', 'importe', c->'total', 'moneda', c->'moneda',
      'tipo_iva', c->'tipo_iva', 'tasa_iva_aplicada', c->'tasa_iva_aplicada', 'aplica_iva', c->'aplica_iva') ORDER BY ord)
      INTO v_conceptos FROM jsonb_array_elements(v_proforma.conceptos_fiscales) WITH ORDINALITY AS l(c, ord);
    v_moneda_legacy := CASE WHEN v_mxn IS NOT NULL THEN 'MXN' ELSE 'USD' END;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pcc.id,
    'descripcion', pcc.descripcion,
    'cantidad', pcc.cantidad,
    'precio_unitario', pcc.precio_unitario,
    'importe', pcc.total,
    'moneda', pcc.moneda,
    'tipo_iva', pcc.tipo_iva,
    'tasa_iva_aplicada', pcc.tasa_iva_aplicada,
    'aplica_iva', pcc.aplica_iva
  ) ORDER BY pcc.created_at), '[]'::jsonb)
    INTO v_conceptos
    FROM public.proforma_conceptos_consolidados pcc
   WHERE pcc.proforma_id = v_proforma.id;

  -- FIX4 N-2: las columnas singulares ya no existen (multimoneda dual). Las
  -- claves legacy se derivan: MXN si hay subtotal_mxn o si ambos son cero
  -- (default histórico); si no, USD. El front nuevo usa los juegos duales.
    v_moneda_legacy := CASE
      WHEN v_proforma.subtotal_mxn > 0
        OR (v_proforma.subtotal_mxn = 0 AND v_proforma.subtotal_usd = 0)
      THEN 'MXN' ELSE 'USD' END;
    v_mxn := jsonb_build_object('subtotal', v_proforma.subtotal_mxn, 'iva', v_proforma.iva_mxn, 'total', v_proforma.total_mxn);
    v_usd := jsonb_build_object('subtotal', v_proforma.subtotal_usd, 'iva', v_proforma.iva_usd, 'total', v_proforma.total_usd);
  END IF;

  RETURN jsonb_build_object(
    'estado_link', v_estado_link,
    'proforma', jsonb_build_object(
      'id', v_proforma.id,
      'numero', v_proforma.numero,
      'cliente_nombre', v_proforma.cliente_nombre,
      'expediente', v_proforma.expediente,
      -- Juegos duales (fuente de verdad multimoneda)
      'subtotal_mxn', v_mxn->'subtotal',
      'iva_mxn', v_mxn->'iva',
      'total_mxn', v_mxn->'total',
      'subtotal_usd', v_usd->'subtotal',
      'iva_usd', v_usd->'iva',
      'total_usd', v_usd->'total',
      'totales_fiscales', v_bloques,
      -- Claves legacy singulares derivadas (compat con el front publicado)
      'moneda', v_moneda_legacy,
      'subtotal', CASE WHEN v_moneda_legacy = 'MXN' THEN v_mxn->'subtotal' ELSE v_usd->'subtotal' END,
      'iva', CASE WHEN v_moneda_legacy = 'MXN' THEN v_mxn->'iva' ELSE v_usd->'iva' END,
      'total', CASE WHEN v_moneda_legacy = 'MXN' THEN v_mxn->'total' ELSE v_usd->'total' END,
      'estado_cliente', v_proforma.estado_cliente,
      'aceptada_at', v_proforma.aceptada_at,
      'rechazada_at', v_proforma.rechazada_at,
      'motivo_rechazo', v_proforma.motivo_rechazo,
      'created_at', v_proforma.created_at,
      'token_expira_at', v_proforma.token_expira_at
    ),
    'conceptos', v_conceptos
  );
END $function$;

REVOKE ALL ON FUNCTION public.portal_obtener_proforma_por_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_obtener_proforma_por_token(uuid) TO anon, authenticated;

-- Fuente canónica. Forward: 20261006233000_proforma_operativa_compatibilidad.sql.
CREATE OR REPLACE FUNCTION public.portal_responder_por_token(p_token uuid, p_respuesta text, p_motivo text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_proforma  public.proformas%ROWTYPE;
  v_now       timestamptz := now();
  v_motivo    text;
  v_titulo    text; v_mensaje text; v_tipo text;
  v_liberados integer := 0;
  v_rl        jsonb;
BEGIN
  v_rl := public.check_ratelimit(
    'rpc:portal_responder_por_token:'
      || COALESCE(NULLIF(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''), 'sin-ip')
      || ':' || COALESCE(auth.uid()::text, 'anon'),
    60, 10
  );
  IF (v_rl->>'ok') = 'false' THEN
    RAISE EXCEPTION 'Demasiadas solicitudes. Intenta de nuevo en % segundos.', COALESCE(v_rl->>'retry_after', '60')
      USING ERRCODE = 'P0001';
  END IF;
  IF p_respuesta NOT IN ('aceptada','rechazada') THEN
    RAISE EXCEPTION 'Respuesta inválida.';
  END IF;
  -- fix3: FOR UPDATE serializa respuestas concurrentes del mismo token; la
  -- segunda espera el commit de la primera y ve el estado ya respondido.
  SELECT * INTO v_proforma FROM public.proformas WHERE token_publico = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enlace inválido.'; END IF;
  IF v_proforma.token_expira_at IS NOT NULL AND v_proforma.token_expira_at < now() THEN
    RAISE EXCEPTION 'El enlace ha expirado. Solicita uno nuevo a tu ejecutivo.';
  END IF;
  IF v_proforma.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'LC_PROFORMA_ELIMINADA: la proforma fue eliminada' USING ERRCODE='P0001';
  END IF;
  IF v_proforma.estado_proforma = 'cancelada' THEN
    RAISE EXCEPTION 'LC_PROFORMA_CANCELADA: crea una nueva proforma para continuar' USING ERRCODE='P0001';
  END IF;
  IF v_proforma.estado_cliente <> 'pendiente' THEN
    RAISE EXCEPTION 'Esta proforma ya fue respondida (%).', v_proforma.estado_cliente;
  END IF;
  IF p_respuesta = 'rechazada' AND v_proforma.estado_proforma = 'facturada' THEN
    RAISE EXCEPTION 'No puedes rechazar una proforma que ya fue facturada.';
  END IF;
  -- fix3: motivo acotado a 1000 caracteres (se copia a bitácora,
  -- notificaciones y emails; antes era text sin límite).
  v_motivo := NULLIF(LEFT(btrim(COALESCE(p_motivo, '')), 1000), '');
  IF p_respuesta = 'rechazada' AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'Es obligatorio indicar el motivo de rechazo.';
  END IF;
  -- fix3: compare-and-set atómico — si otra respuesta ganó la carrera entre
  -- el SELECT y este UPDATE, 0 filas y se reporta como ya respondida.
  UPDATE public.proformas
     SET estado_cliente = p_respuesta,
         aceptada_at    = CASE WHEN p_respuesta='aceptada'  THEN v_now ELSE aceptada_at END,
         rechazada_at   = CASE WHEN p_respuesta='rechazada' THEN v_now ELSE rechazada_at END,
         aceptada_por   = CASE WHEN p_respuesta='aceptada'  THEN 'cliente_portal_token'
                               WHEN p_respuesta='rechazada' THEN 'cliente_portal_token'
                               ELSE aceptada_por END,
         motivo_rechazo = CASE WHEN p_respuesta='rechazada' THEN v_motivo ELSE motivo_rechazo END,
         updated_at = v_now
   WHERE id = v_proforma.id
     AND estado_cliente = 'pendiente';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta proforma ya fue respondida por otra solicitud concurrente.';
  END IF;
  IF p_respuesta = 'rechazada' THEN
    v_liberados := public._liberar_conceptos_proforma_portal(v_proforma.id, v_proforma.organization_id);
  END IF;
  -- fix3: usuario sentinel en vez de NULL — bitacora_actividad.usuario_id es
  -- NOT NULL (20260301200638). Mismo patrón que otras escrituras de sistema
  -- ('00000000-…', ver 20260717025858).
  INSERT INTO public.bitacora_actividad (organization_id, usuario_id, usuario_email, accion, modulo, entidad_id, entidad_nombre, detalles)
  VALUES (v_proforma.organization_id, '00000000-0000-0000-0000-000000000000'::uuid, 'cliente-portal-token',
          CASE WHEN p_respuesta='aceptada' THEN 'proforma_aceptada_cliente' ELSE 'proforma_rechazada_cliente' END,
          'proformas', v_proforma.id, COALESCE(v_proforma.numero,''),
          jsonb_build_object('proforma_id', v_proforma.id, 'numero', v_proforma.numero,
                             'cliente_id', v_proforma.cliente_id, 'cliente_nombre', v_proforma.cliente_nombre,
                             'respuesta', p_respuesta, 'motivo', v_motivo,
                             'conceptos_liberados', v_liberados,
                             'origen','portal_token'));
  v_tipo := CASE WHEN p_respuesta='aceptada' THEN 'proforma_aceptada' ELSE 'proforma_rechazada' END;
  v_titulo := 'Proforma ' || COALESCE(v_proforma.numero,'') || ' ' ||
              CASE WHEN p_respuesta='aceptada' THEN 'aceptada por el cliente' ELSE 'rechazada por el cliente' END;
  v_mensaje := 'Cliente: ' || COALESCE(v_proforma.cliente_nombre,'N/D') ||
               CASE WHEN v_motivo IS NOT NULL THEN E'\nMotivo: ' || v_motivo ELSE '' END ||
               CASE WHEN p_respuesta='rechazada' AND v_liberados > 0
                    THEN E'\nSe liberaron ' || v_liberados || ' concepto(s) para regenerar la proforma.'
                    ELSE '' END;
  INSERT INTO public.notificaciones_internas (organization_id, usuario_id, tipo, titulo, mensaje, enlace, entidad_tipo, entidad_id)
  SELECT v_proforma.organization_id, om.user_id, v_tipo, v_titulo, v_mensaje,
         '/proformas/' || v_proforma.id::text, 'proforma', v_proforma.id
    FROM public.organization_members om
   WHERE om.organization_id = v_proforma.organization_id
     AND om.role IN ('admin'::app_role, 'admin_org'::app_role, 'operador'::app_role, 'contador'::app_role);
  RETURN jsonb_build_object(
    'id', v_proforma.id,
    'estado_cliente', p_respuesta,
    'respondida_at', v_now,
    'conceptos_liberados', v_liberados
  );
END $$;

-- Candidato forward 20261011180000; CREATE OR REPLACE conserva ACL.
CREATE OR REPLACE FUNCTION public.portal_responder_proforma(p_proforma_id uuid, p_respuesta text, p_motivo text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_proforma public.proformas%ROWTYPE;
  v_user_email text;
  v_now timestamptz := now();
  v_motivo text;
  v_titulo text; v_mensaje text; v_tipo text;
  v_liberados integer := 0;
BEGIN
  IF p_respuesta NOT IN ('aceptada','rechazada') THEN
    RAISE EXCEPTION 'Respuesta inválida. Debe ser aceptada o rechazada.';
  END IF;
  SELECT * INTO v_proforma FROM public.proformas
   WHERE id = p_proforma_id AND cliente_id IN (SELECT current_user_client_ids()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proforma no encontrada o no tienes acceso.'; END IF;
  IF v_proforma.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'LC_PROFORMA_ELIMINADA: la proforma fue eliminada' USING ERRCODE='P0001';
  END IF;
  IF v_proforma.estado_proforma = 'cancelada' THEN
    RAISE EXCEPTION 'LC_PROFORMA_CANCELADA: crea una nueva proforma para continuar' USING ERRCODE='P0001';
  END IF;
  IF v_proforma.estado_cliente <> 'pendiente' THEN
    RAISE EXCEPTION 'Esta proforma ya fue respondida (estado: %).', v_proforma.estado_cliente;
  END IF;
  v_motivo := NULLIF(trim(p_motivo), '');
  IF p_respuesta = 'rechazada' AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'Es obligatorio indicar el motivo de rechazo.';
  END IF;
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  UPDATE public.proformas
     SET estado_cliente = p_respuesta,
         aceptada_at    = CASE WHEN p_respuesta='aceptada'  THEN v_now ELSE aceptada_at END,
         rechazada_at   = CASE WHEN p_respuesta='rechazada' THEN v_now ELSE rechazada_at END,
         aceptada_por   = CASE WHEN p_respuesta='aceptada'  THEN COALESCE(v_user_email, auth.uid()::text) ELSE aceptada_por END,
         motivo_rechazo = CASE WHEN p_respuesta='rechazada' THEN v_motivo ELSE motivo_rechazo END,
         updated_at = v_now
   WHERE id = p_proforma_id;
  IF p_respuesta = 'rechazada' AND v_proforma.evaluacion_fiscal IS NOT NULL THEN
    v_liberados := public._liberar_conceptos_proforma_portal(v_proforma.id, v_proforma.organization_id);
  END IF;
  INSERT INTO public.bitacora_actividad (organization_id, usuario_id, usuario_email, accion, modulo, entidad_id, entidad_nombre, detalles)
  VALUES (v_proforma.organization_id, auth.uid(), COALESCE(v_user_email,''),
          CASE WHEN p_respuesta='aceptada' THEN 'proforma_aceptada_cliente' ELSE 'proforma_rechazada_cliente' END,
          'proformas', p_proforma_id, COALESCE(v_proforma.numero,''),
          jsonb_build_object('proforma_id', p_proforma_id, 'numero', v_proforma.numero,
                             'cliente_id', v_proforma.cliente_id, 'cliente_nombre', v_proforma.cliente_nombre,
                             'respuesta', p_respuesta, 'motivo', v_motivo, 'conceptos_liberados', v_liberados,
                             'origen','portal_cliente'));
  v_tipo := CASE WHEN p_respuesta='aceptada' THEN 'proforma_aceptada' ELSE 'proforma_rechazada' END;
  v_titulo := 'Proforma ' || COALESCE(v_proforma.numero,'') || ' ' ||
              CASE WHEN p_respuesta='aceptada' THEN 'aceptada por el cliente' ELSE 'rechazada por el cliente' END;
  v_mensaje := 'Cliente: ' || COALESCE(v_proforma.cliente_nombre,'N/D') ||
               CASE WHEN v_motivo IS NOT NULL THEN E'\nMotivo: ' || v_motivo ELSE '' END;
  INSERT INTO public.notificaciones_internas (organization_id, usuario_id, tipo, titulo, mensaje, enlace, entidad_tipo, entidad_id)
  SELECT v_proforma.organization_id, om.user_id, v_tipo, v_titulo, v_mensaje,
         '/proformas/' || p_proforma_id::text, 'proforma', p_proforma_id
    FROM public.organization_members om
   WHERE om.organization_id = v_proforma.organization_id
     AND om.role IN ('admin'::app_role, 'admin_org'::app_role, 'operador'::app_role, 'contador'::app_role);
  RETURN jsonb_build_object('id', p_proforma_id, 'estado_cliente', p_respuesta, 'respondida_at', v_now);
END $$;

CREATE TRIGGER zz_isr_proforma_normal BEFORE INSERT OR UPDATE OR DELETE ON public.proformas
FOR EACH ROW EXECUTE FUNCTION public._isr_guard_proforma_normal();
CREATE TRIGGER zz_isr_proforma_factura BEFORE INSERT OR UPDATE OF proforma_id ON public.facturas
FOR EACH ROW EXECUTE FUNCTION public._isr_guard_conversion_factura();
REVOKE ALL ON FUNCTION public._isr_concepto_proforma_normal(jsonb),
  public._isr_snapshot_proforma_normal(uuid,uuid,uuid,uuid[]),
  public._isr_guard_proforma_normal(), public._isr_validar_vinculo_proforma_normal(jsonb,jsonb),
  public._liberar_conceptos_proforma_portal(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
