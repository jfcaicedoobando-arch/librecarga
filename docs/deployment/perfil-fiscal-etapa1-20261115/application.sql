-- REVIEWED APPLICATION CANDIDATE. Do not execute before CI/release approval.
-- Source bytes below are verified by build-envelope.mjs. No fixtures or CI grants.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SET LOCAL check_function_bodies = on;
SELECT pg_advisory_xact_lock(hashtextextended('librecarga:drizzle:apply', 0));
LOCK TABLE drizzle.__drizzle_migrations IN EXCLUSIVE MODE;
DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR current_setting('server_version_num')::integer / 10000 <> 17 THEN
    RAISE EXCEPTION 'DEPLOY90: expected PostgreSQL17/postgres';
  END IF;
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) <> 67
    OR (SELECT max(created_at) FROM drizzle.__drizzle_migrations) <> 1794694500000 THEN
    RAISE EXCEPTION 'DEPLOY90: unexpected migration tail';
  END IF;
  IF to_regclass('public.perfiles_fiscales_emisor') IS NOT NULL
    OR to_regtype('public.perfiles_fiscales_emisor') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('facturas_listado_pagina','facturas_clientes_listado','_perfil_fiscal_emisor_resultado','obtener_perfil_fiscal_emisor','registrar_perfil_fiscal_emisor','confirmar_perfil_fiscal_emisor')) THEN
    RAISE EXCEPTION 'DEPLOY90: target table/type/function already exists; do not overwrite';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ('facturas'), ('proformas')) AS expected(name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=expected.name AND c.relrowsecurity)) THEN
    RAISE EXCEPTION 'DEPLOY90: required invoice/proforma RLS missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.facturapi_credenciales'::regclass
    AND tgname='trg_facturapi_credenciales_updated_at' AND tgenabled='O'
    AND tgfoid='public.update_updated_at_column()'::regprocedure AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'DEPLOY90: credentials rotation timestamp trigger missing';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES
    ('public','facturapi_credenciales','organization_id','uuid'),
    ('public','facturapi_credenciales','facturapi_org_id','text'),
    ('public','facturapi_credenciales','updated_at','timestamptz'),
    ('public','configuracion','organization_id','uuid'),
    ('public','configuracion','categoria','text'),
    ('public','configuracion','clave','text'),
    ('public','configuracion','valor','jsonb'),
    ('public','organizations','id','uuid'),
    ('auth','users','id','uuid')
  ) AS required(schema_name,table_name,column_name,type_name)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema=required.schema_name AND c.table_name=required.table_name
        AND c.column_name=required.column_name AND c.udt_name=required.type_name)) THEN
    RAISE EXCEPTION 'DEPLOY90: fiscal dependency column/type mismatch';
  END IF;
END
$preflight$;
DO $ledger_check$
DECLARE n bigint; fingerprint text;
BEGIN
  SELECT count(*), encode(sha256(convert_to(coalesce(string_agg(id::text||':'||hash||':'||created_at::text, E'\n' ORDER BY id), ''), 'UTF8')), 'hex')
    INTO n, fingerprint FROM drizzle.__drizzle_migrations WHERE created_at <= 1794694500000;
  IF n <> 67 OR fingerprint IS DISTINCT FROM 'b8db6f1bb5404bc8fa7fb6b9061690bff29f4f07f455b8ed9f2c502b93f3c7e3' THEN
    RAISE EXCEPTION 'DEPLOY90: existing Drizzle ledger drift';
  END IF;
