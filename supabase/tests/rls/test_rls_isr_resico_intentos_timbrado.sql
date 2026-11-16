BEGIN;
\ir _helpers.sql

DO $$
DECLARE
  fx record;
  cliente uuid:=gen_random_uuid(); perfil uuid; stamp timestamptz; factura uuid;
  previa jsonb; reservada jsonb; respuesta jsonb; evidencia jsonb; bloqueado boolean;
  claim text; claim_anterior text;
  folio_uuid constant text := '2D4D13C5-7DE2-42F1-A9A7-F824D50CDF88';
BEGIN
  SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('RESICO77');
  INSERT INTO public.clientes(id,nombre,rfc,regimen_fiscal,codigo_postal,organization_id,email)
    VALUES(cliente,'PM QA','EKU9003173C9','601','01010',fx.org_a,'resico77-pm@qa.invalid');
  INSERT INTO public.configuracion(organization_id,categoria,clave,valor)
    VALUES(fx.org_a,'empresa','rfc','"GODE561231GR8"'),(fx.org_a,'facturacion','isr_resico_automatico','true');
  INSERT INTO public.facturapi_credenciales(organization_id,ambiente,facturapi_org_id)
    VALUES(fx.org_a,'sandbox','org-resico77-qa') RETURNING updated_at INTO stamp;
  PERFORM pg_temp.as_user_rpc_interna(fx.admin_a);
  perfil:=public.registrar_perfil_fiscal_emisor(fx.org_a,'sandbox',fx.admin_a,stamp,0,
    '{"facturapi_org_id":"org-resico77-qa","rfc":"GODE561231GR8","razon_social":"QA","regimen_fiscal":"626","codigo_postal":"01000"}');
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM public.confirmar_perfil_fiscal_emisor(fx.org_a,'sandbox',perfil,public.fecha_negocio_mx());
  factura:=public.crear_factura_manual_idempotente(gen_random_uuid(),
    jsonb_build_object('organization_id',fx.org_a,'cliente_id',cliente,'cliente_nombre','PM QA',
      'rfc_cliente','EKU9003173C9','numero','BORRADOR-77','moneda','MXN','tipo_cambio',1,'subtotal',200.80,'iva',32.12,'total',232.92,
      'fecha_emision',public.fecha_negocio_mx(),'fecha_vencimiento',public.fecha_negocio_mx()+30,
      'metodo_pago','PPD','forma_pago','99','uso_cfdi','G03','serie','QA','dias_credito',30),
    '[
      {"descripcion":"Flete A","cantidad":1,"precio_unitario":100.40,"total":100.40,"clave_sat":"78101800","tipo_iva":"gravado_16","tasa_iva_aplicada":0.16},
      {"descripcion":"Flete B","cantidad":1,"precio_unitario":100.40,"total":100.40,"clave_sat":"78101800","tipo_iva":"gravado_16","tasa_iva_aplicada":0.16}
    ]');
  previa:=public.prevalidar_emision_isr_factura(factura);
  bloqueado:=false;
  BEGIN PERFORM public.reservar_timbrado_isr(factura,fx.admin_a,previa,previa->'emisor');
  EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'authenticated users cannot reserve directly');

  UPDATE public.facturas SET uso_cfdi='G01' WHERE id=factura;
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.as_service_role();
  PERFORM set_config('role','service_role',true);
  bloqueado:=false;
  BEGIN PERFORM public.reservar_timbrado_isr(factura,fx.admin_a,previa,previa->'emisor');
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_FACTURA_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'reservation must match the latest payment and tax inputs');

  PERFORM pg_temp.as_user(fx.admin_a);
  previa:=public.prevalidar_emision_isr_factura(factura);
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.as_service_role();
  PERFORM set_config('role','service_role',true);
  bloqueado:=false;
  BEGIN PERFORM public.reservar_timbrado_isr(factura,fx.admin_b,previa,previa->'emisor');
  EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'service cannot substitute an actor from another organization');
  bloqueado:=false;
  BEGIN PERFORM public.reservar_timbrado_isr(factura,fx.admin_a,previa,(previa->'emisor')||'{"regimen_fiscal":"601"}');
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_FACTURA_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'an observed provider profile must match the frozen profile');

  reservada:=public.reservar_timbrado_isr(factura,fx.admin_a,previa,previa->'emisor');
  claim:=reservada->>'claim';
  PERFORM pg_temp.assert((claim LIKE 'PENDING:%') IS TRUE,'one claim reserved');
  respuesta:=public.registrar_resultado_timbrado_isr(factura,claim,'rechazado','{"http_status":422}');
  PERFORM pg_temp.assert(respuesta->>'estado'='rechazado','definitive HTTP rejection releases an unacknowledged attempt');
  claim_anterior:=claim;
  PERFORM pg_temp.as_user(fx.admin_a);
  previa:=public.prevalidar_emision_isr_factura(factura);
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.as_service_role();
  PERFORM set_config('role','service_role',true);
  claim:=public.reservar_timbrado_isr(factura,fx.admin_a,previa,previa->'emisor')->>'claim';
  PERFORM pg_temp.assert(claim IS DISTINCT FROM claim_anterior,'a definitive rejection permits a new explicit attempt');
  bloqueado:=false;
  BEGIN PERFORM public.reservar_timbrado_isr(factura,fx.admin_a,previa,previa->'emisor');
  EXCEPTION WHEN unique_violation THEN bloqueado:=SQLERRM='LC_ISR_INTENTO_ACTIVO'; END;
  PERFORM pg_temp.assert(bloqueado,'a concurrent emission cannot take another claim');

  PERFORM public.registrar_resultado_timbrado_isr(factura,claim,'pendiente','{"motivo":"timeout"}');
  bloqueado:=false;
  BEGIN PERFORM public.registrar_resultado_timbrado_isr(factura,claim,'rechazado','{"http_status":422}');
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_RECHAZO_INCIERTO'; END;
  PERFORM pg_temp.assert(bloqueado,'a previously uncertain attempt may not be released');
  evidencia:=jsonb_build_object('facturapi_id','invoice-qa-77','uuid',folio_uuid,'external_id',claim,
    'ambiente','sandbox','facturapi_org_id','org-resico77-qa','moneda','MXN','total',230.42,'folio',77,'serie','QA',
    'xml',jsonb_build_object('uuid',folio_uuid,'emisor_rfc','GODE561231GR8','emisor_regimen','626','receptor_rfc','EKU9003173C9',
      'receptor_regimen','601','totales',previa->'totales','uso_cfdi','G01','sha256',repeat('a',64),
      'ruta',fx.org_a::text || '/emitidas/' || folio_uuid || '.xml'));
  respuesta:=public.registrar_resultado_timbrado_isr(factura,claim,'confirmado',jsonb_set(evidencia,'{xml,totales,ret_isr}','2.50'));
  PERFORM pg_temp.assert(respuesta->>'estado'='conciliacion','tax discrepancy preserves the attempt for reconciliation');
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.assert((SELECT facturapi_id=claim AND uuid_fiscal IS NULL AND facturapi_pendiente_id='invoice-qa-77'
    FROM public.facturas WHERE id=factura) IS TRUE,'mismatch stores the remote identifier with the original claim');
  UPDATE public.intentos_timbrado_isr SET creado_at=clock_timestamp()-interval '10 minutes'
  WHERE factura_id=factura AND 'PENDING:' || id::text=claim;
  UPDATE public.facturas SET facturapi_claim_at=(SELECT creado_at FROM public.intentos_timbrado_isr
    WHERE factura_id=factura AND 'PENDING:' || id::text=claim) WHERE id=factura;
  PERFORM pg_temp.as_user(fx.admin_a);
  bloqueado:=false;
  BEGIN PERFORM public.liberar_claim_facturapi_huerfano(factura,5);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_TIMBRADO_PENDIENTE'; END;
  PERFORM pg_temp.assert(bloqueado,'legacy recovery cannot release an aged fiscal attempt');
  bloqueado:=false;
  BEGIN UPDATE public.conceptos_factura SET clave_sat='78101801' WHERE factura_id=factura;
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_INTENTO_ACTIVO'; END;
  PERFORM pg_temp.assert(bloqueado,'pending fiscal data cannot be edited while the result is uncertain');
  PERFORM pg_temp.as_postgres();
  UPDATE public.clientes SET rfc='AAA010101AA0', nombre='Otro nombre', codigo_postal='01020' WHERE id=cliente;
  PERFORM pg_temp.as_service_role();
  PERFORM set_config('role','service_role',true);
  respuesta:=public.registrar_resultado_timbrado_isr(factura,claim,'confirmado',evidencia);
  PERFORM pg_temp.assert(respuesta->>'estado'='confirmado','matching PAC and XML evidence confirms the original attempt');
  PERFORM pg_temp.assert(public.registrar_resultado_timbrado_isr(factura,claim,'confirmado',evidencia)=respuesta,
    'recovery replay of the same evidence is idempotent');
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.assert((SELECT count(*)=2 FROM public.intentos_timbrado_isr WHERE factura_id=factura),
    'both attempts remain auditable without duplicate fiscal issue');
  PERFORM pg_temp.assert((SELECT estado='Emitida' AND uuid_fiscal=folio_uuid AND snapshot_emision IS NOT NULL
    AND snapshot_emision#>>'{cliente_snapshot,rfc}'='EKU9003173C9'
    AND snapshot_emision#>>'{cliente_snapshot,cp}'='01010'
    AND snapshot_emision#>>'{organizacion_snapshot,rfc}'='GODE561231GR8'
    AND (snapshot_emision->>'ret_isr')::numeric=2.51 AND total=230.42 AND ret_isr=2.51
    FROM public.facturas WHERE id=factura) IS TRUE,'emit freezes the approved identity and amounts even after catalog changes');
END;
$$;
ROLLBACK;
