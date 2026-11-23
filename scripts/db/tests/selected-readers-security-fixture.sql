-- Se usa sólo dentro de una transacción en una base local de pruebas vacía.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000001','operacion@example.test'),
 ('00000000-0000-0000-0000-000000000002','otro@example.test'),
 ('00000000-0000-0000-0000-000000000003','admin@example.test');
INSERT INTO public.organizations(id,nombre) VALUES
 ('00000000-0000-0000-0000-000000000010','Prueba A'),
 ('00000000-0000-0000-0000-000000000020','Prueba B');
INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','coordinador_logistico'),
 ('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','coordinador_logistico');
INSERT INTO public.user_roles(user_id,role) VALUES ('00000000-0000-0000-0000-000000000003','super_admin');
INSERT INTO public.super_admin_org_activa(user_id,organization_id) VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000010');
INSERT INTO public.clientes(id,nombre,email,organization_id) VALUES
 ('00000000-0000-0000-0000-000000000011','Cliente A','clientea@example.test','00000000-0000-0000-0000-000000000010'),
 ('00000000-0000-0000-0000-000000000021','Cliente B','clienteb@example.test','00000000-0000-0000-0000-000000000020');
INSERT INTO public.navieras(id,code,name) VALUES ('00000000-0000-0000-0000-000000000030','TEST','Naviera de prueba');
INSERT INTO public.tipos_contenedor(id,code,name) VALUES ('00000000-0000-0000-0000-000000000031','20TEST','20 TEST');
INSERT INTO public.proveedores(id,nombre,email,tipo,organization_id) VALUES ('00000000-0000-0000-0000-000000000032','Naviera prueba','naviera@example.test','Naviera','00000000-0000-0000-0000-000000000010');
INSERT INTO public.costeo_navieras_condiciones(id,organization_id,naviera_id,proveedor_id,dias_libres_demoras_default,moneda_demoras)
VALUES ('00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000032',2,'MXN');
INSERT INTO public.costeo_naviera_demoras_tarifa(naviera_condicion_id,tipo_contenedor_id,desde_dia,monto_por_dia,moneda,organization_id)
VALUES ('00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000031',1,100,'MXN','00000000-0000-0000-0000-000000000010');
INSERT INTO public.costeo_demoras_venta_tarifa(organization_id,tipo_contenedor_id,desde_dia,monto_por_dia_usd,vigente_desde)
VALUES ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000031',1,20,'2020-01-01');
INSERT INTO public.embarques(id,cliente_id,modo,tipo,organization_id,expediente,estado,naviera) VALUES
 ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000011','Marítimo','Importación','00000000-0000-0000-0000-000000000010','ELIMP00001','Borrador','Naviera de prueba'),
 ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000021','Marítimo','Importación','00000000-0000-0000-0000-000000000020','ELIMP00002','Borrador','');
INSERT INTO public.embarque_contenedores(id,embarque_id,organization_id,tipo_contenedor,numero_contenedor,fecha_descarga,fecha_devolucion) VALUES
 ('00000000-0000-0000-0000-000000000034','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000010','20TEST','CSQU3054383','2026-11-01','2026-11-06');
INSERT INTO public.facturas(id,numero,cliente_id,organization_id,fecha_vencimiento,subtotal,iva,total,metodo_pago,estado) VALUES
 ('00000000-0000-0000-0000-000000000040','TEST-001','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000010','2026-11-30',100,16,116,'PPD','Emitida'),
 ('00000000-0000-0000-0000-000000000050','TEST-002','00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000020','2026-11-30',100,16,116,'PPD','Emitida');
INSERT INTO public.pagos_factura(id,factura_id,organization_id,fecha_pago,monto,monto_aplicado_factura) VALUES
 ('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000010','2026-11-20',116,116),
 ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000020','2026-11-20',116,116);