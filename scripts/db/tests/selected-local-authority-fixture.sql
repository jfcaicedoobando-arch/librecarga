-- Complemento temporal del fixture anterior; no se usa sobre datos reales.
\ir selected-readers-security-fixture.sql
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000004','otraautoridad@example.test'),
 ('00000000-0000-0000-0000-000000000005','contabilidad@example.test'),
 ('00000000-0000-0000-0000-000000000006','tesoreria@example.test');
INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000004','customer_service'),
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000005','contador'),
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000006','tesorero');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('00000000-0000-0000-0000-000000000004','admin_org'),
 ('00000000-0000-0000-0000-000000000006','admin_org') ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
INSERT INTO public.cotizaciones(id,folio,modo,tipo,organization_id,es_prospecto,prospecto_empresa,created_by) VALUES
 ('00000000-0000-0000-0000-000000000062','TEST-COT','Marítimo','Importación','00000000-0000-0000-0000-000000000010',true,'Empresa de prueba','00000000-0000-0000-0000-000000000001');
INSERT INTO public.cotizacion_costos(id,cotizacion_id,concepto,moneda,costo_unitario,precio_venta,organization_id) VALUES
 ('00000000-0000-0000-0000-000000000063','00000000-0000-0000-0000-000000000062','Servicio','MXN',100,150,'00000000-0000-0000-0000-000000000010');
INSERT INTO public.cotizacion_costos_historico(cotizacion_id,version,organization_id,origen_costo_id,concepto,costo_unitario,costo_total,precio_venta,precio_total,moneda) VALUES
 ('00000000-0000-0000-0000-000000000062',0,'00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000063','Servicio histórico',100,100,150,150,'MXN');
INSERT INTO public.conceptos_venta(id,embarque_id,organization_id,descripcion,precio_unitario,total,moneda,aplica_iva,tasa_iva_aplicada,tipo_iva) VALUES
 ('00000000-0000-0000-0000-000000000064','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000010','Servicio no objeto',100,100,'MXN',false,0,'no_objeto');