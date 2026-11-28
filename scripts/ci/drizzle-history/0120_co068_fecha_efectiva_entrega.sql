-- CO-068. La fecha efectiva vive en un historial separado del evento de tracking.
CREATE TABLE public.embarque_fechas_entrega (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  embarque_id uuid NOT NULL REFERENCES public.embarques(id),
  fecha_anterior date,
  fecha_propuesta date NOT NULL,
  motivo text NOT NULL,
  documento_id uuid REFERENCES public.documentos_embarque(id),
  documento_nombre text,
  documento_archivo text,
  solicitado_por uuid NOT NULL,
  solicitado_en timestamptz NOT NULL DEFAULT now(),
  estado text NOT NULL CHECK (estado IN ('pendiente','aprobada','rechazada')),
  resuelto_por uuid,
  resuelto_en timestamptz,
  motivo_resolucion text
);
ALTER TABLE public.embarque_fechas_entrega ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.embarque_fechas_entrega FROM PUBLIC, anon, authenticated;
CREATE POLICY entrega_organizacion_activa ON public.embarque_fechas_entrega
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.rls_tenant_scope_ok(organization_id)) WITH CHECK (public.rls_tenant_scope_ok(organization_id));
CREATE INDEX embarque_fechas_entrega_historial
  ON public.embarque_fechas_entrega (embarque_id, solicitado_en DESC, id);
CREATE INDEX embarque_fechas_entrega_vigente
  ON public.embarque_fechas_entrega (embarque_id, resuelto_en DESC, id DESC)
  WHERE estado = 'aprobada';
CREATE UNIQUE INDEX embarque_fechas_entrega_pendiente
  ON public.embarque_fechas_entrega (embarque_id) WHERE estado = 'pendiente';

