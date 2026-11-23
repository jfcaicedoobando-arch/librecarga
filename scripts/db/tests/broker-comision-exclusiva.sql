-- Sólo base aislada; requiere las funciones reales de cálculo y la migración candidata.
CREATE FUNCTION pg_temp.assert_comision(p_id uuid, p_kam numeric, p_broker numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d record; b numeric;
BEGIN
 SELECT * INTO STRICT d FROM public.comisiones_devengadas WHERE id=p_id;
 IF d.comision_mxn IS DISTINCT FROM p_kam THEN RAISE EXCEPTION 'KAM esperado %, recibido %',p_kam,d.comision_mxn; END IF;
 IF p_kam=0 AND d.porcentaje_aplicado IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'KAM debe tener 0%%'; END IF;
 SELECT comision_mxn INTO b FROM public.comisiones_broker WHERE comision_devengada_id=p_id;
 IF b IS DISTINCT FROM p_broker THEN RAISE EXCEPTION 'Broker esperado %, recibido %',p_broker,b; END IF;
END $$;
INSERT INTO public.crm_brokers VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',true,15,25);
INSERT INTO public.crm_empresas VALUES ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000003',null,now());
INSERT INTO public.facturas VALUES ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005');
INSERT INTO public.pagos_factura VALUES ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006',now());
INSERT INTO public.embarques VALUES ('00000000-0000-0000-0000-000000000008','Marítimo','LCL',20,22);
INSERT INTO public.conceptos_venta VALUES ('00000000-0000-0000-0000-000000000008','Flete',1000,'USD',null);
INSERT INTO public.conceptos_costo VALUES ('00000000-0000-0000-0000-000000000008','Flete',800,'USD',null);
-- 1. Base 50 USD: 15%=7.50, mínimo 25 USD=500 MXN; abono 50%=250 MXN. KAM=0.
INSERT INTO public.comisiones_devengadas(id,organization_id,pago_factura_id,factura_id,embarque_id,vendedora_id,monto_cobrado_mxn,utilidad_prorrateada_mxn,porcentaje_aplicado,comision_mxn,estado,nota)
VALUES ('00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000010',10000,2000,25,500,'Devengada','Nota original');
SELECT pg_temp.assert_comision('00000000-0000-0000-0000-000000000009',0,250);
-- 2. Recalcular no puede reactivar una excepción del KAM ni duplicar el renglón del broker.
UPDATE public.comisiones_devengadas SET porcentaje_aplicado=80,comision_mxn=1600;
SELECT pg_temp.assert_comision('00000000-0000-0000-0000-000000000009',0,250);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.comisiones_broker)<>1 THEN RAISE EXCEPTION 'Broker duplicado'; END IF;
 IF (SELECT nota FROM public.comisiones_devengadas) IS DISTINCT FROM 'Nota original [broker] Comisión exclusiva del broker; KAM sin comisión' THEN RAISE EXCEPTION 'Nota perdida o duplicada'; END IF;
 IF (SELECT vendedora_id FROM public.comisiones_devengadas) IS DISTINCT FROM '00000000-0000-0000-0000-000000000010'::uuid THEN RAISE EXCEPTION 'KAM reasignado'; END IF;
END $$;
-- 3. Pago completo conserva tabulador y proporcionalidad del broker.
UPDATE public.comisiones_devengadas SET monto_cobrado_mxn=20000,comision_mxn=500;
SELECT pg_temp.assert_comision('00000000-0000-0000-0000-000000000009',0,500);
-- 4. Sin broker, el motor conserva comisión interna (mismo cálculo recibido).
UPDATE public.crm_empresas SET broker_id=null;
UPDATE public.comisiones_devengadas SET porcentaje_aplicado=25,comision_mxn=1000;
SELECT pg_temp.assert_comision('00000000-0000-0000-0000-000000000009',1000,500);
-- 5. Broker inactivo no habilita comisión interna por accidente.
UPDATE public.crm_empresas SET broker_id='00000000-0000-0000-0000-000000000003';
UPDATE public.crm_brokers SET activo=false;
UPDATE public.comisiones_devengadas SET porcentaje_aplicado=25,comision_mxn=1000;
SELECT pg_temp.assert_comision('00000000-0000-0000-0000-000000000009',0,500);
-- 6. Vínculo ajeno a la organización no suprime comisión interna.
UPDATE public.crm_brokers SET organization_id='00000000-0000-0000-0000-000000000099';
UPDATE public.comisiones_devengadas SET porcentaje_aplicado=25,comision_mxn=1000;
SELECT pg_temp.assert_comision('00000000-0000-0000-0000-000000000009',1000,500);
UPDATE public.crm_brokers SET organization_id='00000000-0000-0000-0000-000000000001';
-- 7. Liquidadas y pagadas (ambas estado Liquidada en devengadas) no cambian.
UPDATE public.comisiones_broker SET estado='Liquidada';
UPDATE public.comisiones_devengadas SET estado='Liquidada',liquidacion_id='00000000-0000-0000-0000-000000000020',comision_mxn=1000;
SELECT pg_temp.assert_comision('00000000-0000-0000-0000-000000000009',1000,500);
-- 8. Recuperaciones conservan su monto original.
UPDATE public.comisiones_devengadas SET estado='Por recuperar',comision_mxn=1000;
SELECT pg_temp.assert_comision('00000000-0000-0000-0000-000000000009',1000,500);
-- 9. No sobrescribir renglones con liquidación aunque su estado esté pendiente.
UPDATE public.comisiones_devengadas SET estado='Devengada',comision_mxn=1000;
SELECT pg_temp.assert_comision('00000000-0000-0000-0000-000000000009',1000,500);
-- 10. RPC de trigger sigue cerrada a clientes y servicio directo.
DO $$ BEGIN
 IF has_function_privilege('authenticated','public._comision_kam_broker()','EXECUTE')
 OR has_function_privilege('anon','public._comision_kam_broker()','EXECUTE')
 OR has_function_privilege('service_role','public._comision_kam_broker()','EXECUTE') THEN RAISE EXCEPTION 'Trigger accesible directamente'; END IF;
END $$;
SELECT '10 casos focalizados correctos' AS resultado;