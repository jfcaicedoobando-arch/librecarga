-- Verifica el registro real de la modificación operativa, sin la base activa.
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000002',false),set_config('test.org','00000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
SELECT test_assert(consultar_etiquetas_margen_embarques(ARRAY['20000000-0000-0000-0000-000000000001']::uuid[])
  ->'20000000-0000-0000-0000-000000000001'->>'autorizada_por'='10000000-0000-0000-0000-000000000002','cambio operativo guarda quién autorizó');
SELECT test_assert(consultar_etiquetas_margen_embarques(ARRAY['20000000-0000-0000-0000-000000000001']::uuid[])
  ->'20000000-0000-0000-0000-000000000001'->>'autorizada_email'='administracion@example.test','correo verificado guardado al autorizar');
SELECT test_assert((consultar_etiquetas_margen_embarques(ARRAY['20000000-0000-0000-0000-000000000001']::uuid[])
  ->'20000000-0000-0000-0000-000000000001'->>'vigente')::boolean,'etiqueta conserva autorización vigente tras iniciar operaciones');
SELECT test_assert(consultar_etiquetas_margen_embarques(ARRAY['20000000-0000-0000-0000-000000000002']::uuid[])='{}','margen 9% igual al mínimo no se etiqueta');
RESET ROLE;
CREATE TEMP TABLE autor_previo AS SELECT autorizada_por,autorizada_at FROM embarque_aprobaciones_margen WHERE embarque_id='20000000-0000-0000-0000-000000000001';
GRANT SELECT ON autor_previo TO authenticated;
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
UPDATE conceptos_costo SET proveedor_nombre='Nombre operativo' WHERE embarque_id='20000000-0000-0000-0000-000000000001';
SELECT test_rejected($cmd$DO $body$ BEGIN
 UPDATE conceptos_costo SET monto=9790 WHERE embarque_id='20000000-0000-0000-0000-000000000001'; SET CONSTRAINTS ALL IMMEDIATE;
 END $body$$cmd$,'P0001','coordinación no se registra como autorizador de cambios operativos');
SELECT test_assert((SELECT monto=9700 FROM conceptos_costo WHERE embarque_id='20000000-0000-0000-0000-000000000001'),'rechazo revierte importe operativo');
RESET ROLE;
SELECT test_assert((SELECT a.autorizada_por=p.autorizada_por AND a.autorizada_at=p.autorizada_at
  FROM embarque_aprobaciones_margen a CROSS JOIN autor_previo p WHERE a.embarque_id='20000000-0000-0000-0000-000000000001'),'datos no monetarios conservan autor y fecha');
SELECT test_assert(EXISTS(SELECT 1 FROM bitacora_actividad WHERE accion='Autorizó cambio de margen operativo'
  AND usuario_id='10000000-0000-0000-0000-000000000002' AND detalles->>'autorizada_por'='10000000-0000-0000-0000-000000000002'),'bitácora conserva la autorización anterior');
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000003',false);
SET ROLE authenticated;
BEGIN;
UPDATE conceptos_venta SET precio_unitario=200 WHERE embarque_id='20000000-0000-0000-0000-000000000002';
UPDATE conceptos_costo SET monto=192 WHERE embarque_id='20000000-0000-0000-0000-000000000002';
COMMIT;
SELECT test_assert(consultar_etiquetas_margen_embarques(ARRAY['20000000-0000-0000-0000-000000000002']::uuid[])
  ->'20000000-0000-0000-0000-000000000002'->>'autorizada_por'='10000000-0000-0000-0000-000000000003','nuevo cambio con 4% bajo 9% registra al nuevo administrador');
RESET ROLE;
SELECT test_assert((SELECT count(*)=1 FROM bitacora_actividad WHERE accion='Autorizó cambio de margen operativo'
  AND entidad_id='20000000-0000-0000-0000-000000000002'),'dos partidas generan una sola autorización del estado final');
SET ROLE authenticated;
UPDATE conceptos_costo SET monto=180 WHERE embarque_id='20000000-0000-0000-0000-000000000002';
SELECT test_assert(consultar_etiquetas_margen_embarques(ARRAY['20000000-0000-0000-0000-000000000002']::uuid[])='{}','margen actual 10% elimina etiqueta de excepción vigente');
RESET ROLE;
SELECT test_assert(EXISTS(SELECT 1 FROM bitacora_actividad WHERE accion='Actualizó margen operativo'
  AND entidad_id='20000000-0000-0000-0000-000000000002' AND detalles->>'autorizada_por'='10000000-0000-0000-0000-000000000003'),'salir del margen bajo conserva quién lo autorizó en historial');
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000004',false),set_config('test.org','00000000-0000-0000-0000-000000000002',false);
SET ROLE authenticated;
SELECT test_assert(consultar_etiquetas_margen_embarques(ARRAY['20000000-0000-0000-0000-000000000001']::uuid[])='{}','no muestra autorizadores ni etiquetas de otra empresa');
RESET ROLE;
SELECT test_assert(NOT has_function_privilege('authenticated','public._embarque_registrar_margen_operativo(uuid)','execute'),'usuarios no ejecutan directamente el registro privado');
SELECT test_assert(NOT has_function_privilege('anon','public.consultar_etiquetas_margen_embarques(uuid[])','execute'),'etiquetas no públicas');