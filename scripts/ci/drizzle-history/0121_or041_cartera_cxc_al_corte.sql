-- OR-041. Apertura prospectiva y versiones por documento, con fecha efectiva y de registro.
CREATE TABLE public.cxc_aperturas (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  desde date NOT NULL,
  conciliado_por uuid NOT NULL,
  conciliado_en timestamptz NOT NULL DEFAULT now(),
  evidencia text NOT NULL
);
CREATE TABLE public.cxc_versiones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.cxc_aperturas(organization_id),
  fuente text NOT NULL CHECK (fuente IN ('facturas','pagos_factura','factura_notas_credito','refacturaciones')),
  fuente_id uuid NOT NULL,
  factura_id uuid NOT NULL,
  fecha_efectiva date NOT NULL,
  registrada_en timestamptz NOT NULL DEFAULT now(),
  datos jsonb
);
CREATE INDEX cxc_versiones_lectura ON public.cxc_versiones
  (organization_id,fuente,fuente_id,id DESC) INCLUDE (fecha_efectiva);
CREATE TABLE public.cxc_cortes (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.cxc_aperturas(organization_id),
  fecha date NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  conciliado_por uuid NOT NULL,
  conciliado_en timestamptz NOT NULL DEFAULT now(),
  evidencia text NOT NULL,
  fingerprint text NOT NULL,
  datos jsonb NOT NULL,
  reabierto_en timestamptz,
  UNIQUE (organization_id,fecha,revision)
);
CREATE UNIQUE INDEX cxc_corte_certificado ON public.cxc_cortes
  (organization_id,fecha) WHERE reabierto_en IS NULL;
ALTER TABLE public.cxc_aperturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cxc_versiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cxc_cortes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cxc_aperturas, public.cxc_versiones, public.cxc_cortes FROM PUBLIC, anon, authenticated;
CREATE POLICY cxc_apertura_organizacion_activa ON public.cxc_aperturas
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.rls_tenant_scope_ok(organization_id)) WITH CHECK (public.rls_tenant_scope_ok(organization_id));
CREATE POLICY cxc_version_organizacion_activa ON public.cxc_versiones
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.rls_tenant_scope_ok(organization_id)) WITH CHECK (public.rls_tenant_scope_ok(organization_id));
CREATE POLICY cxc_corte_organizacion_activa ON public.cxc_cortes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.rls_tenant_scope_ok(organization_id)) WITH CHECK (public.rls_tenant_scope_ok(organization_id));

CREATE OR REPLACE FUNCTION public._cxc_dato_fuente(p_fuente text,p_dato jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
BEGIN
  IF p_dato IS NULL OR p_dato->>'deleted_at' IS NOT NULL THEN RETURN NULL; END IF;
  CASE p_fuente
    WHEN 'facturas' THEN
      IF p_dato->>'estado' NOT IN ('Emitida','Parcialmente pagada','Vencida','Pagada')
        OR COALESCE(p_dato->>'cancellation_status','none') IN ('pending','verifying','accepted')
        OR p_dato->>'sustituida_por' IS NOT NULL THEN RETURN NULL; END IF;
      RETURN jsonb_build_object('total',p_dato->'total','moneda',p_dato->'moneda','tc',p_dato->'tipo_cambio',
        'emision',p_dato->'fecha_emision','vencimiento',p_dato->'fecha_vencimiento',
        'folio',p_dato->'numero','cliente',p_dato->'cliente_nombre','embarque',p_dato->'embarque_id');
    WHEN 'pagos_factura' THEN
      IF public.pago_rep_anulado(p_dato->>'estado_rep') THEN RETURN NULL; END IF;
      RETURN jsonb_build_object('monto',p_dato->'monto_aplicado_factura','fecha',p_dato->'fecha_pago');
    WHEN 'factura_notas_credito' THEN
      IF p_dato->>'estado' NOT IN ('Timbrada','Aplicada') THEN RETURN NULL; END IF;
      RETURN jsonb_build_object('monto',p_dato->'monto','moneda',p_dato->'moneda',
        'tc',p_dato->'tipo_cambio','fecha',p_dato->'fecha_emision');
    WHEN 'refacturaciones' THEN
      IF p_dato->>'estado' = 'completado' THEN
        RETURN jsonb_build_object('fecha',(COALESCE((p_dato->>'cerrado_at')::timestamptz,now()) AT TIME ZONE 'America/Mexico_City')::date);
      END IF;
      RETURN NULL;
    ELSE RAISE EXCEPTION 'Fuente de CxC desconocida.';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public._cxc_fecha_fuente(p_fuente text,p_dato jsonb)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT (CASE WHEN p_fuente='facturas' THEN p_dato->>'emision' ELSE p_dato->>'fecha' END)::date;
$$;

CREATE OR REPLACE FUNCTION public._cxc_serializar_escritura() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org uuid := CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
BEGIN
  IF EXISTS (SELECT FROM public.cxc_aperturas WHERE organization_id=v_org) THEN
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('cierre-contable:' || v_org::text,0));
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
-- Debe adquirir el candado antes de los triggers de validación de periodo.
CREATE TRIGGER a000_cxc_cierre_facturas BEFORE INSERT OR UPDATE OR DELETE ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public._cxc_serializar_escritura();
CREATE TRIGGER a000_cxc_cierre_pagos BEFORE INSERT OR UPDATE OR DELETE ON public.pagos_factura
  FOR EACH ROW EXECUTE FUNCTION public._cxc_serializar_escritura();
