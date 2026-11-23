-- Sólo base local aislada con esquema real; todo se revierte al terminar.
-- psql -v candidate=/ruta/al/ajuste.sql -f scripts/db/tests/selected-helper-access.sql
BEGIN;
\ir selected-readers-security-fixture.sql
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-000000000004','contador@example.test');
INSERT INTO public.organization_members(organization_id,user_id,role)
VALUES ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000004','contador');
INSERT INTO public.cuentas_bancarias(id,organization_id,alias) VALUES
 ('00000000-0000-0000-0000-000000000060','00000000-0000-0000-0000-000000000010','Cuenta A'),
 ('00000000-0000-0000-0000-000000000070','00000000-0000-0000-0000-000000000020','Cuenta B');
INSERT INTO public.catalogo_claves_sat(id,organization_id,patron,clave_sat) VALUES
 ('00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000010','Servicio A','78101800'),
 ('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000020','Servicio B','78101800');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE helper_before AS SELECT
 (SELECT to_jsonb(x) FROM public._lock_cuenta_bancaria('00000000-0000-0000-0000-000000000060') x) AS cuenta,
 (SELECT to_jsonb(x) FROM public.calcular_costo_demoras('00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000031',3) x) AS demora,
 (SELECT to_jsonb(x) FROM public.resolver_producto_sat('00000000-0000-0000-0000-000000000010','Servicio A') x) AS sat;
RESET ROLE;
\i :candidate
SET LOCAL ROLE authenticated;
-- 1–3. Contador mantiene exactamente cuenta, cálculo positivo y catálogo propio.
DO $$ BEGIN
 IF (SELECT to_jsonb(x) FROM public._lock_cuenta_bancaria('00000000-0000-0000-0000-000000000060') x) IS DISTINCT FROM (SELECT cuenta FROM helper_before) THEN RAISE EXCEPTION 'Cambió cuenta propia'; END IF;
 IF (SELECT to_jsonb(x) FROM public.calcular_costo_demoras('00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000031',3) x) IS DISTINCT FROM (SELECT demora FROM helper_before) THEN RAISE EXCEPTION 'Cambió cálculo propio'; END IF;
 IF (SELECT demora->>'total' FROM helper_before)::numeric <> 300 THEN RAISE EXCEPTION 'Fixture sin cálculo positivo'; END IF;
 IF (SELECT to_jsonb(x) FROM public.resolver_producto_sat('00000000-0000-0000-0000-000000000010','Servicio A') x) IS DISTINCT FROM (SELECT sat FROM helper_before) THEN RAISE EXCEPTION 'Cambió SAT propio'; END IF;
END $$;
-- 4–5. Cuenta ajena indistinguible de inexistente y catálogo ajeno vacío.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public._lock_cuenta_bancaria('00000000-0000-0000-0000-000000000070')) OR EXISTS(SELECT 1 FROM public._lock_cuenta_bancaria('ffffffff-ffff-ffff-ffff-ffffffffffff')) THEN RAISE EXCEPTION 'Cuenta ajena visible'; END IF;
 IF EXISTS(SELECT 1 FROM public.resolver_producto_sat('00000000-0000-0000-0000-000000000020','Servicio B')) THEN RAISE EXCEPTION 'SAT ajeno visible'; END IF;
END $$;
-- 6. Desvinculación sólo por las puertas autorizadas, no como RPC directa.
DO $$ BEGIN
 BEGIN
  PERFORM public._cxp_desvincular_por_rechazo('ffffffff-ffff-ffff-ffff-ffffffffffff','prueba');
  RAISE EXCEPTION 'Desvinculación directa habilitada';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- 7. El propietario conserva ejecución para los dos llamadores DEFINER.
CREATE FUNCTION pg_temp.owner_calls_helper() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN
 BEGIN PERFORM public._cxp_desvincular_por_rechazo('ffffffff-ffff-ffff-ffff-ffffffffffff','prueba');
 EXCEPTION WHEN no_data_found THEN RETURN; END;
 RAISE EXCEPTION 'Se esperaba factura inexistente';
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.owner_calls_helper();
RESET ROLE;
-- 8–9. Otro miembro no obtiene cuenta contable ni tabulador de otra empresa.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public._lock_cuenta_bancaria('00000000-0000-0000-0000-000000000060')) THEN RAISE EXCEPTION 'Miembro leyó cuenta ajena'; END IF;
 IF EXISTS(SELECT 1 FROM public.calcular_costo_demoras('00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000031',3) WHERE total<>0 OR desglose<>'[]'::jsonb) THEN RAISE EXCEPTION 'Tabulador ajeno visible'; END IF;
END $$;
RESET ROLE;
-- 10–11. Superadministración conserva empresa activa, no la ajena.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public._lock_cuenta_bancaria('00000000-0000-0000-0000-000000000060')) THEN RAISE EXCEPTION 'Superadmin perdió cuenta propia'; END IF;
 IF EXISTS(SELECT 1 FROM public._lock_cuenta_bancaria('00000000-0000-0000-0000-000000000070')) THEN RAISE EXCEPTION 'Superadmin fuera de empresa activa'; END IF;
 IF EXISTS(SELECT 1 FROM public.resolver_producto_sat('00000000-0000-0000-0000-000000000020','Servicio B')) THEN RAISE EXCEPTION 'Superadmin SAT fuera de empresa activa'; END IF;
END $$;
RESET ROLE;
-- 12. Servicio conserva acceso; visitantes no ejecutan ninguno de los cuatro.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public._lock_cuenta_bancaria('00000000-0000-0000-0000-000000000070')) THEN RAISE EXCEPTION 'Servicio perdió cuenta'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE sig text; BEGIN
 FOREACH sig IN ARRAY ARRAY['public._lock_cuenta_bancaria(uuid)','public._cxp_desvincular_por_rechazo(uuid,text)','public.calcular_costo_demoras(uuid,uuid,integer)','public.resolver_producto_sat(uuid,text)'] LOOP
  IF has_function_privilege('anon',sig,'EXECUTE') THEN RAISE EXCEPTION 'Visitante puede ejecutar %',sig; END IF;
 END LOOP;
END $$;
ROLLBACK;
\echo '12 verificaciones focalizadas de auxiliares: OK'