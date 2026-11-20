\set ON_ERROR_STOP on
-- Fixture focalizada: ejecuta la candidata literal, no reconstruye el ERP ni utiliza la base activa.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TYPE public.app_role AS ENUM('super_admin','admin','admin_org','gerente_visor','gerente_comercial',
  'gerente_operaciones','coordinador_logistico','customer_service','ejecutivo_pricing','vendedor',
  'operador','contador','tesorero','auxiliar_contable','ejecutivo_cobranza','viewer','broker','cliente');
CREATE TABLE public.embarques(id uuid PRIMARY KEY, organization_id uuid NOT NULL, estado text,
  cliente_id uuid, cliente_nombre text, tipo_cambio_usd numeric, tipo_cambio_eur numeric, deleted_at timestamptz);
CREATE TABLE public.conceptos_venta(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), embarque_id uuid REFERENCES embarques,
  moneda text, cantidad numeric, precio_unitario numeric, total numeric, deleted_at timestamptz);
CREATE TABLE public.conceptos_costo(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), embarque_id uuid REFERENCES embarques,
  moneda text, monto numeric, proveedor_nombre text, deleted_at timestamptz);
CREATE TABLE public.configuracion(organization_id uuid, categoria text, clave text, valor jsonb);
CREATE TABLE public.organization_members(organization_id uuid, user_id uuid, role public.app_role);
CREATE TABLE public.bitacora_actividad(organization_id uuid, usuario_id uuid, modulo text, accion text, entidad_id uuid, detalles jsonb);
CREATE TABLE public.notificaciones_internas(organization_id uuid, usuario_id uuid, tipo text, titulo text,
  mensaje text, enlace text, entidad_tipo text, entidad_id uuid);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('test.uid')::uuid $$;