CREATE TRIGGER a000_cxc_cierre_nc BEFORE INSERT OR UPDATE OR DELETE ON public.factura_notas_credito
  FOR EACH ROW EXECUTE FUNCTION public._cxc_serializar_escritura();
CREATE TRIGGER a000_cxc_cierre_refacturaciones BEFORE INSERT OR UPDATE OR DELETE ON public.refacturaciones
  FOR EACH ROW EXECUTE FUNCTION public._cxc_serializar_escritura();

CREATE OR REPLACE FUNCTION public._cxc_capturar_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_antes jsonb;
  v_despues jsonb;
  v_org uuid;
  v_id uuid;
  v_fac uuid;
  v_desde date;
  v_fecha date;
  v_fecha_anterior date;
  v_inicio date;
  v_alta_previa boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  v_row := COALESCE(v_new,v_old);
  v_org := (v_row->>'organization_id')::uuid;
  v_id := (v_row->>'id')::uuid;
  v_fac := CASE TG_TABLE_NAME WHEN 'facturas' THEN v_id
    WHEN 'refacturaciones' THEN (v_row->>'factura_original_id')::uuid ELSE (v_row->>'factura_id')::uuid END;
  v_antes := public._cxc_dato_fuente(TG_TABLE_NAME,v_old);
  v_despues := public._cxc_dato_fuente(TG_TABLE_NAME,v_new);
  IF (v_old IS NOT NULL AND v_new IS NOT NULL) AND
    (v_old->>'organization_id') IS DISTINCT FROM (v_new->>'organization_id') THEN
    IF EXISTS (SELECT FROM public.cxc_aperturas WHERE organization_id IN
      (v_org,(v_old->>'organization_id')::uuid)) THEN
      RAISE EXCEPTION 'Registra un reverso y una nueva aplicación para mover el documento.';
    END IF;
  END IF;
  IF v_antes IS NOT DISTINCT FROM v_despues
    AND (v_old->>'factura_id') IS NOT DISTINCT FROM (v_new->>'factura_id')
    AND (v_old->>'factura_original_id') IS NOT DISTINCT FROM (v_new->>'factura_original_id')
    THEN RETURN NULL; END IF;
  IF v_antes IS NULL AND v_despues IS NULL THEN RETURN NULL; END IF;
  SELECT desde INTO v_desde FROM public.cxc_aperturas WHERE organization_id=v_org;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_fecha_anterior := GREATEST(v_desde, public._cxc_fecha_fuente(TG_TABLE_NAME,v_antes));
  v_fecha := GREATEST(v_desde, public._cxc_fecha_fuente(TG_TABLE_NAME,v_despues));
  SELECT (datos->>'reinicio')::date INTO v_inicio FROM public.cxc_versiones
    WHERE organization_id=v_org AND fuente=TG_TABLE_NAME AND fuente_id=v_id AND datos IS NOT NULL
    ORDER BY id DESC LIMIT 1;
  v_alta_previa := FOUND;

  IF v_despues IS NULL THEN
    v_fecha := GREATEST(v_fecha_anterior,v_inicio,public.fecha_negocio_mx());
  ELSIF v_antes IS NULL AND v_alta_previa THEN
    v_fecha := GREATEST(v_fecha, public.fecha_negocio_mx());
    v_inicio := v_fecha;
  ELSIF v_antes IS NOT NULL THEN
    -- Tras reactivar, el nuevo estado se aplica a partir de la reactivación.
    v_fecha := GREATEST(v_fecha,v_inicio);
    v_fecha_anterior := GREATEST(v_fecha_anterior,v_inicio);
    IF v_fecha > v_fecha_anterior THEN
      INSERT INTO public.cxc_versiones(organization_id,fuente,fuente_id,factura_id,fecha_efectiva,datos)
      VALUES(v_org,TG_TABLE_NAME,v_id,v_fac,v_fecha_anterior,NULL);
    END IF;
  END IF;

  IF v_despues IS NOT NULL AND v_inicio IS NOT NULL THEN
    v_despues := v_despues || jsonb_build_object('reinicio',v_inicio);
  END IF;
  INSERT INTO public.cxc_versiones(organization_id,fuente,fuente_id,factura_id,fecha_efectiva,datos)
  VALUES(v_org,TG_TABLE_NAME,v_id,v_fac,v_fecha,v_despues);
  RETURN NULL;