END
$ledger_check$;
DO $body_check$
DECLARE expected record;
BEGIN
  FOR expected IN SELECT * FROM (VALUES
    ('public._comision_broker_sync()', 'f4eaebadc778dcd62f674b5e6def21320a028fb425f3d79215034b69637f07e5'),
    ('public._comision_kam_broker()', '173d1b8415d057157c301ed48d88aa6ef01585ac812070d0440de7a474d65515'),
    ('public.has_any_role_in_org_exact(uuid,public.app_role[],uuid)', '8956f1ecb143c9693a6912f60bc1f6dfa1142163f594857a4f2c51c1cf629590'),
    ('public.org_requerida(uuid)', 'e7256d08b5f11687b2b2d379dc5855df38fb25d5cd326664ccdaf293f4acd22f'),
    ('public.org_scope()', '8125029726d251ae46d4d34eae0bd5aca7d6ea32e36be93c50f7918d95d64572'),
    ('public.rls_tenant_scope_ok(uuid)', 'a917b7f694d0f3e8fc91ad7574f2b2283f5f78993888cf69927f021093fa2b00'),
    ('public.update_updated_at_column()', 'e074d3db8073b75d3d30dc88b1bfccd78344fdb695a013054e0d6944708c2882')
  ) AS x(signature, hash) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure(expected.signature)
      AND proowner = 'postgres'::regrole
      AND encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') = expected.hash) THEN
      RAISE EXCEPTION 'DEPLOY90: function body/owner drift %', expected.signature;
    END IF;
  END LOOP;
END
$body_check$;

-- Filtros globales de Emitidas, sin cambiar el contrato histórico facturas_listado.
CREATE OR REPLACE FUNCTION public.facturas_listado_pagina(
  p_organization_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 50,
  p_cliente_nombre text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH alcance AS MATERIALIZED (
    SELECT public.org_requerida(p_organization_id) AS org_id
  ), filtered AS MATERIALIZED (
    SELECT f.id, f.numero, f.cliente_nombre, f.expediente, f.total, f.moneda,
           f.fecha_emision, f.fecha_vencimiento, f.estado, f.proforma_id,
           f.factura_pdf_url, f.factura_xml_url, f.ambiente,
           f.acuse_cancelacion_status, f.cancellation_status, f.enviada_cliente_at,
           f.created_at
    FROM public.facturas f
    JOIN alcance a ON f.organization_id = a.org_id
    WHERE f.deleted_at IS NULL
      AND (p_search IS NULL OR p_search = '' OR
           f.numero ILIKE '%' || p_search || '%' OR
           f.cliente_nombre ILIKE '%' || p_search || '%' OR
           f.expediente ILIKE '%' || p_search || '%')
      AND (p_estado IS NULL OR f.estado = p_estado::public.estado_factura)
      AND (p_fecha_desde IS NULL OR f.fecha_emision >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR f.fecha_emision <= p_fecha_hasta)
      AND (p_cliente_nombre IS NULL OR f.cliente_nombre = p_cliente_nombre)
  ), pagina AS (
    SELECT * FROM filtered
    ORDER BY created_at DESC, id DESC
    OFFSET greatest(coalesce(p_offset, 0), 0)
    LIMIT greatest(1, least(coalesce(p_limit, 50), 500))
  ), filas AS (
    SELECT p.*, CASE WHEN pf.numero IS NOT NULL THEN jsonb_build_object('numero', pf.numero) END AS proformas
    FROM pagina p
    LEFT JOIN public.proformas pf ON pf.id = p.proforma_id
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(filas) - 'created_at'
      ORDER BY created_at DESC, id DESC) FROM filas), '[]'::jsonb),
    'count', (SELECT count(*) FROM filtered)
  );
$function$;
REVOKE ALL ON FUNCTION public.facturas_listado_pagina(uuid, text, text, date, date, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.facturas_listado_pagina(uuid, text, text, date, date, integer, integer, text) TO authenticated, service_role;

-- Nombres de las facturas, incluyendo clientes históricos renombrados o dados de baja.
CREATE OR REPLACE FUNCTION public.facturas_clientes_listado(p_organization_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH alcance AS MATERIALIZED (
    SELECT public.org_requerida(p_organization_id) AS org_id
  ), clientes AS (
    SELECT DISTINCT f.cliente_nombre
    FROM public.facturas f
    JOIN alcance a ON f.organization_id = a.org_id
    WHERE f.deleted_at IS NULL AND f.cliente_nombre IS NOT NULL AND f.cliente_nombre <> ''
  )
  SELECT coalesce(jsonb_agg(cliente_nombre ORDER BY cliente_nombre), '[]'::jsonb) FROM clientes;
$function$;
REVOKE ALL ON FUNCTION public.facturas_clientes_listado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.facturas_clientes_listado(uuid) TO authenticated, service_role;

-- These SECURITY DEFINER helpers are trigger-only, not RPC entry points.
-- PostgreSQL rejects ordinary direct calls to RETURNS trigger functions; no
-- direct-call exploit is asserted. Close unnecessary EXECUTE without changing
-- their bodies, trigger bindings, commission calculations or existing rows.
DO $broker_trigger_precondition$
DECLARE target record;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('public._comision_kam_broker()', 'trg_b00_comision_kam_broker'),
    ('public._comision_broker_sync()', 'trg_comision_broker_sync')
  ) AS targets(signature, trigger_name) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_trigger t ON t.tgfoid = p.oid
      WHERE p.oid = pg_catalog.to_regprocedure(target.signature)
        AND p.proowner = 'postgres'::regrole AND p.prorettype = 'trigger'::regtype
        AND p.prosecdef AND p.proconfig = ARRAY['search_path=public']::text[]
        AND t.tgname = target.trigger_name
        AND t.tgrelid = 'public.comisiones_devengadas'::regclass AND NOT t.tgisinternal
    ) THEN
      RAISE EXCEPTION 'BROKER_TRIGGER_ACL: expected existing definer trigger %', target.signature;
    END IF;
  END LOOP;