CREATE FUNCTION public.org_scope() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('test.org')::uuid $$;
CREATE FUNCTION public.has_any_role_in_org_exact(u uuid, roles public.app_role[], org uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id=u AND organization_id=org AND role=ANY(roles)) $$;
CREATE FUNCTION public._assert_writer(org uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF org IS DISTINCT FROM org_scope() OR NOT has_any_role_in_org_exact(auth.uid(),
 ARRAY['admin','admin_org','coordinador_logistico','gerente_comercial']::public.app_role[],org) THEN
 RAISE EXCEPTION 'no writer' USING ERRCODE='42501'; END IF;
END $$;
GRANT USAGE ON SCHEMA auth, public TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.embarques,public.conceptos_venta,public.conceptos_costo TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;
CREATE FUNCTION public.test_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION public.test_rejected(command text, expected_state text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
   IF SQLSTATE=expected_state THEN RAISE NOTICE 'PASS: %',label; RETURN; END IF; RAISE;
 END; RAISE EXCEPTION 'FAIL: % did not reject',label;
END $$;
\ir ../../../docs/releases/embarque-margen/0083_embarque_margen_borrador.sql
INSERT INTO organization_members VALUES
 ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','coordinador_logistico'),
 ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','admin_org'),
 ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','admin'),
 ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004','admin_org');
INSERT INTO configuracion VALUES('00000000-0000-0000-0000-000000000001','comercial','margen_minimo_utilidad_pct','9');
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000001',false),set_config('test.org','00000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
BEGIN;
INSERT INTO embarques VALUES('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
 'Borrador',NULL,'Cliente de prueba',NULL,NULL,NULL);
INSERT INTO conceptos_venta(embarque_id,moneda,cantidad,precio_unitario,total)
 VALUES('20000000-0000-0000-0000-000000000001','USD',1,9800,123456);
INSERT INTO conceptos_costo(embarque_id,moneda,monto,proveedor_nombre)
 VALUES('20000000-0000-0000-0000-000000000001','USD',9445,'Hapag-Lloyd');
COMMIT;
SELECT test_assert((SELECT estado='Borrador' FROM embarques),'coordinador guarda borrador bajo 9%');
SELECT test_assert(consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000001')->>'estado'='pendiente','solicitud automática pendiente');
SELECT test_assert((consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000001')->'snapshot'->>'margen_pct')::numeric=3.62,'margen 355/9800 = 3.62%, no usa total fiscal enviado');
SELECT test_rejected($cmd$UPDATE embarques SET estado='Confirmado'$cmd$,'P0001','coordinador no inicia operaciones sin aprobación');
SELECT test_rejected($cmd$UPDATE embarques SET estado='En Tránsito'$cmd$,'P0001','no permite saltar a otro estado operativo');
SELECT test_rejected($cmd$SELECT aprobar_margen_embarque('20000000-0000-0000-0000-000000000001',
 consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000001')->'snapshot','Caso especial aprobado')$cmd$,'42501','coordinador no aprueba');
SELECT test_rejected($cmd$UPDATE embarque_aprobaciones_margen SET autorizada_at=now()$cmd$,'42501','API directa no puede falsificar aprobación');
SELECT solicitar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000001');
RESET ROLE;
SELECT test_assert((SELECT count(*)=2 FROM notificaciones_internas),'dos administradores propios notificados una vez');
SELECT test_assert(NOT EXISTS(SELECT 1 FROM notificaciones_internas WHERE organization_id='00000000-0000-0000-0000-000000000002'),'ningún aviso a otra organización');
-- Datos operativos/proveedor y FX sin uso no invalidan ni duplican avisos.
SET ROLE authenticated;
UPDATE conceptos_costo SET proveedor_nombre='Nombre normalizado';
UPDATE embarques SET tipo_cambio_usd=20;
RESET ROLE;
SELECT test_assert((SELECT count(*)=2 FROM notificaciones_internas),'hidratar proveedor/FX no utilizado no duplica aviso');
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000004',false),set_config('test.org','00000000-0000-0000-0000-000000000002',false);
SET ROLE authenticated;
SELECT test_rejected($cmd$SELECT consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000001')$cmd$,'42501','lectura ajena bloqueada');
SELECT test_rejected($cmd$SELECT solicitar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000001')$cmd$,'42501','solicitud ajena bloqueada');
SELECT test_rejected($cmd$SELECT aprobar_margen_embarque('20000000-0000-0000-0000-000000000001','{}','Caso especial aprobado')$cmd$,'42501','administrador ajeno no aprueba');
RESET ROLE;
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000002',false),set_config('test.org','00000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
SELECT test_rejected($cmd$SELECT aprobar_margen_embarque('20000000-0000-0000-0000-000000000001',
 consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000001')->'snapshot','corto')$cmd$,'22023','motivo insuficiente rechazado');
SELECT aprobar_margen_embarque('20000000-0000-0000-0000-000000000001',
 consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000001')->'snapshot','Caso especial aprobado');
SELECT aprobar_margen_embarque('20000000-0000-0000-0000-000000000001',
 consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000001')->'snapshot','Caso especial aprobado');
RESET ROLE;
SELECT test_assert((SELECT count(*)=1 FROM bitacora_actividad WHERE accion='Aprobó margen de borrador'),'reintento no duplica autorización');
SELECT test_assert((SELECT count(*)=1 FROM notificaciones_internas WHERE tipo='embarque_margen_aprobado'),'coordinador notificado una vez');
CREATE TEMP TABLE aprobada AS SELECT snapshot FROM embarque_aprobaciones_margen;
GRANT SELECT ON aprobada TO authenticated;
SET ROLE authenticated;
UPDATE conceptos_costo SET proveedor_nombre='Hapag-Lloyd';
SELECT test_assert(consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000001')->>'estado'='aprobada','aprobación conserva hidratación');
-- Cambiar venta y costo juntos preservando porcentaje SÍ requiere una nueva versión.
BEGIN;
UPDATE conceptos_venta SET precio_unitario=19600;
UPDATE conceptos_costo SET monto=18890;
COMMIT;
SELECT test_assert(consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000001')->>'estado'='pendiente','mismo porcentaje con importes distintos invalida');
SELECT test_rejected($cmd$SELECT aprobar_margen_embarque('20000000-0000-0000-0000-000000000001',(SELECT snapshot FROM aprobada),'Caso especial aprobado')$cmd$,'40001','snapshot obsoleto rechazado');
RESET ROLE;
SELECT test_assert((SELECT count(*)=1 FROM bitacora_actividad WHERE accion='Invalidó autorización de margen'),'historia de aprobación anterior conservada');
SELECT test_assert((SELECT count(*)=4 FROM notificaciones_internas WHERE tipo='embarque_margen_por_autorizar'),'un aviso nuevo por administrador, no por cada partida');
-- Revertir importes no revive la aprobación anterior.
SET ROLE authenticated;
BEGIN; UPDATE conceptos_venta SET precio_unitario=9800; UPDATE conceptos_costo SET monto=9445; COMMIT;
SELECT test_assert(consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000001')->>'estado'='pendiente','volver a importes viejos no revive autorización');
SELECT aprobar_margen_embarque('20000000-0000-0000-0000-000000000001',
 consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000001')->'snapshot','Caso especial aprobado');
-- Cambios posteriores al avance en la misma transacción no pueden evadir el guard.
SELECT test_rejected($cmd$DO $body$ BEGIN
 UPDATE embarques SET estado='Confirmado'; UPDATE conceptos_costo SET monto=9700;
 SET CONSTRAINTS ALL IMMEDIATE;
END $body$$cmd$,'P0001','guard diferido impide avance seguido de cambio de importes');
UPDATE embarques SET estado='Confirmado';
SELECT test_assert((SELECT count(*)=1 AND min(estado)='Confirmado' FROM embarques),'se confirma el mismo embarque aprobado, sin duplicarlo');
-- Activos históricos mantienen su flujo previo: nuevo candado es de inicio, no de ediciones operativas.
UPDATE conceptos_costo SET monto=9700;
SELECT test_assert((SELECT estado='Confirmado' FROM embarques),'no cambia estado de embarque ya operativo');
RESET ROLE;
-- Moneda única MXN no solicita FX, margen igual al umbral no exige autorización.
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
BEGIN;
INSERT INTO embarques VALUES('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Borrador',NULL,'MXN',NULL,NULL,NULL);
INSERT INTO conceptos_venta(embarque_id,moneda,cantidad,precio_unitario) VALUES('20000000-0000-0000-0000-000000000002','MXN',1,100);
INSERT INTO conceptos_costo(embarque_id,moneda,monto) VALUES('20000000-0000-0000-0000-000000000002','MXN',91);
COMMIT;
SELECT test_assert(consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000002')->>'estado'='no_requerida','9% exacto no exige aprobación; MXN sin conversión');
UPDATE embarques SET estado='Confirmado' WHERE id='20000000-0000-0000-0000-000000000002';
-- Mixto sin FX puede guardarse borrador, nunca aprobarse ni confirmarse.
BEGIN;
INSERT INTO embarques VALUES('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Borrador',NULL,'Mixto',NULL,NULL,NULL);
INSERT INTO conceptos_venta(embarque_id,moneda,cantidad,precio_unitario) VALUES('20000000-0000-0000-0000-000000000003','USD',1,100);
INSERT INTO conceptos_costo(embarque_id,moneda,monto) VALUES('20000000-0000-0000-0000-000000000003','MXN',1900);
COMMIT;
SELECT test_assert((consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000003')->'snapshot'->>'calculable')::boolean=false,'mixto sin FX no calcula margen inventado');
SELECT test_rejected($cmd$UPDATE embarques SET estado='Confirmado' WHERE id='20000000-0000-0000-0000-000000000003'$cmd$,'P0001','mixto sin FX no inicia');
UPDATE embarques SET tipo_cambio_usd=20 WHERE id='20000000-0000-0000-0000-000000000003';
RESET ROLE;
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000002',false);
SET ROLE authenticated;
SELECT aprobar_margen_embarque('20000000-0000-0000-0000-000000000003',
 consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000003')->'snapshot','Caso especial aprobado');
UPDATE embarques SET tipo_cambio_usd=19.5 WHERE id='20000000-0000-0000-0000-000000000003';
SELECT test_assert(consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000003')->>'estado'='pendiente','cambio de FX utilizado invalida autorización');
RESET ROLE;
SELECT test_assert(NOT has_function_privilege('authenticated','public._embarque_solicitar_margen(uuid)','execute'),'helper privado no ejecutable por usuarios');
SELECT test_assert(NOT has_function_privilege('anon','public.aprobar_margen_embarque(uuid,jsonb,text)','execute'),'anon no aprueba');
SELECT test_assert((SELECT relrowsecurity FROM pg_class WHERE oid='public.embarque_aprobaciones_margen'::regclass),'RLS activa');
-- Error de notificación: revierte el guardado completo, no deja cambios sin solicitud.
SET ROLE authenticated;
SELECT aprobar_margen_embarque('20000000-0000-0000-0000-000000000003',
 consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000003')->'snapshot','Caso especial aprobado');
RESET ROLE;
CREATE FUNCTION public.test_fail_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'notificación de prueba falló' USING ERRCODE='23514'; END $$;
CREATE TRIGGER test_fail_notification BEFORE INSERT ON notificaciones_internas FOR EACH ROW EXECUTE FUNCTION test_fail_notification();
SET ROLE authenticated;
SELECT test_rejected($cmd$DO $body$ BEGIN
 UPDATE conceptos_costo SET monto=1940 WHERE embarque_id='20000000-0000-0000-0000-000000000003';
 SET CONSTRAINTS ALL IMMEDIATE;
END $body$$cmd$,'23514','falla del aviso revierte guardado');
SELECT test_assert((SELECT monto=1900 FROM conceptos_costo WHERE embarque_id='20000000-0000-0000-0000-000000000003'),'costo previo se conserva al fallar aviso');
SELECT test_assert(consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000003')->>'estado'='aprobada','aprobación previa se conserva al fallar guardado');
RESET ROLE;
DROP TRIGGER test_fail_notification ON notificaciones_internas;
-- No dar costos ni aprobación a portales externos ni soporte sólo por tener membresía.
INSERT INTO organization_members VALUES
 ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','customer_service'),
 ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006','broker');
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000005',false);
SET ROLE authenticated;
SELECT test_rejected($cmd$SELECT consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000003')$cmd$,'42501','soporte no recibe costos internos');
RESET ROLE;
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000006',false);
SET ROLE authenticated;
SELECT test_rejected($cmd$SELECT consultar_aprobacion_margen_embarque('20000000-0000-0000-0000-000000000003')$cmd$,'42501','broker no recibe costos internos');
RESET ROLE;
