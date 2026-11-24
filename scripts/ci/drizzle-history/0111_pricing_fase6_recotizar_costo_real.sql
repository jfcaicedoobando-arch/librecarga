ALTER TABLE public.crm_solicitudes_pricing
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recotizada_at timestamptz;

CREATE TABLE public.crm_pricing_opciones_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  solicitud_id uuid NOT NULL REFERENCES public.crm_solicitudes_pricing(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version >= 1),
  motivo text NOT NULL CHECK (length(trim(motivo)) >= 5),
  opciones jsonb NOT NULL DEFAULT '[]'::jsonb,
  tarifas jsonb NOT NULL DEFAULT '[]'::jsonb,
  respondida_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (solicitud_id, version)
);
CREATE INDEX crm_pricing_opciones_versiones_org_idx ON public.crm_pricing_opciones_versiones (organization_id, solicitud_id);

GRANT SELECT ON public.crm_pricing_opciones_versiones TO authenticated;
GRANT ALL ON public.crm_pricing_opciones_versiones TO service_role;
ALTER TABLE public.crm_pricing_opciones_versiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_pricing_versiones_leer ON public.crm_pricing_opciones_versiones
  FOR SELECT TO authenticated USING (organization_id = public.org_scope());
CREATE POLICY crm_pricing_versiones_tenant_restrictive ON public.crm_pricing_opciones_versiones
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.rls_tenant_scope_ok(organization_id)) WITH CHECK (public.rls_tenant_scope_ok(organization_id));

-- version/recotizada_at sólo por RPC; altas siempre nacen en versión 1.
CREATE OR REPLACE FUNCTION public._crm_pricing_version_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1; NEW.recotizada_at := NULL;
  ELSIF coalesce(current_setting('lc.pricing_rpc', true), '') <> '1'
     AND (NEW.version IS DISTINCT FROM OLD.version OR NEW.recotizada_at IS DISTINCT FROM OLD.recotizada_at) THEN
    RAISE EXCEPTION 'LC_PRICING_ESTADO_SOLO_RPC' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._crm_pricing_version_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER crm_pricing_version_guard BEFORE INSERT OR UPDATE ON public.crm_solicitudes_pricing
  FOR EACH ROW EXECUTE FUNCTION public._crm_pricing_version_guard();

CREATE OR REPLACE FUNCTION public.crm_pricing_recotizar(p_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; v_motivo text := nullif(trim(coalesce(p_motivo, '')), ''); v_horas int;
BEGIN
  SELECT * INTO v FROM crm_solicitudes_pricing WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF v.id IS NULL OR v.organization_id IS DISTINCT FROM org_scope() THEN
    RAISE EXCEPTION 'LC_PRICING_NO_ENCONTRADA' USING ERRCODE = 'P0001';
  END IF;
  IF NOT _crm_es_pricing(v.organization_id) THEN RAISE EXCEPTION 'LC_PRICING_SIN_PERMISO' USING ERRCODE = '42501'; END IF;
  IF v.estado <> 'respondida' THEN RAISE EXCEPTION 'LC_PRICING_ESTADO_INVALIDO' USING ERRCODE = 'P0001'; END IF;
  IF length(coalesce(v_motivo, '')) < 5 THEN RAISE EXCEPTION 'LC_PRICING_MOTIVO_REQUERIDO' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO crm_pricing_opciones_versiones (organization_id, solicitud_id, version, motivo, opciones, tarifas, respondida_at, created_by)
  VALUES (v.organization_id, v.id, v.version, v_motivo,
    coalesce((SELECT jsonb_agg(to_jsonb(o) - 'organization_id' ORDER BY o.orden, o.created_at)
              FROM crm_pricing_opciones o WHERE o.solicitud_id = v.id), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'modo', t.modo, 'moneda', t.moneda,
                'vigencia_inicio', t.vigencia_inicio, 'vigencia_fin', t.vigencia_fin) ORDER BY t.created_at)
              FROM costeo_tarifas t WHERE t.solicitud_pricing_id = v.id
                 OR t.id = v.tarifa_tarifario_id), '[]'::jsonb),
    v.respondida_at, auth.uid());

  v_horas := _crm_pricing_horas_modo(v.complejidad, v.servicio);
  PERFORM set_config('lc.pricing_rpc', '1', true);
  UPDATE crm_solicitudes_pricing SET estado = 'en_proceso', version = v.version + 1, recotizada_at = now(),
    respondida_at = NULL, pausada_at = NULL, aviso_80_at = NULL, aviso_vencida_at = NULL,
    asignada_a = coalesce(asignada_a, auth.uid()),
    vence_at = CASE WHEN v_horas IS NULL THEN NULL ELSE _crm_pricing_sumar_horas_habiles(now(), v_horas) END
  WHERE id = p_id;
  PERFORM set_config('lc.pricing_rpc', '', true);
  PERFORM _crm_pricing_avisar_cambio(v.organization_id, v.id, v.solicitante_id, 'Pricing recotiza ' || v.folio,
    'Versión ' || (v.version + 1) || ' en proceso: ' || v_motivo);
  RETURN jsonb_build_object('id', v.id, 'version', v.version + 1);
