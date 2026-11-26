-- Regresiones con datos ficticios de cobros, pagos a proveedores y CRM.
BEGIN;
\i supabase/tests/rls/_helpers.sql

DO $audit$
DECLARE fx record; cli uuid:=gen_random_uuid(); f1 uuid:=gen_random_uuid(); f2 uuid:=gen_random_uuid();
 req uuid:=gen_random_uuid(); p jsonb; first_result jsonb; retry_result jsonb; amount_db numeric; otro_intento_rechazado boolean := false;
BEGIN
 SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('AUDIT-FC01');
 INSERT INTO public.clientes(id,organization_id,nombre,rfc,email)
 VALUES(cli,fx.org_a,'Synthetic audit customer','XAXX010101000','audit@example.invalid');
 INSERT INTO public.facturas(id,organization_id,cliente_id,cliente_nombre,numero,fecha_emision,fecha_vencimiento,moneda,subtotal,iva,total,tipo_cambio,estado,metodo_pago)
 VALUES(f1,fx.org_a,cli,'Synthetic audit customer','AUD-FC01-A',public.fecha_negocio_mx()-1,public.fecha_negocio_mx()+30,'MXN',10000,0,10000,1,'Emitida','PPD'),
       (f2,fx.org_a,cli,'Synthetic audit customer','AUD-FC01-B',public.fecha_negocio_mx()-1,public.fecha_negocio_mx()+30,'MXN',10000,0,10000,1,'Emitida','PPD');
 PERFORM pg_temp.as_user(fx.admin_a);
 p:=jsonb_build_object('request_id',req,'cliente_id',cli,'fecha_pago',public.fecha_negocio_mx(),'moneda','MXN','forma_pago','03','importe_recibido',1200,
 'renglones',jsonb_build_array(jsonb_build_object('factura_id',f1,'monto',1000),jsonb_build_object('factura_id',f2,'monto',200)));
 first_result:=public.registrar_pago_cliente_lote(p);
 retry_result:=public.registrar_pago_cliente_lote(p || jsonb_build_object('renglones',
    jsonb_build_array(p->'renglones'->1, p->'renglones'->0)));
 PERFORM pg_temp.assert(first_result=retry_result,'el mismo reparto devuelve el mismo cobro');
 BEGIN
   PERFORM public.registrar_pago_cliente_lote(p||jsonb_build_object('importe_recibido',1500,
     'renglones',jsonb_build_array(jsonb_build_object('factura_id',f1,'monto',1000),
                                 jsonb_build_object('factura_id',f2,'monto',500))));
 EXCEPTION WHEN invalid_parameter_value THEN
   otro_intento_rechazado := SQLERRM LIKE 'LC_COBRO_LOTE_INTENTO_DISTINTO:%';
 END;
 SELECT monto_total INTO amount_db FROM public.pagos_factura_lote WHERE id=(first_result->>'lote_id')::uuid;
 PERFORM pg_temp.assert(otro_intento_rechazado AND amount_db=1200,'un intento cambiado conserva el cobro original');
END;
$audit$;

SELECT pg_temp.as_postgres();

DO $$
DECLARE
 fx record; prov uuid:=gen_random_uuid(); cat uuid:=gen_random_uuid(); account uuid:=gen_random_uuid();
 invoice1 uuid:=gen_random_uuid(); invoice2 uuid:=gen_random_uuid(); lot uuid; pay uuid; banco uuid; efectivo uuid;
 today date:=public.fecha_negocio_mx(); rep jsonb; amount numeric; applied numeric; head numeric; n int;