END
$broker_trigger_precondition$;

REVOKE ALL ON FUNCTION public._comision_kam_broker() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._comision_broker_sync() FROM PUBLIC, anon, authenticated, service_role;

DO $broker_trigger_postcondition$
DECLARE signature text; fn oid; client_role text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public._comision_kam_broker()', 'public._comision_broker_sync()'] LOOP
    fn := pg_catalog.to_regprocedure(signature);
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p,
        LATERAL pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
      WHERE p.oid = fn AND (a.grantee <> p.proowner OR a.grantor <> p.proowner)
    ) THEN
      RAISE EXCEPTION 'BROKER_TRIGGER_ACL: unexpected non-owner privilege on %', signature;
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF pg_catalog.has_function_privilege(client_role, fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'BROKER_TRIGGER_ACL: inherited or direct EXECUTE for % on %', client_role, signature;
      END IF;
    END LOOP;
  END LOOP;
END
$broker_trigger_postcondition$;

-- Perfil fiscal versionado. Solo el adaptador Facturapi registra datos importados.
-- No activa impuestos, modifica CFDI ni reinterpreta documentos anteriores.
CREATE TABLE public.perfiles_fiscales_emisor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  ambiente text NOT NULL CHECK (ambiente IN ('sandbox', 'live')),
  version integer NOT NULL CHECK (version > 0),
  facturapi_org_id text NOT NULL CHECK (length(facturapi_org_id) BETWEEN 1 AND 100),
  rfc text,
  razon_social text,
  tipo_persona text CHECK (tipo_persona IN ('fisica', 'moral')),
  regimen_fiscal text,
  codigo_postal text,
  origen text NOT NULL DEFAULT 'facturapi' CHECK (origen = 'facturapi'),
  credenciales_actualizadas_at timestamptz NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  sincronizado_por uuid NOT NULL REFERENCES auth.users(id),
  confirmado_at timestamptz,
  confirmado_por uuid REFERENCES auth.users(id),
  vigente_desde date,
  CONSTRAINT perfiles_fiscales_emisor_version_key UNIQUE (organization_id, ambiente, version),
  CONSTRAINT perfiles_fiscales_emisor_confirmacion_check
    CHECK ((confirmado_at IS NULL) = (confirmado_por IS NULL)),
  CONSTRAINT perfiles_fiscales_emisor_datos_length_check CHECK (
    length(rfc) <= 20 AND length(razon_social) <= 300
    AND length(regimen_fiscal) <= 10 AND length(codigo_postal) <= 10)
);
ALTER TABLE public.perfiles_fiscales_emisor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.perfiles_fiscales_emisor FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.perfiles_fiscales_emisor TO authenticated, service_role;
DROP POLICY IF EXISTS perfil_fiscal_emisor_lectura ON public.perfiles_fiscales_emisor;
CREATE POLICY perfil_fiscal_emisor_lectura ON public.perfiles_fiscales_emisor
  FOR SELECT TO authenticated USING (
    organization_id = (SELECT public.org_scope())
    AND public.has_any_role_in_org_exact((SELECT auth.uid()),
      ARRAY['admin','admin_org','contador']::public.app_role[], organization_id)
  );

