-- Sólo base local aislada con esquema real; revierte todos los registros.
-- psql -v candidate=/ruta/al/ajuste.sql -f scripts/db/tests/selected-shipment-activity-access.sql
BEGIN;
\ir selected-readers-security-fixture.sql
INSERT INTO public.bitacora_actividad(id,organization_id,usuario_id,accion,modulo,entidad_nombre,detalles) VALUES
 ('00000000-0000-0000-0000-000000000080','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','nota','embarques','ELIMP00001','{"origen":"propio"}'),
 ('00000000-0000-0000-0000-000000000090','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','nota','embarques','ELIMP00001','{"origen":"ajeno"}');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE activity_before AS SELECT * FROM public.actividad_embarque('00000000-0000-0000-0000-000000000012');
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM activity_before WHERE id='bit-00000000-0000-0000-0000-000000000090') THEN RAISE EXCEPTION 'No reprodujo el cruce de expedientes'; END IF;
END $$;
\i :candidate
SET LOCAL ROLE authenticated;
-- 1. El folio igual de otra empresa no arrastra su actividad.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.actividad_embarque('00000000-0000-0000-0000-000000000012') WHERE id='bit-00000000-0000-0000-0000-000000000090') THEN RAISE EXCEPTION 'Historial de empresa ajena'; END IF;
END $$;
-- 2. Se conserva íntegramente cada registro autorizado anterior.
DO $$ BEGIN
 IF EXISTS(
  (SELECT * FROM activity_before WHERE id<>'bit-00000000-0000-0000-0000-000000000090'
   EXCEPT SELECT * FROM public.actividad_embarque('00000000-0000-0000-0000-000000000012'))
  UNION ALL
  (SELECT * FROM public.actividad_embarque('00000000-0000-0000-0000-000000000012')
   EXCEPT SELECT * FROM activity_before WHERE id<>'bit-00000000-0000-0000-0000-000000000090')
 ) THEN RAISE EXCEPTION 'Cambió el historial autorizado'; END IF;
END $$;
RESET ROLE;
-- 3. La otra empresa conserva su registro propio cuando se vincula por ID.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.bitacora_actividad SET entidad_id='00000000-0000-0000-0000-000000000022' WHERE id='00000000-0000-0000-0000-000000000090';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.actividad_embarque('00000000-0000-0000-0000-000000000022') WHERE id='bit-00000000-0000-0000-0000-000000000090') THEN RAISE EXCEPTION 'La otra empresa perdió su registro'; END IF;
 IF EXISTS(SELECT 1 FROM public.actividad_embarque('00000000-0000-0000-0000-000000000022') WHERE id='bit-00000000-0000-0000-0000-000000000080') THEN RAISE EXCEPTION 'La otra empresa recibió un registro ajeno'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo '3 verificaciones focalizadas del historial: OK'