BEGIN
 SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('AUDIT-20261126-LOTE','contador');
 INSERT INTO public.proveedores(id,organization_id,nombre,categoria,subtipo_gasto)
 VALUES(prov,fx.org_a,'Proveedor ficticio auditoria','GastoOperativo','Otros');
 INSERT INTO public.presupuesto_categorias(id,organization_id,nombre) VALUES(cat,fx.org_a,'Auditoria');
 INSERT INTO public.cuentas_bancarias(id,organization_id,alias,moneda,saldo_inicial,fecha_saldo_inicial)
 VALUES(account,fx.org_a,'Banco ficticio auditoria','MXN',1000,today-30);
 INSERT INTO public.proveedor_facturas(id,organization_id,proveedor_id,categoria_presupuesto_id,folio_proveedor,
 fecha_emision,moneda,tipo_cambio_usd,subtotal,total,estado,estado_aprobacion)
 VALUES(invoice1,fx.org_a,prov,cat,'AUD-LOTE-1',today-1,'MXN',1,100,100,'Vigente','aprobada'),
 (invoice2,fx.org_a,prov,cat,'AUD-LOTE-2',today-1,'MXN',1,100,100,'Vigente','aprobada');
 PERFORM pg_temp.as_user(fx.admin_a);
 lot:=public.registrar_pago_proveedor_lote(jsonb_build_object(
  'proveedor_id',prov,'fecha_pago',today,'moneda','MXN','importe_recibido',160,
  'metodo_pago','Transferencia','cuenta_bancaria_id',account,'request_id',gen_random_uuid(),
  'renglones',jsonb_build_array(jsonb_build_object('factura_id',invoice1,'monto',80),jsonb_build_object('factura_id',invoice2,'monto',80))));
 SELECT id INTO STRICT pay FROM public.pagos_proveedor WHERE lote_id=lot AND proveedor_factura_id=invoice1;
 SELECT count(*),sum(cargo) INTO n,amount FROM public.bbva_movimientos WHERE cuenta_bancaria_id=account AND deleted_at IS NULL;
 IF n<>1 OR amount<>160 THEN RAISE EXCEPTION 'Fixture mismatch: % rows % cargo',n,amount; END IF;
 SELECT id INTO STRICT banco FROM public.bbva_movimientos
   WHERE pago_proveedor_lote_id=lot AND deleted_at IS NULL;
 rep:=public.conciliar_tesoreria_proveedor(prov,NULL);
 PERFORM pg_temp.assert(NOT EXISTS (
   SELECT FROM jsonb_array_elements(rep->'incidencias') e WHERE e->>'tipo'='sin_movimiento'
 ), 'los pagos del lote comparten el cargo en conciliación');
 PERFORM pg_temp.assert(public.regenerar_movimiento_pago_proveedor(pay)=banco,
   'recuperar el banco devuelve el cargo compartido');
 BEGIN
   PERFORM public.actualizar_pago_proveedor_atomico(pay,today,70,'MXN',NULL,'Transferencia','AUD',account,'',NULL,NULL);
   RAISE EXCEPTION 'La edición modificó una aplicación del lote';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM NOT LIKE 'LC_PAGO_LOTE_NO_EDITABLE:%' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM public.eliminar_pago_proveedor(pay,'Baja ficticia');
   RAISE EXCEPTION 'La baja modificó una aplicación del lote';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM NOT LIKE 'LC_PAGO_LOTE_NO_ELIMINABLE:%' THEN RAISE; END IF;
 END;
 efectivo:=(public.registrar_pago_proveedor_atomico(invoice2,today,10,'MXN','Efectivo',
   '',account,'',NULL,NULL,gen_random_uuid())->>'pago_id')::uuid;
 PERFORM pg_temp.assert(efectivo IS NOT NULL AND EXISTS (
   SELECT FROM public.pagos_proveedor WHERE id=efectivo AND cuenta_bancaria_id IS NULL
 ), 'efectivo descarta la cuenta bancaria residual');
 SELECT count(*),sum(cargo) INTO n,amount FROM public.bbva_movimientos
   WHERE cuenta_bancaria_id=account AND deleted_at IS NULL;
 SELECT sum(monto) INTO applied FROM public.pagos_proveedor WHERE lote_id=lot AND deleted_at IS NULL;
 SELECT monto_total INTO head FROM public.pagos_proveedor_lote WHERE id=lot;
 PERFORM pg_temp.assert(n=1 AND amount=160 AND applied=160 AND head=160,
   'sin cargos adicionales y con cabecera y aplicaciones intactas');
END;
$$;

SELECT pg_temp.as_postgres();

DO $probe$
DECLARE o uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); c uuid; e uuid; stage uuid; p jsonb; first_result jsonb; retry_result jsonb; perdida uuid; motivo uuid; oportunidad uuid;
BEGIN
 INSERT INTO organizations(id,nombre) VALUES(o,'AUDIT oportunidad retry ficticia');
 INSERT INTO organization_members(organization_id,user_id,role) VALUES(o,u,'admin_org');
 INSERT INTO user_roles(user_id,role) VALUES(u,'admin_org') ON CONFLICT(user_id) DO UPDATE SET role=excluded.role;
 INSERT INTO clientes(organization_id,nombre,email) VALUES(o,'Cliente oportunidad retry',gen_random_uuid()::text||'@example.invalid') RETURNING id INTO c;
 SELECT id INTO STRICT e FROM crm_empresas WHERE cliente_id=c AND deleted_at IS NULL;
 INSERT INTO crm_etapas_pipeline(organization_id,nombre,orden,tipo) VALUES(o,'Etapa audit',99,'abierta') RETURNING id INTO stage;
 INSERT INTO crm_etapas_pipeline(organization_id,nombre,orden,tipo)
   VALUES(o,'Perdida audit',100,'perdida') RETURNING id INTO perdida;
 INSERT INTO crm_motivos_perdida(organization_id,nombre)
   VALUES(o,'Motivo de pérdida audit') RETURNING id INTO motivo;
 p:=jsonb_build_object('request_id',gen_random_uuid(),'nombre','Operación única reintentada','etapa_id',stage,'cliente_id',c,'monto_estimado',10000,'moneda','MXN');
 PERFORM pg_temp.as_user(u);
 first_result:=crm_crear_oportunidad_con_empresa(e,p);
 retry_result:=crm_crear_oportunidad_con_empresa(e,p);
 PERFORM pg_temp.assert(first_result=retry_result,'el alta reintentada recupera la misma oportunidad');
 PERFORM pg_temp.assert((SELECT count(*)=1 FROM crm_oportunidades WHERE organization_id=o
   AND nombre='Operación única reintentada'),'reintentar no duplica oportunidades');
 oportunidad:=(first_result->>'id')::uuid;
 UPDATE crm_oportunidades SET etapa_id=perdida,motivo_perdida_id=motivo WHERE id=oportunidad;
 BEGIN
   UPDATE crm_oportunidades SET etapa_id=stage WHERE id=oportunidad;
   RAISE EXCEPTION 'Se reabrió una oportunidad sin motivo';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 UPDATE crm_oportunidades SET etapa_id=stage,motivo_reapertura=' Cliente retomó el embarque '
   WHERE id=oportunidad;
 PERFORM pg_temp.assert(EXISTS (SELECT FROM crm_historial_etapas h WHERE h.oportunidad_id=oportunidad
   AND h.etapa_origen_id=perdida AND h.etapa_destino_id=stage AND h.usuario_id=u
   AND h.motivo_reapertura='Cliente retomó el embarque' AND h.motivo_perdida_anterior_id=motivo),
   'el historial conserva el motivo nuevo, el anterior y el actor');
END $probe$;

ROLLBACK;