CREATE OR REPLACE FUNCTION public._perfil_fiscal_emisor_resultado(
  p_perfil public.perfiles_fiscales_emisor,
  p_cred public.facturapi_credenciales,
  p_rfc_empresa text
) RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_problemas text[] := '{}'; v_estado text;
BEGIN
  IF p_perfil.id IS NULL THEN
    RETURN jsonb_build_object('perfil', NULL, 'version', 0, 'estado', 'sin_sincronizar',
      'problemas', CASE WHEN p_cred.organization_id IS NULL
        THEN jsonb_build_array('credenciales_pendientes') ELSE '[]'::jsonb END);
  END IF;
  IF p_cred.organization_id IS NULL OR p_cred.updated_at IS DISTINCT FROM p_perfil.credenciales_actualizadas_at THEN
    v_problemas := array_append(v_problemas, 'credenciales_cambiadas');
  END IF;
  IF p_cred.facturapi_org_id IS DISTINCT FROM p_perfil.facturapi_org_id THEN
    v_problemas := array_append(v_problemas, 'organizacion_discordante');
  END IF;
  IF p_perfil.tipo_persona IS NULL THEN v_problemas := array_append(v_problemas, 'rfc_invalido'); END IF;
  IF nullif(btrim(p_rfc_empresa), '') IS NULL THEN
    v_problemas := array_append(v_problemas, 'rfc_empresa_pendiente');
  ELSIF upper(btrim(p_rfc_empresa)) IS DISTINCT FROM p_perfil.rfc THEN
    v_problemas := array_append(v_problemas, 'rfc_empresa_discordante');
  END IF;
  IF nullif(btrim(p_perfil.razon_social), '') IS NULL THEN
    v_problemas := array_append(v_problemas, 'razon_social_pendiente');
  END IF;
  IF p_perfil.regimen_fiscal IS NULL OR p_perfil.regimen_fiscal <> ALL (
    ARRAY['601','603','605','606','607','608','610','611','612','614','615','616','620','621','622','623','624','625','626']) THEN
    v_problemas := array_append(v_problemas, 'regimen_invalido');
  END IF;
  IF p_perfil.codigo_postal IS NULL OR p_perfil.codigo_postal !~ '^[0-9]{5}$' THEN
    v_problemas := array_append(v_problemas, 'codigo_postal_invalido');
  END IF;
  v_estado := CASE WHEN cardinality(v_problemas) > 0 THEN 'requiere_revision'
    WHEN p_perfil.confirmado_at IS NOT NULL THEN 'confirmado' ELSE 'sin_confirmar' END;
  RETURN jsonb_build_object('perfil', to_jsonb(p_perfil) - 'credenciales_actualizadas_at',
    'version', p_perfil.version, 'estado', v_estado, 'problemas', to_jsonb(v_problemas));
