BEGIN;
\i supabase/tests/rls/_helpers.sql

DO $test$
DECLARE
  v_fx record;
  v_coord uuid := gen_random_uuid();
  v_gerente uuid := gen_random_uuid();
  v_contador uuid := gen_random_uuid();
  v_cliente uuid := gen_random_uuid();
  v_embarque uuid := gen_random_uuid();
  v_doc uuid := gen_random_uuid();
  v_factura uuid := gen_random_uuid();
  v_nc uuid := gen_random_uuid();
  v_solicitud uuid := gen_random_uuid();
  v_entrega uuid := gen_random_uuid();
  v_cierre_id uuid := gen_random_uuid();
  v_hoy date := public.fecha_negocio_mx();
  v_mes date := date_trunc('month',v_hoy)::date;
  v_corte date := v_mes-1;
  v_preview jsonb;
  v_corte2 jsonb;
  v_antes jsonb;
  v_huella_original text;
BEGIN
  SELECT * INTO STRICT v_fx FROM pg_temp.seed_org_pair('CO068-OR041');
  PERFORM pg_temp.seed_auth_user(v_coord,'co068-coord@example.invalid');
  PERFORM pg_temp.seed_auth_user(v_gerente,'co068-gerente@example.invalid');
  PERFORM pg_temp.seed_auth_user(v_contador,'or041-contador@example.invalid');
  INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
    (v_fx.org_a,v_coord,'coordinador_logistico'),
    (v_fx.org_a,v_gerente,'gerente_operaciones'),
    (v_fx.org_a,v_contador,'contador');
  INSERT INTO public.clientes(id,organization_id,nombre,email,sin_comision)
    VALUES(v_cliente,v_fx.org_a,'Cliente corte sintético','or041-cliente@example.invalid',true);
  INSERT INTO public.embarques(id,organization_id,expediente,cliente_id,cliente_nombre,modo,tipo,estado,etd,eta,fecha_llegada_real,tipo_cambio_usd)
    VALUES(v_embarque,v_fx.org_a,'ELNAC97068',v_cliente,'Cliente corte sintético',
      'Terrestre','Importación','En Aduana',v_corte-7,v_mes,v_corte-3,20);
  INSERT INTO public.documentos_embarque(organization_id,embarque_id,nombre,archivo)
    SELECT v_fx.org_a,v_embarque,d,'prueba/requisito.pdf'
    FROM unnest(public._docs_requeridos_por_estado('Terrestre','Entregado')) d;
  INSERT INTO public.documentos_embarque(id,organization_id,embarque_id,nombre,archivo)
    VALUES(v_doc,v_fx.org_a,v_embarque,'Evidencia sintética de entrega','prueba/sintetica.pdf');
  PERFORM pg_temp.as_user(v_coord);
  PERFORM pg_temp.assert(public.entregar_embarque_con_fecha(v_embarque,v_hoy,'Otro','Cambio de estado a Entregado',v_entrega)->>'estado'='Entregado',
    'la captura inicial avanza el estado y registra fecha efectiva');
  PERFORM pg_temp.assert((public.entregar_embarque_con_fecha(v_embarque,v_hoy,'Otro','Cambio de estado a Entregado',v_entrega)->>'replay')::boolean,
    'la respuesta perdida recupera la entrega original');

  PERFORM pg_temp.as_user(v_contador);
  PERFORM pg_temp.assert(public.consultar_corte_cxc(v_fx.org_a,v_corte)->>'estado'='sin_corte','no inventa el corte anterior a la apertura');
  PERFORM pg_temp.assert(public.activar_historial_cxc(v_fx.org_a,'Auxiliar conciliado de prueba')=v_hoy,'alta de apertura por Contabilidad');
  PERFORM pg_temp.assert(public.consultar_apertura_cxc(v_fx.org_a)=v_hoy,'consulta la apertura de la misma organización');
  PERFORM pg_temp.as_postgres();
  -- El fixture representa una apertura ya capturada antes del fin de mes.
  UPDATE public.cxc_aperturas SET desde=v_corte-7 WHERE organization_id=v_fx.org_a;
  INSERT INTO public.facturas(id,organization_id,embarque_id,cliente_id,cliente_nombre,numero,fecha_emision,
    fecha_vencimiento,moneda,subtotal,iva,total,tipo_cambio,estado,metodo_pago)
    VALUES(v_factura,v_fx.org_a,v_embarque,v_cliente,'Cliente corte sintético','OR041-TEST',
      v_corte-3,v_corte-1,'MXN',1000,0,1000,1,'Emitida','PUE');
  PERFORM pg_temp.as_user(v_contador);
  PERFORM public.registrar_pago_factura_atomico(v_factura,v_hoy,1000,'MXN',1,1000,'01',
    'COBRO POSTERIOR',p_client_request_id=>gen_random_uuid());
  PERFORM pg_temp.assert(public.saldo_factura(v_factura)=0,'después del cobro el saldo actual es cero');
  v_preview := public.previsualizar_corte_cxc(v_fx.org_a,v_corte);
  v_huella_original := v_preview->>'fingerprint';
  PERFORM pg_temp.assert((v_preview#>>'{filas,0,saldo}')::numeric=1000,'el cobro de noviembre no entra en octubre');
  PERFORM pg_temp.assert(public.certificar_corte_cxc(v_fx.org_a,v_corte,v_preview->>'fingerprint','Auxiliar certificado de prueba',v_cierre_id)=v_cierre_id,
    'primera certificación');
  PERFORM pg_temp.assert(public.certificar_corte_cxc(v_fx.org_a,v_corte,v_preview->>'fingerprint','Auxiliar certificado de prueba',v_cierre_id)=v_cierre_id,
    'el reintento recupera la misma revisión');
  v_antes := public.consultar_corte_cxc(v_fx.org_a,v_corte);
  PERFORM pg_temp.assert((v_antes->>'revision')::int=1 AND (v_antes#>>'{filas,0,saldo}')::numeric=1000,'snapshot de octubre');
  BEGIN
    PERFORM public.consultar_corte_cxc(v_fx.org_b,v_corte);
    RAISE EXCEPTION 'El corte debe respetar la organización activa';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.as_user(v_coord);
  PERFORM pg_temp.assert(public.solicitar_fecha_entrega(v_embarque,v_corte-1,'Fecha del comprobante de entrega',v_doc,v_solicitud)=v_solicitud,
    'Coordinación solicita corregir a octubre');
  PERFORM pg_temp.assert(public.solicitar_fecha_entrega(v_embarque,v_corte-1,'Fecha del comprobante de entrega',v_doc,v_solicitud)=v_solicitud,
    'se conserva una sola solicitud al reintentar');
  PERFORM pg_temp.as_user(v_gerente);
  BEGIN
    PERFORM public.resolver_fecha_entrega(v_solicitud,true,'Comprobante de entrega cotejado');
    RAISE EXCEPTION 'La aprobación debió esperar reapertura';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Contabilidad debe reabrir%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.assert((SELECT count(*) FROM public.historial_fecha_entrega(v_embarque) h WHERE h.estado='pendiente')=1,
    'la solicitud sigue pendiente');
  PERFORM pg_temp.as_user(v_contador);
  PERFORM public.actualizar_cierre_periodo(v_fx.org_a,v_corte-8,'Revisión de octubre con evidencia');
  PERFORM pg_temp.assert(public.consultar_corte_cxc(v_fx.org_a,v_corte)->>'estado'='reabierto','el corte reabierto pierde la certificación vigente');
  PERFORM pg_temp.as_user(v_gerente);
  PERFORM pg_temp.assert(public.resolver_fecha_entrega(v_solicitud,true,'Comprobante de entrega cotejado')='aprobada',
    'Gerencia puede aprobar luego de la reapertura');
  PERFORM pg_temp.assert(public.resolver_fecha_entrega(v_solicitud,true,'Comprobante de entrega cotejado')='aprobada',
    'resolución idempotente');
  PERFORM pg_temp.assert((SELECT p.total_embarques FROM public.profit_por_cliente(v_corte-10,v_corte,NULL,v_cliente) p)=1,
    'rentabilidad por fecha efectiva');
  PERFORM pg_temp.assert(NOT EXISTS(SELECT FROM public.profit_por_cliente(v_mes,v_hoy,NULL,v_cliente)),
    'ETA no arrastra rentabilidad a noviembre');

  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.assert(EXISTS (SELECT FROM public.eventos_embarque WHERE embarque_id=v_embarque AND descripcion='Cambio de estado a Entregado'
      AND (fecha AT TIME ZONE 'America/Mexico_City')::date=v_hoy), 'se preservó la fecha del evento original');
  -- Reverso del cobro posterior para aplicar una NC al saldo abierto.
  UPDATE public.pagos_factura SET deleted_at=now() WHERE factura_id=v_factura AND deleted_at IS NULL;
  INSERT INTO public.factura_notas_credito(id,organization_id,factura_id,folio,monto,estado,fecha_emision,moneda,tipo_cambio,uuid_fiscal)
    VALUES(v_nc,v_fx.org_a,v_factura,'NC-OR041',200,'Aplicada',v_corte-2,'MXN',1,gen_random_uuid()::text);
  PERFORM pg_temp.as_user(v_contador);
  BEGIN
    PERFORM public.certificar_corte_cxc(v_fx.org_a,v_corte,v_huella_original,'Auxiliar anterior de prueba',gen_random_uuid());
    RAISE EXCEPTION 'La vista previa anterior debe caducar por la NC';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  v_preview := public.previsualizar_corte_cxc(v_fx.org_a,v_corte);
  PERFORM pg_temp.assert((v_preview#>>'{filas,0,saldo}')::numeric=800,'la NC de octubre ajusta la revisión de octubre');
  PERFORM public.certificar_corte_cxc(v_fx.org_a,v_corte,v_preview->>'fingerprint','Auxiliar revisado de prueba',gen_random_uuid());
  v_corte2 := public.consultar_corte_cxc(v_fx.org_a,v_corte);
  PERFORM pg_temp.assert((v_corte2->>'revision')::int=2 AND (v_corte2#>>'{filas,0,saldo}')::numeric=800,'recierre emite revisión dos');
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.assert(EXISTS (SELECT FROM public.cxc_cortes WHERE id=v_cierre_id AND revision=1
    AND (datos#>>'{filas,0,saldo}')::numeric=1000 AND reabierto_en IS NOT NULL),'revisión original preservada');
  RAISE NOTICE 'CO-068 y OR-041: aprobación, cierre, pago posterior y recertificación aprobados';
END;
$test$;
ROLLBACK;