END;
$$;

CREATE TRIGGER cxc_version_facturas AFTER INSERT OR UPDATE OR DELETE ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public._cxc_capturar_version();
CREATE TRIGGER cxc_version_pagos AFTER INSERT OR UPDATE OR DELETE ON public.pagos_factura
  FOR EACH ROW EXECUTE FUNCTION public._cxc_capturar_version();
CREATE TRIGGER cxc_version_nc AFTER INSERT OR UPDATE OR DELETE ON public.factura_notas_credito
  FOR EACH ROW EXECUTE FUNCTION public._cxc_capturar_version();
CREATE TRIGGER cxc_version_refacturaciones AFTER INSERT OR UPDATE OR DELETE ON public.refacturaciones
  FOR EACH ROW EXECUTE FUNCTION public._cxc_capturar_version();

CREATE OR REPLACE FUNCTION public._cxc_org_contador(p_org uuid) RETURNS uuid LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org uuid := public.org_scope();
BEGIN
  IF p_org IS NULL OR p_org IS DISTINCT FROM v_org OR NOT public.has_org_role(auth.uid(), v_org, 'contador') THEN
    RAISE EXCEPTION 'Solo Contabilidad puede certificar un corte de la organización activa.' USING ERRCODE='42501';
  END IF;
  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION public.activar_historial_cxc(p_org uuid,p_evidencia text) RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := public._cxc_org_contador(p_org);
  v_hoy date := public.fecha_negocio_mx();
  v_anterior date;
