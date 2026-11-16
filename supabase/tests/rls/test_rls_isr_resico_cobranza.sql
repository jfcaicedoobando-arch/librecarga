BEGIN;
\ir _helpers.sql

CREATE FUNCTION pg_temp.reservar_nc(p_nota uuid,p_org uuid,p_actor uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_version timestamptz; v_claim text;
BEGIN
  SELECT updated_at INTO STRICT v_version FROM public.factura_notas_credito WHERE id=p_nota;
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.as_service_role();
  PERFORM set_config('role','service_role',true);
  v_claim := public.reservar_nota_credito_isr(p_nota,p_org,p_actor,v_version)->>'claim';
  PERFORM pg_temp.as_user(p_actor);
  RETURN v_claim;
END;
$$;

CREATE FUNCTION pg_temp.confirmar_nc(
  p_nota uuid,p_org uuid,p_actor uuid,p_claim text,p_remoto text,p_uuid text,p_origen_incorrecto boolean DEFAULT false
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_datos jsonb; v_esperado jsonb; v_evidencia jsonb; v_estado text;
BEGIN
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.as_service_role();
  PERFORM set_config('role','service_role',true);
  v_datos := public.obtener_intento_nota_credito_isr(p_nota,p_org,p_claim);
  v_esperado := v_datos->'esperado';
  PERFORM pg_temp.assert(v_esperado->>'tipo'='E' AND v_esperado->>'ambiente'='sandbox','credit attempt retains the original environment');
  v_evidencia := jsonb_build_object('facturapi_id',p_remoto,'uuid',p_uuid,'external_id',p_claim,'ambiente','sandbox',
    'facturapi_org_id','org-resico79-qa','moneda','MXN','total',v_esperado#>'{totales,total}',
    'folio',79+right(p_uuid,1)::integer,'serie','NC',
    'xml',jsonb_build_object('uuid',p_uuid,'factura_uuid',
      CASE WHEN p_origen_incorrecto THEN p_uuid ELSE v_esperado->>'factura_uuid' END,
      'emisor_rfc','GODE561231GR8','emisor_regimen','626','receptor_rfc','EKU9003173C9','receptor_regimen','601',
      'totales',v_esperado->'totales','uso_cfdi','G02','sha256',repeat('b',64),
      'ruta',p_org::text || '/notas-credito/' || p_uuid || '.xml'));
  v_estado := public.registrar_resultado_nota_credito_isr(p_nota,p_org,p_claim,'confirmado',v_evidencia)->>'estado';
  IF v_estado='confirmado' THEN
    PERFORM pg_temp.assert(public.registrar_resultado_nota_credito_isr(p_nota,p_org,p_claim,'confirmado',v_evidencia)->>'estado'
      ='confirmado','credit confirmation is idempotent');
  END IF;
  PERFORM pg_temp.as_user(p_actor);
  RETURN v_estado;
END;
$$;

DO $$
DECLARE
  fx record;
  cliente uuid := gen_random_uuid();
  perfil uuid;
  stamp timestamptz;
  factura uuid;
  concepto_a uuid;
  concepto_b uuid;
  pago_uno uuid;
  pago_dos uuid;
  pago_final uuid;
  reemplazo uuid;
  nota_uno uuid;
  nota_dos uuid;
  bloqueado boolean;
  captura jsonb;
  evidencia jsonb;
  lineas jsonb;
  claim text;
  claim_nc text;
  folio_uuid constant text := '9DB0A395-76FD-42AE-8DB9-67F9EACD68F1';
  fecha date := public.fecha_negocio_mx();
BEGIN
  SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('RESICO79');
  INSERT INTO public.clientes(id,nombre,rfc,regimen_fiscal,codigo_postal,organization_id,email)
    VALUES(cliente,'PM QA','EKU9003173C9','601','01010',fx.org_a,'resico79-pm@qa.invalid');
  INSERT INTO public.configuracion(organization_id,categoria,clave,valor)
    VALUES(fx.org_a,'empresa','rfc','"GODE561231GR8"');
  INSERT INTO public.facturapi_credenciales(organization_id,ambiente,facturapi_org_id)
    VALUES(fx.org_a,'sandbox','org-resico79-qa') RETURNING updated_at INTO stamp;
  PERFORM pg_temp.as_user_rpc_interna(fx.admin_a);
  perfil := public.registrar_perfil_fiscal_emisor(fx.org_a,'sandbox',fx.admin_a,stamp,0,
    '{"facturapi_org_id":"org-resico79-qa","rfc":"GODE561231GR8","razon_social":"QA","regimen_fiscal":"626","codigo_postal":"01000"}');
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM public.confirmar_perfil_fiscal_emisor(fx.org_a,'sandbox',perfil,fecha);
  factura := public.crear_factura_manual_idempotente(gen_random_uuid(),
    jsonb_build_object('organization_id',fx.org_a,'cliente_id',cliente,'cliente_nombre','PM QA',
      'rfc_cliente','EKU9003173C9','numero','BORRADOR-79','moneda','MXN','tipo_cambio',1,'subtotal',200.80,'iva',32.12,'total',232.92,
      'fecha_emision',fecha,'fecha_vencimiento',fecha+30,'metodo_pago','PPD','forma_pago','99','uso_cfdi','G03','serie','QA','dias_credito',30),
    '[{"descripcion":"Flete A","cantidad":1,"precio_unitario":100.40,"total":100.40,"clave_sat":"78101800","tipo_iva":"gravado_16","tasa_iva_aplicada":0.16},
      {"descripcion":"Flete B","cantidad":1,"precio_unitario":100.40,"total":100.40,"clave_sat":"78101800","tipo_iva":"gravado_16","tasa_iva_aplicada":0.16}]');
  UPDATE public.conceptos_factura SET tasa_ret_iva=.04 WHERE factura_id=factura;
  PERFORM pg_temp.as_postgres();
  INSERT INTO public.configuracion(organization_id,categoria,clave,valor)
    VALUES(fx.org_a,'facturacion','isr_resico_automatico','true');
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM public.aplicar_evaluacion_isr_factura_manual(factura);
  captura := public.prevalidar_emision_isr_factura(factura);
  PERFORM pg_temp.assert((captura#>>'{totales,total}')::numeric=222.39, 'the issued invoice has both approved retentions');

  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.as_service_role();
  PERFORM set_config('role','service_role',true);
  claim := public.reservar_timbrado_isr(factura,fx.admin_a,captura,captura->'emisor')->>'claim';
  evidencia := jsonb_build_object('facturapi_id','inv-resico79-qa','uuid',folio_uuid,'external_id',claim,
    'ambiente','sandbox','facturapi_org_id','org-resico79-qa','moneda','MXN','total',222.39,'folio',79,'serie','QA',
    'xml',jsonb_build_object('uuid',folio_uuid,'emisor_rfc','GODE561231GR8','emisor_regimen','626',
      'receptor_rfc','EKU9003173C9','receptor_regimen','601','totales',captura->'totales',
      'uso_cfdi','G03','sha256',repeat('a',64),'ruta',fx.org_a::text || '/emitidas/' || folio_uuid || '.xml'));
  PERFORM pg_temp.assert(public.registrar_resultado_timbrado_isr(factura,claim,'confirmado',evidencia)->>'estado'='confirmado',
    'synthetic CFDI issuance prepares the fixture');

  PERFORM pg_temp.as_user(fx.admin_a);
  SELECT id INTO STRICT concepto_a FROM public.conceptos_factura WHERE factura_id=factura AND descripcion='Flete A';
  SELECT id INTO STRICT concepto_b FROM public.conceptos_factura WHERE factura_id=factura AND descripcion='Flete B';
  lineas := jsonb_build_array(
    jsonb_build_object('concepto_factura_id',concepto_a,'cantidad',1,'precio_unitario',100.40,
      'tipo_iva','gravado_16','tasa_iva',.16,'tasa_ret_isr',.0125,'tasa_ret_iva',.04),
    jsonb_build_object('concepto_factura_id',concepto_b,'cantidad',1,'precio_unitario',100.40,
      'tipo_iva','gravado_16','tasa_iva',.16,'tasa_ret_isr',.0125,'tasa_ret_iva',.04));
  INSERT INTO public.factura_notas_credito(organization_id,factura_id,folio,monto,conceptos,fecha_emision)
    VALUES(fx.org_a,factura,'NC-QA79-CANCELADA',222.39,lineas,fecha) RETURNING id INTO nota_uno;
  bloqueado := false;
  BEGIN UPDATE public.factura_notas_credito SET facturapi_id='nc-falsa',estado='Timbrada',
    uuid_fiscal='9DB0A395-76FD-42AE-8DB9-67F9EACD68F4' WHERE id=nota_uno;
  EXCEPTION WHEN check_violation THEN bloqueado := SQLERRM='LC_ISR_NC_TIMBRADO_PROTEGIDO'; END;
  PERFORM pg_temp.assert(bloqueado,'a client cannot bypass the credit issuance attempt');
  claim_nc := pg_temp.reservar_nc(nota_uno,fx.org_a,fx.admin_a);
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.as_service_role();
  PERFORM set_config('role','service_role',true);
  PERFORM pg_temp.assert(public.registrar_resultado_nota_credito_isr(nota_uno,fx.org_a,claim_nc,'rechazado',
    '{"http_status":422}')->>'estado'='rechazado','a definite initial rejection releases only its own claim');
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM pg_temp.assert((SELECT facturapi_id IS NULL FROM public.factura_notas_credito WHERE id=nota_uno),
    'an explicitly rejected note can be reserved again');
  claim_nc := pg_temp.reservar_nc(nota_uno,fx.org_a,fx.admin_a);
  PERFORM pg_temp.assert(pg_temp.confirmar_nc(nota_uno,fx.org_a,fx.admin_a,claim_nc,'nc-resico79-qa-cancelada',
    '9DB0A395-76FD-42AE-8DB9-67F9EACD68F4')='confirmado','full credit has a confirmed XML');
  PERFORM pg_temp.assert(public.saldo_factura(factura)=0, 'a full credit matches both invoice lines exactly');
  UPDATE public.factura_notas_credito SET estado='Cancelada' WHERE id=nota_uno;
  PERFORM pg_temp.assert(public.saldo_factura(factura)=222.39, 'cancelling the full credit restores the original net');

  lineas := jsonb_build_array(jsonb_build_object('concepto_factura_id',concepto_a,'cantidad',1,'precio_unitario',50.20,
    'tipo_iva','gravado_16','tasa_iva',.16,'tasa_ret_isr',.0125,'tasa_ret_iva',.04));
  bloqueado := false;
  BEGIN
    INSERT INTO public.factura_notas_credito(organization_id,factura_id,folio,monto,conceptos,fecha_emision)
    VALUES(fx.org_a,factura,'NC-QA79-INV',56.22,jsonb_set(lineas,'{0,tasa_ret_isr}','0'),fecha);
  EXCEPTION WHEN check_violation THEN bloqueado := SQLERRM='LC_ISR_NC_IMPUESTOS_ORIGEN'; END;
  PERFORM pg_temp.assert(bloqueado,'a note cannot change the retention of its original line');
  bloqueado := false;
  BEGIN
    INSERT INTO public.factura_notas_credito(organization_id,factura_id,folio,monto,conceptos,fecha_emision)
    VALUES(fx.org_a,factura,'NC-QA79-INV',55.58,lineas,fecha);
  EXCEPTION WHEN check_violation THEN bloqueado := SQLERRM='LC_ISR_NC_TOTAL'; END;
  PERFORM pg_temp.assert(bloqueado,'an evaluated credit must have the exact ledger net');

  INSERT INTO public.factura_notas_credito(organization_id,factura_id,folio,monto,conceptos,fecha_emision)
    VALUES(fx.org_a,factura,'NC-QA79-1',55.59,lineas,fecha) RETURNING id INTO nota_uno;
  claim_nc := pg_temp.reservar_nc(nota_uno,fx.org_a,fx.admin_a);
  bloqueado := false;
  BEGIN UPDATE public.factura_notas_credito SET facturapi_id=NULL WHERE id=nota_uno;
  EXCEPTION WHEN check_violation THEN bloqueado := SQLERRM='LC_ISR_NC_TIMBRADO_PROTEGIDO'; END;
  PERFORM pg_temp.assert(bloqueado,'only the protected operation can release a credit attempt');
  PERFORM pg_temp.assert(public.saldo_factura(factura)=222.39, 'a pending credit is not a posted ledger entry');

  PERFORM pg_temp.as_postgres();
  bloqueado := false;
  BEGIN
    INSERT INTO public.pagos_factura(organization_id,factura_id,fecha_pago,monto,moneda,tipo_cambio,forma_pago)
    VALUES(fx.org_a,factura,fecha,222.39,'MXN',1,'03');
  EXCEPTION WHEN check_violation THEN bloqueado := SQLERRM LIKE 'LC_PAGO_SOBREPAGO:%'; END;
  PERFORM pg_temp.assert(bloqueado,'a collection cannot consume credit reserved for issuance');

  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM pg_temp.assert(pg_temp.confirmar_nc(nota_uno,fx.org_a,fx.admin_a,claim_nc,'nc-resico79-qa-1',
    '9DB0A395-76FD-42AE-8DB9-67F9EACD68F2',true)='conciliacion','a different related UUID holds the note');
  PERFORM pg_temp.assert(public.saldo_factura(factura)=222.39, 'an unmatched XML cannot post a credit');
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.as_service_role();
  PERFORM set_config('role','service_role',true);
  PERFORM pg_temp.assert(public.obtener_intento_nota_credito_isr(nota_uno,fx.org_b,claim_nc)->'esperado' IS NULL,
    'the stored note recovery cannot be read through another organization');
  bloqueado := false;
  BEGIN PERFORM public.registrar_resultado_nota_credito_isr(nota_uno,fx.org_a,claim_nc,'rechazado','{"http_status":422}');
  EXCEPTION WHEN check_violation THEN bloqueado := SQLERRM='LC_ISR_RECHAZO_INCIERTO'; END;
  PERFORM pg_temp.assert(bloqueado,'an uncertain attempt cannot be freed by a later rejection');
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM pg_temp.assert(pg_temp.confirmar_nc(nota_uno,fx.org_a,fx.admin_a,claim_nc,'nc-resico79-qa-1',
    '9DB0A395-76FD-42AE-8DB9-67F9EACD68F2')='confirmado','the correct XML completes the same note');
  PERFORM pg_temp.assert(public.saldo_factura(factura)=166.80, 'the first credit reduces the net before collection');
  bloqueado := false;
  BEGIN UPDATE public.factura_notas_credito SET conceptos='[]' WHERE id=nota_uno;
  EXCEPTION WHEN check_violation THEN bloqueado := SQLERRM='LC_ISR_NC_INMUTABLE'; END;
  PERFORM pg_temp.assert(bloqueado,'an issued credit retains the original rates and line id');

  PERFORM pg_temp.as_postgres();
  INSERT INTO public.pagos_factura(organization_id,factura_id,fecha_pago,monto,moneda,tipo_cambio,forma_pago,ret_isr,ret_iva)
    VALUES(fx.org_a,factura,fecha,50.00,'MXN',1,'03',999,999) RETURNING id INTO pago_uno;
  PERFORM pg_temp.assert((SELECT (monto,monto_aplicado_factura,ret_isr,ret_iva)=(50.00,50.00,.56,1.80)
    FROM public.pagos_factura WHERE id=pago_uno), 'cash and both calculated retentions are independent');

  PERFORM pg_temp.as_user(fx.admin_a);
  lineas := jsonb_build_array(jsonb_build_object('concepto_factura_id',concepto_b,'cantidad',1,'precio_unitario',20,
    'tipo_iva','gravado_16','tasa_iva',.16,'tasa_ret_isr',.0125,'tasa_ret_iva',.04));
  INSERT INTO public.factura_notas_credito(organization_id,factura_id,folio,monto,conceptos,fecha_emision)
    VALUES(fx.org_a,factura,'NC-QA79-2',22.15,lineas,fecha) RETURNING id INTO nota_dos;
  claim_nc := pg_temp.reservar_nc(nota_dos,fx.org_a,fx.admin_a);
  PERFORM pg_temp.assert(pg_temp.confirmar_nc(nota_dos,fx.org_a,fx.admin_a,claim_nc,'nc-resico79-qa-2',
    '9DB0A395-76FD-42AE-8DB9-67F9EACD68F3')='confirmado','credit after a payment uses the approved allocation');
  PERFORM pg_temp.assert(public.saldo_factura(factura)=94.65, 'a later credit preserves prior payment and reduces remaining net');

  PERFORM pg_temp.as_postgres();
  INSERT INTO public.pagos_factura(organization_id,factura_id,fecha_pago,monto,moneda,tipo_cambio,forma_pago)
    VALUES(fx.org_a,factura,fecha,2,'USD',20,'03') RETURNING id INTO pago_dos;
  PERFORM pg_temp.assert((SELECT (monto,monto_aplicado_factura,ret_isr,ret_iva)=(2,40,.45,1.45)
    FROM public.pagos_factura WHERE id=pago_dos), 'FX uses the amount applied in invoice currency');
  INSERT INTO public.pagos_factura(organization_id,factura_id,fecha_pago,monto,moneda,tipo_cambio,forma_pago)
    VALUES(fx.org_a,factura,fecha,54.65,'MXN',1,'03') RETURNING id INTO pago_final;
  PERFORM pg_temp.assert((SELECT (ret_isr,ret_iva)=(.62,1.97)
    FROM public.pagos_factura WHERE id=pago_final), 'final payment takes both rounding residues');
  PERFORM pg_temp.assert(public._saldo_factura_calc(factura)=0, 'the ledger is settled exactly');

  UPDATE public.pagos_factura SET estado_rep='Cancelado' WHERE id=pago_dos;
  PERFORM pg_temp.assert(public._saldo_factura_calc(factura)=40, 'cancelling the REP reopens the applied net');
  UPDATE public.pagos_factura SET facturapi_rep_id='PENDING:rep-resico79' WHERE id=pago_dos;
  PERFORM pg_temp.assert(public._saldo_factura_calc(factura)=40, 'a REP retry reserves its payment without posting it');
  bloqueado := false;
  BEGIN
    INSERT INTO public.pagos_factura(organization_id,factura_id,fecha_pago,monto,moneda,tipo_cambio,forma_pago)
    VALUES(fx.org_a,factura,fecha,2,'USD',20,'03');
  EXCEPTION WHEN check_violation THEN bloqueado := SQLERRM LIKE 'LC_PAGO_SOBREPAGO:%'; END;
  PERFORM pg_temp.assert(bloqueado, 'the replacement cannot consume a balance reserved for the REP retry');
  UPDATE public.pagos_factura SET facturapi_rep_id=NULL WHERE id=pago_dos;
  INSERT INTO public.pagos_factura(organization_id,factura_id,fecha_pago,monto,moneda,tipo_cambio,forma_pago)
    VALUES(fx.org_a,factura,fecha,2,'USD',20,'03') RETURNING id INTO reemplazo;
  PERFORM pg_temp.assert((SELECT (ret_isr,ret_iva)=(.45,1.45)
    FROM public.pagos_factura WHERE id=reemplazo), 'replacing the payment restores its fiscal amounts');
  PERFORM pg_temp.assert((SELECT (sum(ret_isr),sum(ret_iva))=(1.63,5.22)
    FROM public.pagos_factura WHERE factura_id=factura AND NOT public.pago_rep_anulado(estado_rep)),
    'active collections plus both credits reconcile to the issued amounts');
END;
$$;
ROLLBACK;