CREATE OR REPLACE FUNCTION public._fecha_entrega_efectiva(p_embarque uuid, p_org uuid)
RETURNS date LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT fecha_propuesta FROM public.embarque_fechas_entrega
  WHERE embarque_id=p_embarque AND organization_id=p_org AND estado='aprobada'
  ORDER BY resuelto_en DESC, id DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._fecha_entrega_efectiva(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._validar_fecha_entrega(p_fecha date, p_llegada date)
RETURNS void LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
BEGIN
  IF p_fecha IS NULL OR p_fecha > public.fecha_negocio_mx()
     OR p_fecha < p_llegada OR NOT isfinite(p_fecha) THEN
    RAISE EXCEPTION 'Captura una fecha efectiva válida, entre la llegada real y el día de negocio.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._validar_fecha_entrega(date,date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.entregar_embarque_con_fecha(
  p_embarque uuid, p_fecha date, p_tipo_evento text, p_descripcion_evento text, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := public.org_scope();
  v_uid uuid := auth.uid();
  v_emb public.embarques;
  v_res jsonb;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona una organización activa.' USING ERRCODE='42501';
  END IF;
  PERFORM public._assert_writer(v_org);
  SELECT * INTO STRICT v_emb FROM public.embarques
    WHERE id=p_embarque AND organization_id=v_org AND deleted_at IS NULL FOR UPDATE;
  IF EXISTS (SELECT FROM public.embarque_fechas_entrega WHERE id=p_request_id AND embarque_id=p_embarque
    AND organization_id=v_org AND solicitado_por=v_uid AND documento_id IS NULL AND fecha_propuesta=p_fecha) THEN
    RETURN jsonb_build_object('id',p_embarque,'estado','Entregado','expediente',v_emb.expediente,'replay',true);
  END IF;
  PERFORM public._validar_fecha_entrega(p_fecha,v_emb.fecha_llegada_real);
  IF v_emb.estado IN ('Entregado','EIR','Por liquidar','Cerrado') OR
     public._fecha_entrega_efectiva(p_embarque,v_org) IS NOT NULL THEN
    RAISE EXCEPTION 'La entrega ya tiene fecha. Usa la solicitud de corrección.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cierre-contable:' || v_org::text,0));
  IF p_fecha <= public.cierre_periodo_fecha(v_org) THEN
    RAISE EXCEPTION 'Contabilidad debe reabrir el periodo de la fecha efectiva.';
  END IF;
  v_res := public.avanzar_estado_embarque(p_embarque,'Entregado','',p_tipo_evento,p_descripcion_evento,p_request_id);
  IF NOT (v_res ? '__idempotency_pending') AND NOT COALESCE((v_res->>'replay')::boolean,false) THEN
    INSERT INTO public.embarque_fechas_entrega
      (id,organization_id,embarque_id,fecha_propuesta,motivo,solicitado_por,estado,resuelto_por,resuelto_en)
      VALUES (p_request_id,v_org,p_embarque,p_fecha,'Confirmación de entrega',v_uid,'aprobada',v_uid,now());
  END IF;
  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.entregar_embarque_con_fecha(uuid,date,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entregar_embarque_con_fecha(uuid,date,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.historial_fecha_entrega(p_embarque uuid)
RETURNS TABLE(id uuid,fecha_anterior date,fecha_propuesta date,motivo text,documento_nombre text,
  estado text,solicitante text,solicitado_en timestamptz,responsable text,resuelto_en timestamptz,motivo_resolucion text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org uuid := public.org_scope();
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT FROM public.embarques e WHERE e.id=p_embarque AND e.organization_id=v_org AND e.deleted_at IS NULL
  ) OR NOT (public.has_role(auth.uid(),'super_admin') OR EXISTS (
    SELECT FROM public.organization_members m WHERE m.organization_id=v_org AND m.user_id=auth.uid()
      AND m.role IN ('coordinador_logistico','gerente_operaciones','admin','admin_org','contador','gerente_visor')
  )) THEN
    RAISE EXCEPTION 'Historial de entrega no disponible.' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT h.id,h.fecha_anterior,h.fecha_propuesta,h.motivo,h.documento_nombre,h.estado,
    COALESCE(s.email,h.solicitado_por::text)::text,h.solicitado_en,
    COALESCE(r.email,h.resuelto_por::text)::text,h.resuelto_en,h.motivo_resolucion
    FROM public.embarque_fechas_entrega h
    LEFT JOIN auth.users s ON s.id=h.solicitado_por
    LEFT JOIN auth.users r ON r.id=h.resuelto_por
    WHERE h.organization_id=v_org AND h.embarque_id=p_embarque ORDER BY h.solicitado_en DESC,h.id DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.historial_fecha_entrega(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.historial_fecha_entrega(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.solicitar_fecha_entrega(
  p_embarque uuid, p_fecha date, p_motivo text, p_documento uuid, p_request_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := public.org_scope();
  v_uid uuid := auth.uid();
  v_emb public.embarques;
  v_doc text;
  v_archivo text;
  v_fecha date;
BEGIN
  IF NOT public.has_org_role(v_uid,v_org,'coordinador_logistico') THEN
    RAISE EXCEPTION 'Solo Coordinación Logística puede solicitar la corrección.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT v_emb FROM public.embarques
    WHERE id=p_embarque AND organization_id=v_org AND deleted_at IS NULL FOR UPDATE;
  IF EXISTS (SELECT FROM public.embarque_fechas_entrega WHERE id=p_request_id AND organization_id=v_org
      AND embarque_id=p_embarque AND solicitado_por=v_uid AND fecha_propuesta=p_fecha
      AND documento_id=p_documento AND motivo=btrim(p_motivo)) THEN RETURN p_request_id; END IF;
  IF v_emb.estado NOT IN ('Entregado','EIR','Por liquidar','Cerrado') THEN
    RAISE EXCEPTION 'Primero registra la entrega del embarque.';
  END IF;
  PERFORM public._validar_fecha_entrega(p_fecha,v_emb.fecha_llegada_real);
  v_fecha := public._fecha_entrega_efectiva(p_embarque,v_org);
  IF p_fecha IS NOT DISTINCT FROM v_fecha OR length(btrim(COALESCE(p_motivo,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Propón una fecha distinta y escribe un motivo de 10 a 1000 caracteres.';
  END IF;
  SELECT nombre,archivo INTO v_doc,v_archivo FROM public.documentos_embarque WHERE id=p_documento
    AND organization_id=v_org AND embarque_id=p_embarque AND deleted_at IS NULL
    AND NULLIF(btrim(archivo),'') IS NOT NULL;
  IF v_doc IS NULL THEN RAISE EXCEPTION 'Selecciona un documento adjunto del expediente.'; END IF;
  IF EXISTS (SELECT FROM public.embarque_fechas_entrega WHERE embarque_id=p_embarque AND estado='pendiente') THEN
    RAISE EXCEPTION 'El embarque ya tiene una solicitud pendiente.';
  END IF;
  INSERT INTO public.embarque_fechas_entrega
    (id,organization_id,embarque_id,fecha_anterior,fecha_propuesta,motivo,documento_id,documento_nombre,documento_archivo,solicitado_por,estado)
    VALUES (p_request_id,v_org,p_embarque,v_fecha,p_fecha,btrim(p_motivo),p_documento,v_doc,v_archivo,v_uid,'pendiente');
  RETURN p_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.solicitar_fecha_entrega(uuid,date,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_fecha_entrega(uuid,date,text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolver_fecha_entrega(p_solicitud uuid,p_aprobar boolean,p_motivo text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := public.org_scope();
  v_uid uuid := auth.uid();
  v_row public.embarque_fechas_entrega;
  v_emb public.embarques;
  v_cierre date;
BEGIN
  IF NOT public.has_org_role(v_uid,v_org,'gerente_operaciones') THEN
    RAISE EXCEPTION 'Solo Gerencia de Operaciones puede resolver la corrección.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT v_row FROM public.embarque_fechas_entrega
    WHERE id=p_solicitud AND organization_id=v_org AND documento_id IS NOT NULL;
  SELECT * INTO STRICT v_emb FROM public.embarques
    WHERE id=v_row.embarque_id AND organization_id=v_org AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO STRICT v_row FROM public.embarque_fechas_entrega WHERE id=p_solicitud FOR UPDATE;
  IF v_row.estado <> 'pendiente' THEN RETURN v_row.estado; END IF;
  IF v_uid = v_row.solicitado_por OR p_aprobar IS NULL OR length(btrim(COALESCE(p_motivo,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'La resolución requiere otro responsable y un motivo de 10 a 1000 caracteres.';
  END IF;
  IF p_aprobar THEN
    IF v_emb.estado NOT IN ('Entregado','EIR','Por liquidar','Cerrado') OR
      public._fecha_entrega_efectiva(v_emb.id,v_org) IS DISTINCT FROM v_row.fecha_anterior THEN
      RAISE EXCEPTION 'La entrega cambió. Rechaza esta solicitud y pide una nueva revisión.';
    END IF;
    PERFORM public._validar_fecha_entrega(v_row.fecha_propuesta,v_emb.fecha_llegada_real);
    IF NOT EXISTS (SELECT FROM public.documentos_embarque WHERE id=v_row.documento_id
      AND embarque_id=v_emb.id AND organization_id=v_org AND deleted_at IS NULL
      AND archivo=v_row.documento_archivo) THEN RAISE EXCEPTION 'La evidencia cambió. Rechaza esta solicitud y pide una nueva revisión.'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('cierre-contable:' || v_org::text,0));
    v_cierre := public.cierre_periodo_fecha(v_org);
    IF v_row.fecha_propuesta <= v_cierre OR v_row.fecha_anterior <= v_cierre THEN
      RAISE EXCEPTION 'Contabilidad debe reabrir los periodos afectados antes de aprobar.';
    END IF;
  END IF;
  UPDATE public.embarque_fechas_entrega SET estado=CASE WHEN p_aprobar THEN 'aprobada' ELSE 'rechazada' END,
    resuelto_por=v_uid,resuelto_en=clock_timestamp(),motivo_resolucion=btrim(p_motivo)
    WHERE id=p_solicitud RETURNING estado INTO v_row.estado;
  RETURN v_row.estado;
END;
$$;
REVOKE ALL ON FUNCTION public.resolver_fecha_entrega(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_fecha_entrega(uuid,boolean,text) TO authenticated;

-- Financial authorization at the SECURITY DEFINER entry point.
-- Preserve signature, volatility, owner, ACL and all financial expressions.
CREATE OR REPLACE FUNCTION public.profit_por_cliente(_fecha_desde date DEFAULT NULL::date, _fecha_hasta date DEFAULT NULL::date, _modo text DEFAULT NULL::text, _cliente_id uuid DEFAULT NULL::uuid) RETURNS TABLE(cliente_id uuid, cliente_nombre text, total_embarques bigint, venta_usd numeric, costo_usd numeric, venta_mxn numeric, costo_mxn numeric, embarques_sin_tc bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid := public.org_scope();
  v_global_role text;
  v_org_role text;
  v_effective_role text;
BEGIN
  -- No new service bypass: the existing no-UID/no-scope call remains empty.
  IF v_uid IS NULL THEN
    IF current_setting('role', true) = 'service_role' AND v_org IS NULL THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'LC_PROFIT_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Exact global role, with the existing get_user_context priority. Do not use
  -- has_role: its hierarchy must not add roles to this financial allowlist.
  SELECT ur.role::text INTO v_global_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_uid
  ORDER BY CASE ur.role::text
    WHEN 'super_admin' THEN 1 WHEN 'admin_org' THEN 2 WHEN 'admin' THEN 3
    WHEN 'gerente_operaciones' THEN 4 WHEN 'contador' THEN 5 WHEN 'tesorero' THEN 6
    WHEN 'ejecutivo_pricing' THEN 7 WHEN 'coordinador_logistico' THEN 8
    WHEN 'operador' THEN 9 WHEN 'vendedor' THEN 10 WHEN 'customer_service' THEN 11
    WHEN 'viewer' THEN 12 WHEN 'cliente' THEN 13 ELSE 99
  END, ur.role::text
  LIMIT 1;

  IF v_global_role = 'super_admin' THEN
    -- A platform role is never a cross-tenant financial scope.
    IF v_org IS NULL THEN
      RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.organizations o
                   WHERE o.id = v_org AND o.activo IS TRUE) THEN
      RAISE EXCEPTION 'LC_PROFIT_ORG_REQUIRED' USING ERRCODE = '42501';
    END IF;
    v_effective_role := v_global_role;
  ELSE
    -- Membership has no active/status column. Present membership in an active
    -- organization is required; a global role cannot revive a missing member.
    SELECT om.role::text INTO v_org_role
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.user_id = v_uid AND om.organization_id = v_org
      AND o.activo IS TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'LC_PROFIT_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
    END IF;
    -- Match UI precedence only inside this tenant. A legacy tenant super_admin
    -- is not a platform grant; NULL is defensive (role is currently NOT NULL).
    v_effective_role := COALESCE(NULLIF(v_org_role, 'super_admin'), v_global_role);
  END IF;

  IF v_effective_role IS NULL OR NOT (v_effective_role = ANY (ARRAY[
    'admin', 'admin_org', 'super_admin', 'ejecutivo_pricing', 'contador',
    'tesorero', 'gerente_operaciones', 'gerente_comercial', 'gerente_visor',
    'auxiliar_contable'
  ]::text[])) THEN
    RAISE EXCEPTION 'LC_PROFIT_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      e.id,
      e.cliente_id,
      e.cliente_nombre,
      COALESCE(
        NULLIF(e.tipo_cambio_usd, 0),
        (SELECT d.usd_mxn FROM public.tc_dof_vigente(COALESCE(e.eta, e.etd, e.created_at::date)) d)
      ) AS tc_usd,
      COALESCE(
        NULLIF(e.tipo_cambio_eur, 0),
        (SELECT d.eur_mxn FROM public.tc_dof_vigente(COALESCE(e.eta, e.etd, e.created_at::date)) d)
      ) AS tc_eur
    FROM public.embarques e
    CROSS JOIN LATERAL (SELECT public._fecha_entrega_efectiva(e.id,e.organization_id) AS fecha) entrega
    WHERE e.deleted_at IS NULL
      -- AUD-ANALISIS-1: alineado con Utilidad/Tablero/Cierre.
      AND e.estado NOT IN ('Cotización'::estado_embarque, 'Borrador'::estado_embarque, 'Cancelado'::estado_embarque)
      AND (_fecha_desde IS NULL OR entrega.fecha >= _fecha_desde)
      AND (_fecha_hasta IS NULL OR entrega.fecha <= _fecha_hasta)
      AND (_modo IS NULL OR e.modo::text = _modo)
      AND (_cliente_id IS NULL OR e.cliente_id = _cliente_id)
      AND (e.organization_id = v_org)
  ),
  ventas AS (
    SELECT v.embarque_id, SUM(v.venta_mxn) AS venta_mxn,
      COUNT(*) FILTER (WHERE v.venta_mxn IS NULL) AS venta_sin_tc
    FROM public._venta_facturada_por_embarque(v_org) v
    JOIN base b ON b.id = v.embarque_id
    GROUP BY v.embarque_id
  ),
  ncs AS (SELECT NULL::uuid AS embarque_id, 0::numeric AS nc_mxn WHERE false),
  costos AS (
    SELECT
      cc.embarque_id,
      SUM(public.a_mxn(cc.monto, cc.moneda::text, b.tc_usd, b.tc_eur)) AS costo_mxn,
      COUNT(*) FILTER (
        WHERE public.a_mxn(cc.monto, cc.moneda::text, b.tc_usd, b.tc_eur) IS NULL
      ) AS costo_sin_tc
    FROM public.conceptos_costo cc
    JOIN base b ON b.id = cc.embarque_id
    WHERE cc.deleted_at IS NULL
    GROUP BY cc.embarque_id
  ),
  neto AS (
    SELECT
      b.id, b.cliente_id, b.cliente_nombre, b.tc_usd,
      GREATEST(COALESCE(v.venta_mxn, 0) - COALESCE(nc.nc_mxn, 0), 0) AS venta_mxn,
      COALESCE(c.costo_mxn, 0) AS costo_mxn,
      COALESCE(v.venta_sin_tc, 0) AS venta_sin_tc,
      COALESCE(c.costo_sin_tc, 0) AS costo_sin_tc
    FROM base b
    LEFT JOIN ventas v ON v.embarque_id = b.id
    LEFT JOIN costos c ON c.embarque_id = b.id
    LEFT JOIN ncs   nc ON nc.embarque_id = b.id
  )
  SELECT
    n.cliente_id,
    MAX(n.cliente_nombre) AS cliente_nombre,
    COUNT(DISTINCT n.id) AS total_embarques,
    COALESCE(SUM(CASE WHEN COALESCE(n.tc_usd, 0) > 0 THEN round(n.venta_mxn / n.tc_usd, 4) END), 0) AS venta_usd,
    COALESCE(SUM(CASE WHEN COALESCE(n.tc_usd, 0) > 0 THEN round(n.costo_mxn / n.tc_usd, 4) END), 0) AS costo_usd,
    COALESCE(SUM(n.venta_mxn), 0) AS venta_mxn,
    COALESCE(SUM(n.costo_mxn), 0) AS costo_mxn,
    COUNT(DISTINCT n.id) FILTER (
      WHERE COALESCE(n.tc_usd, 0) <= 0 OR n.venta_sin_tc > 0 OR n.costo_sin_tc > 0
    ) AS embarques_sin_tc
  FROM neto n
  GROUP BY n.cliente_id;
END;
$$;

-- Reassert exactly the catalog verified above, without expanding access.
REVOKE ALL ON FUNCTION public.profit_por_cliente(date, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profit_por_cliente(date, date, text, uuid) TO authenticated, service_role;