END;
$$;
REVOKE ALL ON FUNCTION public._perfil_fiscal_emisor_resultado(public.perfiles_fiscales_emisor, public.facturapi_credenciales, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._perfil_fiscal_emisor_resultado(public.perfiles_fiscales_emisor, public.facturapi_credenciales, text) TO service_role;

CREATE OR REPLACE FUNCTION public.obtener_perfil_fiscal_emisor(p_org_id uuid, p_ambiente text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_perfil public.perfiles_fiscales_emisor; v_cred public.facturapi_credenciales; v_rfc text;
BEGIN
  IF p_org_id IS DISTINCT FROM public.org_scope() OR NOT public.has_any_role_in_org_exact(
    auth.uid(), ARRAY['admin','admin_org','contador']::public.app_role[], p_org_id) THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF p_ambiente IS NULL OR p_ambiente NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_AMBIENTE_INVALIDO' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_cred FROM public.facturapi_credenciales WHERE organization_id = p_org_id;
  SELECT * INTO v_perfil FROM public.perfiles_fiscales_emisor
    WHERE organization_id = p_org_id AND ambiente = p_ambiente ORDER BY version DESC LIMIT 1;
  SELECT valor #>> '{}' INTO v_rfc FROM public.configuracion
    WHERE organization_id = p_org_id AND categoria = 'empresa' AND clave = 'rfc';
  RETURN public._perfil_fiscal_emisor_resultado(v_perfil, v_cred, v_rfc)
    || jsonb_build_object('ambiente', p_ambiente);
END;
$$;
REVOKE ALL ON FUNCTION public.obtener_perfil_fiscal_emisor(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_perfil_fiscal_emisor(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_perfil_fiscal_emisor(
  p_org_id uuid, p_ambiente text, p_actor uuid, p_credenciales_actualizadas_at timestamptz,
  p_version_esperada integer, p_datos jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cred public.facturapi_credenciales; v_version integer; v_rfc text; v_tipo text; v_id uuid;
BEGIN
  IF NOT public.has_any_role_in_org_exact(p_actor,
    ARRAY['admin','admin_org','contador']::public.app_role[], p_org_id) THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF p_ambiente IS NULL OR p_ambiente NOT IN ('sandbox','live') OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object'
    OR coalesce(length(p_datos->>'facturapi_org_id'), 0) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_DATOS_INVALIDOS' USING ERRCODE = '22023';
  END IF;
  -- Serializa sincronización/confirmación y detecta rotación durante la llamada externa.
  SELECT * INTO v_cred FROM public.facturapi_credenciales WHERE organization_id = p_org_id FOR UPDATE;
  IF v_cred.organization_id IS NULL OR v_cred.updated_at IS DISTINCT FROM p_credenciales_actualizadas_at THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_CONFIG_CAMBIO' USING ERRCODE = '40001';
  END IF;
  SELECT coalesce(max(version), 0) INTO v_version FROM public.perfiles_fiscales_emisor
    WHERE organization_id = p_org_id AND ambiente = p_ambiente;
  IF v_version IS DISTINCT FROM p_version_esperada THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_VERSION_CAMBIO' USING ERRCODE = '40001';
  END IF;
  -- Vincular solo si falta; un ID distinto se conserva y produce una discordancia visible.
  IF v_cred.facturapi_org_id IS NULL THEN
    UPDATE public.facturapi_credenciales SET facturapi_org_id = p_datos->>'facturapi_org_id'
      WHERE organization_id = p_org_id RETURNING * INTO v_cred;
  END IF;
  v_rfc := nullif(upper(btrim(p_datos->>'rfc')), '');
  IF v_rfc NOT IN ('XAXX010101000','XEXX010101000') THEN
    v_tipo := CASE WHEN v_rfc ~ '^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$' THEN 'fisica'
      WHEN v_rfc ~ '^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$' THEN 'moral' END;
  END IF;
  INSERT INTO public.perfiles_fiscales_emisor (
    organization_id, ambiente, version, facturapi_org_id, rfc, razon_social, tipo_persona,
    regimen_fiscal, codigo_postal, credenciales_actualizadas_at, sincronizado_por
  ) VALUES (
    p_org_id, p_ambiente, v_version + 1, p_datos->>'facturapi_org_id', v_rfc,
    nullif(btrim(p_datos->>'razon_social'), ''), v_tipo, nullif(btrim(p_datos->>'regimen_fiscal'), ''),
    nullif(btrim(p_datos->>'codigo_postal'), ''), v_cred.updated_at, p_actor
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_perfil_fiscal_emisor(uuid, text, uuid, timestamptz, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_perfil_fiscal_emisor(uuid, text, uuid, timestamptz, integer, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.confirmar_perfil_fiscal_emisor(
  p_org_id uuid, p_ambiente text, p_perfil_id uuid, p_vigente_desde date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cred public.facturapi_credenciales; v_perfil public.perfiles_fiscales_emisor; v_estado jsonb;
BEGIN
  -- Obtener valida tanto organización activa como rol fiscal.
  PERFORM public.obtener_perfil_fiscal_emisor(p_org_id, p_ambiente);
  SELECT * INTO v_cred FROM public.facturapi_credenciales WHERE organization_id = p_org_id FOR UPDATE;
  SELECT * INTO v_perfil FROM public.perfiles_fiscales_emisor
    WHERE organization_id = p_org_id AND ambiente = p_ambiente ORDER BY version DESC LIMIT 1 FOR UPDATE;
  IF p_perfil_id IS NULL OR v_perfil.id IS DISTINCT FROM p_perfil_id THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_VERSION_CAMBIO' USING ERRCODE = '40001';
  END IF;
  v_estado := public.obtener_perfil_fiscal_emisor(p_org_id, p_ambiente);
  IF jsonb_array_length(v_estado->'problemas') > 0 THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_REQUIERE_REVISION' USING ERRCODE = '22023';
  END IF;
  IF p_vigente_desde > (now() AT TIME ZONE 'America/Mexico_City')::date THEN
    RAISE EXCEPTION 'LC_PERFIL_FISCAL_FECHA_FUTURA' USING ERRCODE = '22023';
  END IF;
  IF v_perfil.confirmado_at IS NULL THEN
    UPDATE public.perfiles_fiscales_emisor SET confirmado_at = now(), confirmado_por = auth.uid(),
      vigente_desde = p_vigente_desde WHERE id = p_perfil_id AND organization_id = p_org_id;
  END IF;
  RETURN public.obtener_perfil_fiscal_emisor(p_org_id, p_ambiente);
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_perfil_fiscal_emisor(uuid, text, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_perfil_fiscal_emisor(uuid, text, uuid, date) TO authenticated, service_role;

-- Ola16 boundary in addition to the fiscal-role/active-organization read policy.
CREATE POLICY perfiles_fiscales_emisor_tenant_restrictive ON public.perfiles_fiscales_emisor
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id))
  WITH CHECK ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id));

-- Append only these new journal entries. Existing ledgers are never repaired.
INSERT INTO drizzle.__drizzle_migrations(hash, created_at) VALUES
  ('ac331d449940dae8b2b2e80d1771e66d3c3d6157c9925080b18daa5c7fee4d2f', 1794694500001),
  ('c1e04873d1bdb4a5d89fbb4837f6a0dcc33c07bb241b9d7963ba63e80aebdad9', 1794694500002),
  ('b9ff6b1ea3bcfd3add4fe4829a4ff8f7731a8181181e8fd06a8acb5ade3c7cd1', 1794694500003);
DO $ledger_check$
DECLARE n bigint; fingerprint text;
BEGIN
  SELECT count(*), encode(sha256(convert_to(coalesce(string_agg(id::text||':'||hash||':'||created_at::text, E'\n' ORDER BY id), ''), 'UTF8')), 'hex')
    INTO n, fingerprint FROM drizzle.__drizzle_migrations WHERE created_at <= 1794694500000;
  IF n <> 67 OR fingerprint IS DISTINCT FROM 'b8db6f1bb5404bc8fa7fb6b9061690bff29f4f07f455b8ed9f2c502b93f3c7e3' THEN
    RAISE EXCEPTION 'DEPLOY90: existing Drizzle ledger drift';
  END IF;
END
$ledger_check$;
DO $ledger_after$
BEGIN
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) <> 70 THEN
    RAISE EXCEPTION 'DEPLOY90: unexpected final ledger count';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ('ac331d449940dae8b2b2e80d1771e66d3c3d6157c9925080b18daa5c7fee4d2f', 1794694500001::bigint),('c1e04873d1bdb4a5d89fbb4837f6a0dcc33c07bb241b9d7963ba63e80aebdad9', 1794694500002::bigint),('b9ff6b1ea3bcfd3add4fe4829a4ff8f7731a8181181e8fd06a8acb5ade3c7cd1', 1794694500003::bigint)) AS expected(hash, stamp)
    WHERE (SELECT count(*) FROM drizzle.__drizzle_migrations d WHERE d.hash=expected.hash AND d.created_at=expected.stamp) <> 1) THEN
    RAISE EXCEPTION 'DEPLOY90: missing/duplicate applied migration';
  END IF;
END
$ledger_after$;
DO $body_check$
DECLARE expected record;
BEGIN
  FOR expected IN SELECT * FROM (VALUES
    ('public._comision_broker_sync()', 'f4eaebadc778dcd62f674b5e6def21320a028fb425f3d79215034b69637f07e5'),
    ('public._comision_kam_broker()', '173d1b8415d057157c301ed48d88aa6ef01585ac812070d0440de7a474d65515'),
    ('public.has_any_role_in_org_exact(uuid,public.app_role[],uuid)', '8956f1ecb143c9693a6912f60bc1f6dfa1142163f594857a4f2c51c1cf629590'),
    ('public.org_requerida(uuid)', 'e7256d08b5f11687b2b2d379dc5855df38fb25d5cd326664ccdaf293f4acd22f'),
    ('public.org_scope()', '8125029726d251ae46d4d34eae0bd5aca7d6ea32e36be93c50f7918d95d64572'),
    ('public.rls_tenant_scope_ok(uuid)', 'a917b7f694d0f3e8fc91ad7574f2b2283f5f78993888cf69927f021093fa2b00'),
    ('public.update_updated_at_column()', 'e074d3db8073b75d3d30dc88b1bfccd78344fdb695a013054e0d6944708c2882'),
    ('public.facturas_listado_pagina(uuid,text,text,date,date,integer,integer,text)', 'a7269c003938ae1c833c0abe628005ed20c38016dd11f98fa424213342175200'),
    ('public.facturas_clientes_listado(uuid)', 'a0956b8023d5a1bf0136aaf1d4d77f6864339096291da90708910d2ba772738f'),
    ('public._perfil_fiscal_emisor_resultado(public.perfiles_fiscales_emisor,public.facturapi_credenciales,text)', '300029ad3862b57cc50fb71035803e8e4f1cdf89cf6455987893481b8f656d43'),
    ('public.obtener_perfil_fiscal_emisor(uuid,text)', 'da5e78d9ed85571a10c232bb1d1a6090d28de39fcd633897e3a126a86d2eb97a'),
    ('public.registrar_perfil_fiscal_emisor(uuid,text,uuid,timestamptz,integer,jsonb)', '7dd215e003341c9936df40626bed3faa50480ae042b08b1b5b4fc057c507dd9b'),
    ('public.confirmar_perfil_fiscal_emisor(uuid,text,uuid,date)', '0009ac90e5038784187e9f7bb09c694bc97ca5baaf8b229300d170c151c6f735')
  ) AS x(signature, hash) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure(expected.signature)
      AND proowner = 'postgres'::regrole
      AND encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') = expected.hash) THEN
      RAISE EXCEPTION 'DEPLOY90: function body/owner drift %', expected.signature;
    END IF;
  END LOOP;
END
$body_check$;
DO $fiscal_policies$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='perfiles_fiscales_emisor') <> 2
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='perfiles_fiscales_emisor'
      AND policyname='perfil_fiscal_emisor_lectura' AND permissive='PERMISSIVE' AND cmd='SELECT'
      AND roles=ARRAY['authenticated']::name[] AND qual LIKE '%org_scope()%has_any_role_in_org_exact%')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='perfiles_fiscales_emisor'
      AND policyname='perfiles_fiscales_emisor_tenant_restrictive' AND permissive='RESTRICTIVE' AND cmd='ALL'
      AND roles=ARRAY['authenticated']::name[] AND qual=with_check
      AND qual LIKE '%has_role%super_admin%rls_tenant_scope_ok(organization_id)%') THEN
    RAISE EXCEPTION 'DEPLOY90: fiscal RLS policy contract mismatch';
  END IF;