BEGIN
  IF length(btrim(COALESCE(p_evidencia,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Registra la referencia de la apertura conciliada.';
  END IF;
  -- La apertura debe incluir todas las escrituras previas y entregar las posteriores al journal.
  LOCK TABLE public.facturas, public.pagos_factura, public.factura_notas_credito, public.refacturaciones IN SHARE MODE;
  PERFORM pg_advisory_xact_lock(hashtextextended('cierre-contable:' || v_org::text,0));
  SELECT desde INTO v_anterior FROM public.cxc_aperturas WHERE organization_id=v_org;
  IF FOUND THEN RETURN v_anterior; END IF;
  INSERT INTO public.cxc_aperturas VALUES (v_org,v_hoy,auth.uid(),now(),btrim(p_evidencia));
  INSERT INTO public.cxc_versiones(organization_id,fuente,fuente_id,factura_id,fecha_efectiva,datos)
  SELECT v_org, q.fuente, q.id, q.factura_id, GREATEST(v_hoy,public._cxc_fecha_fuente(q.fuente,d.dato)), d.dato
  FROM (
    SELECT 'facturas' AS fuente,t.id,t.id AS factura_id,to_jsonb(t) AS fila FROM public.facturas t WHERE t.organization_id=v_org
    UNION ALL SELECT 'pagos_factura',t.id,t.factura_id,to_jsonb(t) FROM public.pagos_factura t WHERE t.organization_id=v_org
    UNION ALL SELECT 'factura_notas_credito',t.id,t.factura_id,to_jsonb(t) FROM public.factura_notas_credito t WHERE t.organization_id=v_org
    UNION ALL SELECT 'refacturaciones',t.id,t.factura_original_id,to_jsonb(t) FROM public.refacturaciones t WHERE t.organization_id=v_org
  ) q CROSS JOIN LATERAL (SELECT public._cxc_dato_fuente(q.fuente,q.fila) AS dato) d
  WHERE d.dato IS NOT NULL;
  RETURN v_hoy;
END;
$$;

CREATE OR REPLACE FUNCTION public._cxc_filas_al_corte(p_org uuid,p_fecha date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH vigentes AS MATERIALIZED (
    SELECT DISTINCT ON (fuente,fuente_id) fuente,fuente_id,factura_id,datos
    FROM public.cxc_versiones
    WHERE organization_id=p_org AND fecha_efectiva<=p_fecha
    ORDER BY fuente,fuente_id,id DESC
  ), saldos AS (
    SELECT f.factura_id,f.datos,
      GREATEST((f.datos->>'total')::numeric - COALESCE(SUM(
        CASE a.fuente
          WHEN 'pagos_factura' THEN (a.datos->>'monto')::numeric
          WHEN 'factura_notas_credito' THEN public.nc_convertida_a_moneda_factura(
            (a.datos->>'monto')::numeric,a.datos->>'moneda',(a.datos->>'tc')::numeric,
            f.datos->>'moneda',(f.datos->>'tc')::numeric)
        END
      ),0),0) AS saldo
    FROM vigentes f
    LEFT JOIN vigentes a ON a.factura_id=f.factura_id AND a.fuente IN ('pagos_factura','factura_notas_credito')
      AND a.datos IS NOT NULL
    WHERE f.fuente='facturas' AND f.datos IS NOT NULL
      AND NOT EXISTS (SELECT FROM vigentes s WHERE s.fuente='refacturaciones'
        AND s.factura_id=f.factura_id AND s.datos IS NOT NULL)
    GROUP BY f.factura_id,f.datos
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',s.factura_id,'folio',s.datos->>'folio','contraparte',s.datos->>'cliente',
    'moneda',s.datos->>'moneda','saldo',round(s.saldo,2),'fechaEmision',s.datos->>'emision',
    'fechaVencimiento',s.datos->>'vencimiento','tipoCambio',s.datos->'tc',
    'expediente',COALESCE(e.expediente,'')) ORDER BY s.factura_id),'[]'::jsonb)
  FROM saldos s LEFT JOIN public.embarques e
    ON e.id=(s.datos->>'embarque')::uuid AND e.organization_id=p_org
  WHERE round(s.saldo,2)>0;
$$;

CREATE OR REPLACE FUNCTION public._cxc_calcular_corte(p_org uuid,p_fecha date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_filas jsonb;
  v_tc jsonb;
BEGIN
  IF p_fecha IS NULL OR p_fecha >= public.fecha_negocio_mx()
    OR p_fecha <> (date_trunc('month',p_fecha) + interval '1 month - 1 day')::date THEN
    RAISE EXCEPTION 'Selecciona el último día de un mes terminado.';
  END IF;
  IF NOT EXISTS (SELECT FROM public.cxc_aperturas WHERE organization_id=p_org AND desde<=p_fecha) THEN
    RAISE EXCEPTION 'Sin corte verificado para la fecha seleccionada.';
  END IF;
  v_filas := public._cxc_filas_al_corte(p_org,p_fecha);
  SELECT jsonb_build_object('fecha',t.fecha,'usdMxn',t.usd_mxn,'eurMxn',t.eur_mxn,'exacto',t.fecha=p_fecha)
    INTO v_tc FROM public.tc_dof_vigente(p_fecha) t;
  RETURN jsonb_build_object('filas',v_filas,'tipoCambio',v_tc);
END;
$$;

CREATE OR REPLACE FUNCTION public.previsualizar_corte_cxc(p_org uuid,p_fecha date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_datos jsonb;
BEGIN
  v_datos := public._cxc_calcular_corte(public._cxc_org_contador(p_org),p_fecha);
  RETURN v_datos || jsonb_build_object('fingerprint', encode(sha256(convert_to(v_datos::text,'UTF8')),'hex'));
END;
$$;

CREATE OR REPLACE FUNCTION public.certificar_corte_cxc(p_org uuid,p_fecha date,p_fingerprint text,p_evidencia text,p_request_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := public._cxc_org_contador(p_org);
  v_datos jsonb;
  v_previo public.cxc_cortes;
  v_revision integer;
  v_cierre date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('cierre-contable:' || v_org::text,0));
  SELECT * INTO v_previo FROM public.cxc_cortes WHERE id=p_request_id AND organization_id=v_org;
  IF FOUND AND v_previo.fecha=p_fecha AND v_previo.fingerprint=p_fingerprint
    AND v_previo.conciliado_por=auth.uid() THEN RETURN v_previo.id; END IF;
  IF p_request_id IS NULL OR length(btrim(COALESCE(p_evidencia,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Registra la evidencia de conciliación del cierre.';
  END IF;
  IF EXISTS (SELECT FROM public.cxc_cortes WHERE organization_id=v_org AND fecha=p_fecha AND reabierto_en IS NULL) THEN
    RAISE EXCEPTION 'El corte ya está certificado. Reabre el periodo para emitir otra revisión.';
  END IF;
  v_datos := public._cxc_calcular_corte(v_org,p_fecha);
  IF encode(sha256(convert_to(v_datos::text,'UTF8')),'hex') IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'La cartera cambió desde la vista previa. Vuelve a revisarla.' USING ERRCODE='PT409';
  END IF;
  v_cierre := public.cierre_periodo_fecha(v_org);
  IF v_cierre IS NULL OR p_fecha > v_cierre THEN
    PERFORM public.actualizar_cierre_periodo(v_org,p_fecha,NULL);
  END IF;
  SELECT COALESCE(max(revision),0)+1 INTO v_revision FROM public.cxc_cortes
    WHERE organization_id=v_org AND fecha=p_fecha;
  INSERT INTO public.cxc_cortes (id,organization_id,fecha,revision,conciliado_por,evidencia,fingerprint,datos)
    VALUES(p_request_id,v_org,p_fecha,v_revision,auth.uid(),btrim(p_evidencia),p_fingerprint,v_datos);
  PERFORM public.registrar_bitacora('configuracion','certificar_corte_cxc',p_request_id,'Cartera por cobrar',
    jsonb_build_object('fecha',p_fecha,'revision',v_revision),v_org,auth.uid());
  RETURN p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consultar_corte_cxc(p_org uuid,p_fecha date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := public.org_scope();
  v_corte public.cxc_cortes;
BEGIN
  IF p_org IS NULL OR p_org IS DISTINCT FROM v_org OR NOT public.has_any_role_in_org_exact(auth.uid(),
    ARRAY['admin','admin_org','contador','tesorero','ejecutivo_cobranza','gerente_operaciones','gerente_visor','gerente_comercial']::public.app_role[],v_org)
    THEN RAISE EXCEPTION 'Corte no disponible.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_corte FROM public.cxc_cortes WHERE organization_id=v_org AND fecha=p_fecha
    ORDER BY revision DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('estado','sin_corte'); END IF;
  RETURN v_corte.datos || jsonb_build_object('estado',CASE WHEN v_corte.reabierto_en IS NULL THEN 'certificado' ELSE 'reabierto' END,
    'id',v_corte.id,'fecha',v_corte.fecha,'revision',v_corte.revision,'conciliadoEn',v_corte.conciliado_en);
END;
$$;

CREATE OR REPLACE FUNCTION public._cxc_reabrir_cortes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := OLD.organization_id;
  v_fecha date;
BEGIN
  IF OLD.categoria<>'contabilidad' OR OLD.clave<>'cierre_periodo_fecha' THEN RETURN NULL; END IF;
  IF TG_OP='UPDATE' AND NEW.categoria='contabilidad' AND NEW.clave='cierre_periodo_fecha' THEN
    v_fecha := (NEW.valor #>> '{}')::date;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cierre-contable:' || v_org::text,0));
  UPDATE public.cxc_cortes SET reabierto_en=now()
    WHERE organization_id=v_org AND reabierto_en IS NULL AND (v_fecha IS NULL OR fecha>v_fecha);
  RETURN NULL;
END;
$$;
CREATE TRIGGER cxc_reabrir_cortes AFTER UPDATE OR DELETE ON public.configuracion
  FOR EACH ROW EXECUTE FUNCTION public._cxc_reabrir_cortes();

REVOKE ALL ON FUNCTION public._cxc_dato_fuente(text,jsonb), public._cxc_fecha_fuente(text,jsonb),
  public._cxc_serializar_escritura(), public._cxc_capturar_version(), public._cxc_org_contador(uuid), public._cxc_filas_al_corte(uuid,date),
  public._cxc_calcular_corte(uuid,date), public._cxc_reabrir_cortes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activar_historial_cxc(uuid,text), public.previsualizar_corte_cxc(uuid,date),
  public.certificar_corte_cxc(uuid,date,text,text,uuid), public.consultar_corte_cxc(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activar_historial_cxc(uuid,text), public.previsualizar_corte_cxc(uuid,date),
  public.certificar_corte_cxc(uuid,date,text,text,uuid), public.consultar_corte_cxc(uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.consultar_apertura_cxc(p_org uuid) RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org uuid := public._cxc_org_contador(p_org);
BEGIN
  RETURN (SELECT desde FROM public.cxc_aperturas WHERE organization_id=v_org);
END;
$$;
REVOKE ALL ON FUNCTION public.consultar_apertura_cxc(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultar_apertura_cxc(uuid) TO authenticated;

-- =========================================================
-- DEFECTO 4 (P1): CierrePeriodoCard escribía directo en `configuracion`,
-- permitiendo vaciar/retroceder el cierre de periodo sin motivo ni bitácora.
-- RPC SECURITY DEFINER: exige rol financiero exacto, permite avance
-- monotónico libre, exige motivo para retroceso/reapertura/vaciado y deja
-- bitácora siempre.
-- =========================================================

CREATE OR REPLACE FUNCTION public.actualizar_cierre_periodo(
  p_org uuid,
  p_fecha date,
  p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_anterior  date;
  v_retroceso boolean;
  v_motivo    text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'LC_ORG_REQUERIDA: se requiere la organización' USING ERRCODE = 'P0001';
  END IF;

  IF public.has_any_role_in_org(
       v_uid,
       ARRAY['admin','admin_org','contador','tesorero','super_admin']::public.app_role[],
       p_org
     ) IS NOT TRUE THEN
    RAISE EXCEPTION 'LC_ROL_INSUFICIENTE: necesitas un rol financiero o de administración para cambiar el cierre de periodo'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('cierre-contable:' || p_org::text,0));
  v_anterior := public.cierre_periodo_fecha(p_org);

  -- Retroceso: vaciar el cierre, o mover la fecha hacia atrás (reapertura).
  v_retroceso := v_anterior IS NOT NULL
                 AND (p_fecha IS NULL OR p_fecha < v_anterior);

  IF v_retroceso AND (v_motivo IS NULL OR length(v_motivo) < 10) THEN
    RAISE EXCEPTION 'LC_CIERRE_MOTIVO_REQUERIDO: para reabrir o retroceder el cierre de periodo debes capturar un motivo (mínimo 10 caracteres)'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.configuracion (organization_id, categoria, clave, valor)
  VALUES (p_org, 'contabilidad', 'cierre_periodo_fecha',
          CASE WHEN p_fecha IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_fecha::text) END)
  ON CONFLICT (organization_id, categoria, clave)
  DO UPDATE SET valor = EXCLUDED.valor;

  PERFORM public.registrar_bitacora(
    'configuracion',
    'actualizar_cierre_periodo',
    NULL,
    'contabilidad.cierre_periodo_fecha',
    jsonb_build_object(
      'fecha_anterior', v_anterior,
      'fecha_nueva', p_fecha,
      'retroceso', v_retroceso,
      'motivo', v_motivo
    ),
    p_org,
    v_uid
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.actualizar_cierre_periodo(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_cierre_periodo(uuid, date, text) TO authenticated, service_role;