END $$;
REVOKE ALL ON FUNCTION public.crm_pricing_recotizar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_pricing_recotizar(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_pricing_costo_vs_real(p_solicitud_ids uuid[])
RETURNS TABLE (solicitud_id uuid, cotizacion_id uuid, cotizacion_folio text, embarque_id uuid,
  expediente text, moneda text, costo_cotizado numeric, costo_real numeric, facturas integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  WITH cot AS (
    SELECT c.id, c.folio, c.pricing_solicitud_id FROM cotizaciones c
    WHERE c.pricing_solicitud_id = ANY (coalesce(p_solicitud_ids, '{}')) AND c.deleted_at IS NULL
      AND c.estado::text <> 'Archivada' AND c.organization_id = org_scope()
  ), emb AS (
    SELECT DISTINCT ON (cot.id) cot.*, e.id AS embarque_id, e.expediente
    FROM cot LEFT JOIN embarques e ON e.cotizacion_id = cot.id AND e.deleted_at IS NULL
      AND e.estado::text NOT IN ('Cancelado') AND e.organization_id = org_scope()
    ORDER BY cot.id, e.created_at DESC
  ), costo AS (
    SELECT cc.cotizacion_id, cc.moneda, round(sum(cc.costo_total), 2) AS monto
    FROM cotizacion_costos cc JOIN emb ON emb.id = cc.cotizacion_id
    WHERE cc.deleted_at IS NULL GROUP BY 1, 2
  ), facturado AS (
    SELECT f.embarque_id, f.moneda::text AS moneda, round(sum(f.subtotal), 2) AS monto, count(*)::int AS n
    FROM proveedor_facturas f JOIN emb ON emb.embarque_id = f.embarque_id
    WHERE f.deleted_at IS NULL AND f.estado::text IN ('Vigente','Pagada') GROUP BY 1, 2
  ), monedas AS (
    SELECT emb.id, costo.moneda FROM emb JOIN costo ON costo.cotizacion_id = emb.id
    UNION SELECT emb.id, facturado.moneda FROM emb JOIN facturado ON facturado.embarque_id = emb.embarque_id
  )
  SELECT emb.pricing_solicitud_id, emb.id, emb.folio, emb.embarque_id, emb.expediente, m.moneda,
    coalesce(costo.monto, 0), coalesce(fa.monto, 0), coalesce(fa.n, 0)
  FROM emb LEFT JOIN monedas m ON m.id = emb.id
  LEFT JOIN costo ON costo.cotizacion_id = emb.id AND costo.moneda = m.moneda
  LEFT JOIN facturado fa ON fa.embarque_id = emb.embarque_id AND fa.moneda = m.moneda
  ORDER BY emb.pricing_solicitud_id, emb.folio, m.moneda;
$$;
REVOKE ALL ON FUNCTION public.crm_pricing_costo_vs_real(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_pricing_costo_vs_real(uuid[]) TO authenticated, service_role;