END
$fiscal_policies$;
-- Ejecutar tras el replay y ANTES de _ci_post_migrate.sql: sus GRANT amplios
-- no deben ocultar un permiso faltante en la migración de producto 0066.
DO $check$
DECLARE
  firma text;
  fn pg_proc%ROWTYPE;
BEGIN
  FOREACH firma IN ARRAY ARRAY[
    'public.facturas_listado_pagina(uuid,text,text,date,date,integer,integer,text)',
    'public.facturas_clientes_listado(uuid)'
  ] LOOP
    SELECT * INTO STRICT fn FROM pg_proc WHERE oid = firma::regprocedure;
    IF fn.prosecdef OR fn.provolatile <> 's'
       OR NOT coalesce(fn.proconfig @> ARRAY['search_path=public'], false) THEN
      RAISE EXCEPTION 'Contrato INVOKER/STABLE/search_path incorrecto: %', firma;
    END IF;
    IF has_function_privilege('anon', fn.oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner)))
         WHERE grantee = 0 AND privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION 'Función accesible a anon/PUBLIC: %', firma;
    END IF;
    IF NOT has_function_privilege('authenticated', fn.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Falta permiso explícito para consumidor de producto: %', firma;
    END IF;
  END LOOP;
END;
$check$;
-- Same read-only assertion before CI blanket grants and after their reversal.
-- Never repair a real replay leak before this check has observed it.
DO $broker_trigger_acl$
DECLARE target record; fn oid; client_role text;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('public._comision_kam_broker()', 'trg_b00_comision_kam_broker'),
    ('public._comision_broker_sync()', 'trg_comision_broker_sync')
  ) AS targets(signature, trigger_name) LOOP
    fn := pg_catalog.to_regprocedure(target.signature);
    IF fn IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_trigger t ON t.tgfoid = p.oid
      WHERE p.oid = fn AND p.proowner = 'postgres'::regrole
        AND p.prorettype = 'trigger'::regtype AND p.prosecdef
        AND p.proconfig = ARRAY['search_path=public']::text[]
        AND t.tgname = target.trigger_name
        AND t.tgrelid = 'public.comisiones_devengadas'::regclass AND NOT t.tgisinternal
    ) THEN
      RAISE EXCEPTION 'CI_BROKER_TRIGGER_ACL: expected existing definer trigger %', target.signature;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p,
        LATERAL pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
      WHERE p.oid = fn AND (a.grantee <> p.proowner OR a.grantor <> p.proowner)
    ) THEN
      RAISE EXCEPTION 'CI_BROKER_TRIGGER_ACL: non-owner privilege on %', target.signature;
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF pg_catalog.has_function_privilege(client_role, fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'CI_BROKER_TRIGGER_ACL: inherited or direct EXECUTE for % on %', client_role, target.signature;
      END IF;
    END LOOP;
  END LOOP;
END
$broker_trigger_acl$;
-- Assert the product ACL before CI grants and after restoring it; never repair here.
DO $perfil_fiscal_acl$
DECLARE client_role text; privilege_name text; signature text; fn oid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.perfiles_fiscales_emisor')
    AND relrowsecurity AND relowner = 'postgres'::regrole) THEN
    RAISE EXCEPTION 'CI_PERFIL_FISCAL_ACL: missing owned RLS table';
  END IF;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF has_table_privilege(client_role, 'public.perfiles_fiscales_emisor', 'SELECT')
      IS DISTINCT FROM (client_role <> 'anon') THEN
      RAISE EXCEPTION 'CI_PERFIL_FISCAL_ACL: unexpected SELECT for %', client_role;
    END IF;
    FOREACH privilege_name IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      IF has_table_privilege(client_role, 'public.perfiles_fiscales_emisor', privilege_name) THEN
        RAISE EXCEPTION 'CI_PERFIL_FISCAL_ACL: unexpected % for %', privilege_name, client_role;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'public.registrar_perfil_fiscal_emisor(uuid,text,uuid,timestamptz,integer,jsonb)',
    'public._perfil_fiscal_emisor_resultado(public.perfiles_fiscales_emisor,public.facturapi_credenciales,text)',
    'public.obtener_perfil_fiscal_emisor(uuid,text)',
    'public.confirmar_perfil_fiscal_emisor(uuid,text,uuid,date)'
  ] LOOP
    fn := to_regprocedure(signature);
    IF fn IS NULL OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = fn
      AND proowner = 'postgres'::regrole AND proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
      AND prosecdef = (proname <> '_perfil_fiscal_emisor_resultado')) THEN
      RAISE EXCEPTION 'CI_PERFIL_FISCAL_ACL: unexpected function metadata %', signature;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE')
      OR NOT has_function_privilege('service_role', fn, 'EXECUTE')
      OR has_function_privilege('authenticated', fn, 'EXECUTE') IS DISTINCT FROM
        (signature LIKE 'public.obtener_%' OR signature LIKE 'public.confirmar_%') THEN
      RAISE EXCEPTION 'CI_PERFIL_FISCAL_ACL: unexpected EXECUTE %', signature;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p,
      LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = fn AND a.grantee = 0) THEN
      RAISE EXCEPTION 'CI_PERFIL_FISCAL_ACL: PUBLIC privilege %', signature;
    END IF;
  END LOOP;
END
$perfil_fiscal_acl$;

NOTIFY pgrst, 'reload schema';
COMMIT;
