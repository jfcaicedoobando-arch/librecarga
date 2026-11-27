-- Sólo PostgreSQL efímero de CI: fixtures sintéticas y rollback obligatorio.
-- No ejecutar contra bases remotas. La autoaprobación no registra pagos.
BEGIN;
\i supabase/tests/rls/_helpers.sql

-- A diferencia del helper histórico, NULL también falla.
CREATE OR REPLACE FUNCTION pg_temp.cxp_assert(p_ok boolean, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'CXP TEST FAIL: %', p_label; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.cxp_expect_error(p_sql text, p_state text, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
  END;
  PERFORM pg_temp.cxp_assert(v_state = p_state AND v_message LIKE p_message,
    format('esperaba %s/%s; obtuvo %s/%s', p_state, p_message, v_state, v_message));
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.cxp_fixture(p_org uuid, p_creator uuid, p_concepts boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_prov uuid := gen_random_uuid(); v_cat uuid := gen_random_uuid(); v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.proveedores(id, organization_id, nombre, categoria, subtipo_gasto)
    VALUES (v_prov, p_org, 'Autoaprobación proveedor efímero', 'GastoOperativo', 'Otros');
  INSERT INTO public.presupuesto_categorias(id, organization_id, nombre, tipo_contable)
    VALUES (v_cat, p_org, 'Autoaprobación administración ' || v_cat::text, 'Administracion');
  INSERT INTO public.proveedor_facturas(id, organization_id, proveedor_id, proveedor_nombre,
    categoria_presupuesto_id, folio_proveedor, fecha_emision, moneda, tipo_cambio_usd,
    subtotal, total, estado, estado_aprobacion, created_by)
  VALUES (v_id, p_org, v_prov, 'Autoaprobación proveedor efímero', v_cat,
    'AUTO-' || v_id::text, public.fecha_negocio_mx(), 'MXN', 1, 100, 100, 'Vigente', 'pendiente', p_creator);
  IF p_concepts THEN
    INSERT INTO public.proveedor_facturas_conceptos(organization_id, proveedor_factura_id,
      descripcion, cantidad, monto, iva, ieps)
    VALUES (p_org, v_id, 'Gasto sintético', 1, 100, 0, 0);
  END IF;
  RETURN v_id;
END;
$$;

DO $test$
DECLARE
  fx record; v_role text; v_id uuid; v_other uuid; v_version timestamptz;
  v_row public.proveedor_facturas; v_before jsonb; v_payments bigint;
BEGIN
  -- Roles vigentes mantienen aprobación propia, actor e historial.
  -- admin es legacy: su exención permanece en la fuente, pero no admite nuevas asignaciones.
  FOREACH v_role IN ARRAY ARRAY['contador','admin_org','super_admin'] LOOP
    PERFORM pg_temp.as_postgres();
    -- super_admin es global; sus membresías conservan un rol organizacional válido.
    SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('AUTO_' || v_role,
      CASE WHEN v_role = 'super_admin' THEN 'admin_org' ELSE v_role END);
    IF v_role = 'super_admin' THEN
      UPDATE public.user_roles SET role = 'super_admin'::public.app_role
        WHERE user_id IN (fx.admin_a, fx.admin_b);
      PERFORM pg_temp.cxp_assert((SELECT count(*) = 2 FROM public.user_roles
        WHERE user_id IN (fx.admin_a, fx.admin_b) AND role = 'super_admin'::public.app_role),
        'fixture de plataforma conserva super_admin global');
      INSERT INTO public.super_admin_org_activa(user_id, organization_id)
        VALUES (fx.admin_a, fx.org_a);
    END IF;
    v_id := pg_temp.cxp_fixture(fx.org_a, fx.admin_a);
    SELECT updated_at INTO STRICT v_version FROM public.proveedor_facturas WHERE id = v_id;
    SELECT count(*) INTO v_payments FROM public.pagos_proveedor WHERE proveedor_factura_id = v_id;
    PERFORM pg_temp.as_user(fx.admin_a);
    v_row := public.aprobar_factura_proveedor(v_id, true, 'Gasto administrativo sintético', v_version);
    PERFORM pg_temp.cxp_assert(v_row.estado_aprobacion = 'aprobada'
      AND v_row.created_by = fx.admin_a AND v_row.aprobada_por = fx.admin_a
      AND v_row.aprobada_at IS NOT NULL, v_role || ': estado y actores conservados');
    PERFORM pg_temp.as_postgres();
    PERFORM pg_temp.cxp_assert((SELECT count(*) = 1 FROM public.bitacora_actividad
      WHERE entidad_id = v_id AND accion = 'aprobar_factura_proveedor'
      AND usuario_id = fx.admin_a AND fuente_evento = 'rpc_aprobar_factura_proveedor'),
      v_role || ': exactamente un evento del actor real');
    PERFORM pg_temp.cxp_assert((SELECT count(*) = v_payments FROM public.pagos_proveedor
      WHERE proveedor_factura_id = v_id), v_role || ': aprobación no crea pagos');
  END LOOP;

  PERFORM pg_temp.as_postgres();
  SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('AUTO_CONTADOR_CASOS', 'contador');
  v_id := pg_temp.cxp_fixture(fx.org_a, fx.admin_b);
  SELECT updated_at INTO STRICT v_version FROM public.proveedor_facturas WHERE id = v_id;
  PERFORM pg_temp.as_user(fx.admin_a);
  v_row := public.aprobar_factura_proveedor(v_id, true, 'Gasto administrativo sintético', v_version);
  PERFORM pg_temp.cxp_assert(v_row.created_by = fx.admin_b AND v_row.aprobada_por = fx.admin_a,
    'contador conserva aprobación de captura ajena');
  -- Repetición: usa la nueva versión para llegar al guard de estado, sin duplicar.
  PERFORM pg_temp.cxp_expect_error(format('SELECT public.aprobar_factura_proveedor(%L,true,%L,%L)',
    v_id, 'Gasto administrativo sintético', v_row.updated_at), 'P0001', 'La factura ya fue %');

  PERFORM pg_temp.as_postgres();
  v_id := pg_temp.cxp_fixture(fx.org_a, fx.admin_a);
  SELECT updated_at, to_jsonb(f) INTO STRICT v_version, v_before FROM public.proveedor_facturas f WHERE id = v_id;
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM pg_temp.cxp_expect_error(format('SELECT public.aprobar_factura_proveedor(%L,true,%L,NULL)',
    v_id, 'Gasto administrativo sintético'), 'PT409', 'LC_CONFLICTO_CONCURRENCIA:%');
  PERFORM pg_temp.cxp_expect_error(format('SELECT public.aprobar_factura_proveedor(%L,true,%L,%L)',
    v_id, 'Gasto administrativo sintético', v_version - interval '1 second'), 'PT409', 'LC_CONFLICTO_CONCURRENCIA:%');
  PERFORM pg_temp.cxp_expect_error(format('SELECT public.aprobar_factura_proveedor(%L,false,%L,%L)',
    v_id, '', v_version), 'P0001', 'Motivo de rechazo requerido');
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.cxp_assert((SELECT to_jsonb(f) = v_before FROM public.proveedor_facturas f WHERE id = v_id),
    'CAS y rechazo sin motivo no mutan factura');
  PERFORM pg_temp.as_user(fx.admin_a);
  v_row := public.aprobar_factura_proveedor(v_id, false, 'Rechazo sintético', v_version);
  PERFORM pg_temp.cxp_assert(v_row.estado_aprobacion = 'rechazada' AND v_row.created_by = fx.admin_a
    AND v_row.aprobada_por = fx.admin_a AND v_row.motivo_rechazo = 'Rechazo sintético',
    'rechazo de captura propia conserva motivo y actor');

  -- Membresía sigue exigida aunque el actor sea creador.
  PERFORM pg_temp.as_postgres();
  v_id := pg_temp.cxp_fixture(fx.org_b, fx.admin_a);
  SELECT updated_at INTO STRICT v_version FROM public.proveedor_facturas WHERE id = v_id;
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM pg_temp.cxp_expect_error(format('SELECT public.aprobar_factura_proveedor(%L,true,%L,%L)',
    v_id, 'Gasto administrativo sintético', v_version), '42501', 'Factura no encontrada');
  -- El contador ya miembro de org_b aprueba; no se crea una segunda membresía para org_a.
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.as_user(fx.admin_b);
  v_row := public.aprobar_factura_proveedor(v_id, true, 'Gasto administrativo sintético', v_version);
  PERFORM pg_temp.cxp_assert(v_row.estado_aprobacion = 'aprobada'
    AND v_row.created_by = fx.admin_a AND v_row.aprobada_por = fx.admin_b,
    'contador miembro de org_b aprueba captura ajena conservando ambos actores');

  PERFORM pg_temp.as_postgres();
  v_id := pg_temp.cxp_fixture(fx.org_a, fx.admin_a, false);
  SELECT updated_at INTO STRICT v_version FROM public.proveedor_facturas WHERE id = v_id;
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM pg_temp.cxp_expect_error(format('SELECT public.aprobar_factura_proveedor(%L,true,%L,%L)',
    v_id, 'Gasto administrativo sintético', v_version), 'P0001', 'LC_CXP_SIN_CONCEPTOS:%');
  PERFORM pg_temp.cxp_expect_error(format('SELECT public.aprobar_factura_proveedor(%L,true,%L,%L)',
    gen_random_uuid(), 'Gasto administrativo sintético', v_version), '42501', 'Factura no encontrada');
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM pg_temp.as_authenticated_sin_uid();
  PERFORM pg_temp.cxp_expect_error(format('SELECT public.aprobar_factura_proveedor(%L,true,%L,%L)',
    v_id, 'Gasto administrativo sintético', v_version), 'P0001', 'No autenticado');

  -- El gate general no se amplía: estos roles siguen rechazados.
  FOREACH v_role IN ARRAY ARRAY['auxiliar_contable','tesorero','vendedor'] LOOP
    PERFORM pg_temp.as_postgres();
    SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('AUTO_DENY_' || v_role, v_role);
    v_id := pg_temp.cxp_fixture(fx.org_a, fx.admin_a);
    SELECT updated_at INTO STRICT v_version FROM public.proveedor_facturas WHERE id = v_id;
    PERFORM pg_temp.as_user(fx.admin_a);
    PERFORM pg_temp.cxp_expect_error(format('SELECT public.aprobar_factura_proveedor(%L,true,%L,%L)',
      v_id, 'Gasto administrativo sintético', v_version), 'P0001', 'LC_SOD_VIOLATION: Tu rol no puede aprobar%');
  END LOOP;
  PERFORM pg_temp.as_postgres();
  RAISE NOTICE 'PASS CxP contador: autoaprobación, otros creadores, roles, membresía, CAS, validación, rechazo, actores y pagos';
END;
$test$;

DO $alcance$
DECLARE
  fx record;
  v_revisor record;
  v_factura uuid;
  v_factura_pagada uuid;
  v_version_factura timestamptz;
  v_version_pago timestamptz;
  v_antes_factura jsonb;
  v_antes_pago jsonb;
  v_antes_movimiento jsonb;
  v_cuenta uuid := gen_random_uuid();
  v_fecha date := public.fecha_negocio_mx();
  v_pago uuid;
  v_movimiento uuid;
  v_resultado jsonb;
BEGIN
  SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('CT077079', 'contador');
  SELECT * INTO STRICT v_revisor FROM pg_temp.seed_org_pair('CT079_TESORERO', 'tesorero');
  UPDATE public.organization_members SET organization_id = fx.org_b
    WHERE organization_id = v_revisor.org_a AND user_id = v_revisor.admin_a;
  UPDATE public.user_roles SET role = 'super_admin' WHERE user_id = fx.admin_a;

  v_factura := pg_temp.cxp_fixture(fx.org_b, fx.admin_b);
  v_factura_pagada := pg_temp.cxp_fixture(fx.org_b, fx.admin_b);
  SELECT updated_at, to_jsonb(f) INTO STRICT v_version_factura, v_antes_factura
    FROM public.proveedor_facturas f WHERE f.id = v_factura;
  INSERT INTO public.cuentas_bancarias(id, organization_id, alias, moneda, saldo_inicial, fecha_saldo_inicial)
    VALUES (v_cuenta, fx.org_b, 'Banco sintético CT-079', 'MXN', 100, v_fecha - 10);

  PERFORM pg_temp.as_user(fx.admin_b);
  PERFORM pg_temp.cxp_assert(public.org_scope() = fx.org_b, 'contador opera en B');
  PERFORM public.aprobar_factura_proveedor(v_factura_pagada, true, 'Gasto sintético',
    (SELECT updated_at FROM public.proveedor_facturas WHERE id = v_factura_pagada));
  v_resultado := public.registrar_pago_proveedor_atomico(v_factura_pagada, v_fecha, 20, 'MXN',
    'Transferencia', 'CT079-ORIGINAL', v_cuenta, '', 1, NULL, gen_random_uuid());
  v_pago := (v_resultado->>'pago_id')::uuid;
  v_movimiento := (v_resultado->>'movimiento_id')::uuid;

  PERFORM pg_temp.as_postgres();
  SELECT updated_at, to_jsonb(p) INTO STRICT v_version_pago, v_antes_pago
    FROM public.pagos_proveedor p WHERE p.id = v_pago;
  SELECT to_jsonb(m) INTO STRICT v_antes_movimiento
    FROM public.bbva_movimientos m WHERE m.id = v_movimiento
      AND m.pago_proveedor_id = v_pago AND m.cargo = 20 AND m.deleted_at IS NULL;
  UPDATE public.organization_members SET role = 'viewer'
    WHERE organization_id = fx.org_b AND user_id = fx.admin_b;
  -- Simular un espejo global desactualizado después de la sincronización.
  INSERT INTO public.user_roles(user_id, role) VALUES (fx.admin_b, 'contador')
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  PERFORM pg_temp.cxp_assert((SELECT role = 'contador' FROM public.user_roles WHERE user_id = fx.admin_b),
    'la cuenta de B conserva contador global');

  PERFORM pg_temp.as_user(fx.admin_b);
  PERFORM pg_temp.cxp_assert(public.org_scope() = fx.org_b, 'viewer mantiene organización activa B');
  PERFORM pg_temp.cxp_assert(public.has_any_role_in_org_exact(auth.uid(), ARRAY['viewer']::public.app_role[], fx.org_b),
    'la cuenta de B tiene el rol local viewer');
  PERFORM pg_temp.cxp_expect_error(format('SELECT public.aprobar_factura_proveedor(%L,true,%L,%L)',
    v_factura, 'Gasto sintético', v_version_factura), 'P0001', 'LC_SOD_VIOLATION:%');
  PERFORM pg_temp.cxp_expect_error(format(
    'SELECT public.actualizar_pago_proveedor_atomico(%L,%L,20,%L,1,%L,%L,%L,%L,NULL,%L)',
    v_pago, v_fecha, 'MXN', 'Transferencia', 'CT079-DENEGADO', v_cuenta, '', v_version_pago),
    '42501', 'LC_PAGO_SIN_PERMISO:%');

  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM public.set_super_admin_org(fx.org_a);
  PERFORM pg_temp.cxp_assert(public.org_scope() = fx.org_a, 'super admin selecciona A');
  PERFORM pg_temp.cxp_expect_error(format('SELECT public.aprobar_factura_proveedor(%L,true,%L,%L)',
    v_factura, 'Gasto sintético', v_version_factura), '42501', 'Factura no encontrada');

  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.cxp_assert((SELECT to_jsonb(f) = v_antes_factura FROM public.proveedor_facturas f WHERE f.id = v_factura)
    AND NOT EXISTS (SELECT FROM public.bitacora_actividad WHERE entidad_id = v_factura
      AND accion = 'aprobar_factura_proveedor'), 'CT-077 y CT-078 conservan factura y bitácora');
  PERFORM pg_temp.cxp_assert((SELECT to_jsonb(p) = v_antes_pago FROM public.pagos_proveedor p WHERE p.id = v_pago)
    AND (SELECT to_jsonb(m) = v_antes_movimiento FROM public.bbva_movimientos m WHERE m.id = v_movimiento)
    AND (SELECT count(*) = 1 FROM public.bbva_movimientos WHERE pago_proveedor_id = v_pago),
    'CT-079 conserva el pago y su único cargo original');

  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM public.set_super_admin_org(fx.org_b);
  PERFORM pg_temp.cxp_assert(public.org_scope() = fx.org_b, 'super admin selecciona B');
  PERFORM public.aprobar_factura_proveedor(v_factura, true, 'Gasto sintético', v_version_factura);
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.cxp_assert((SELECT estado_aprobacion = 'aprobada' AND aprobada_por = fx.admin_a
    FROM public.proveedor_facturas WHERE id = v_factura), 'CT-078 aprueba después de seleccionar la organización de la factura');

  PERFORM pg_temp.as_user(v_revisor.admin_a);
  PERFORM pg_temp.cxp_assert(public.org_scope() = fx.org_b, 'tesorero opera en B');
  v_resultado := public.actualizar_pago_proveedor_atomico(v_pago, v_fecha, 20, 'MXN',
    1, 'Transferencia', 'CT079-AUTORIZADO', v_cuenta, '', NULL, v_version_pago);
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.cxp_assert((v_resultado->>'pago_id')::uuid = v_pago
    AND (SELECT referencia = 'CT079-AUTORIZADO' FROM public.pagos_proveedor WHERE id = v_pago)
    AND (SELECT count(*) = 1 AND sum(cargo) = 20 FROM public.bbva_movimientos
      WHERE pago_proveedor_id = v_pago AND deleted_at IS NULL),
    'tesorero edita el pago y conserva un único cargo activo');
  RAISE NOTICE 'PASS CT-077, CT-078 y CT-079: rol efectivo, organización activa y edición legítima';
END;
$alcance$;
ROLLBACK;
