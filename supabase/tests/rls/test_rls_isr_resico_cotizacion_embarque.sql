-- Fixtures synthetic, transaction-local. Never run on a production database.
BEGIN;
\ir _helpers.sql
\ir _ci_check_isr_resico_acl.sql
\ir _ci_check_isr_resico_comercial_acl.sql
DO $$
DECLARE
  org_a uuid := gen_random_uuid(); org_b uuid := gen_random_uuid();
  usuario uuid := gen_random_uuid(); ajeno uuid := gen_random_uuid();
  operador uuid := gen_random_uuid(); broker uuid := gen_random_uuid(); superadmin uuid := gen_random_uuid();
  cliente uuid := gen_random_uuid(); pf uuid := gen_random_uuid(); generico uuid := gen_random_uuid();
  perfil uuid; stamp timestamptz; r jsonb; bloqueado boolean;
  embarque uuid := gen_random_uuid(); concepto uuid := gen_random_uuid();
  otro_embarque uuid := gen_random_uuid(); legado uuid := gen_random_uuid(); legado_otro uuid := gen_random_uuid();
  cotizacion uuid := gen_random_uuid(); proforma uuid := gen_random_uuid(); consolidado uuid := gen_random_uuid();
  factura uuid := gen_random_uuid(); lineas jsonb; saved jsonb; convertido uuid;
  cot_manual uuid := gen_random_uuid(); manual uuid; datos_manual jsonb; venta_manual jsonb;
  propuesta jsonb; venta_embarque jsonb; costo_embarque jsonb; datos_embarque jsonb; actual timestamptz; solicitud uuid:=gen_random_uuid();
BEGIN
  ALTER TABLE auth.users DISABLE TRIGGER USER;
  INSERT INTO auth.users(id,email) VALUES(usuario,'resico69@qa.invalid'),(ajeno,'resico69-other@qa.invalid');
  INSERT INTO auth.users(id,email) VALUES(operador,'resico69-op@qa.invalid'),(broker,'resico69-broker@qa.invalid'),(superadmin,'resico69-super@qa.invalid');
  ALTER TABLE auth.users ENABLE TRIGGER USER;
  INSERT INTO public.organizations(id,nombre) VALUES(org_a,'RESICO QA'),(org_b,'RESICO QA otra');
  INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(org_a,usuario,'admin_org'),(org_b,ajeno,'admin_org');
  INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(org_a,operador,'coordinador_logistico'),(org_a,broker,'broker');
  INSERT INTO public.user_roles(user_id,role) VALUES(usuario,'admin_org'),(ajeno,'admin_org') ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO public.user_roles(user_id,role) VALUES(operador,'coordinador_logistico'),(broker,'broker'),(superadmin,'super_admin') ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO public.configuracion(organization_id,categoria,clave,valor) VALUES(org_a,'empresa','rfc','"GODE561231GR8"')
    ON CONFLICT(organization_id,categoria,clave) DO UPDATE SET valor=EXCLUDED.valor;
  INSERT INTO public.facturapi_credenciales(organization_id,ambiente,facturapi_org_id)
    VALUES(org_a,'sandbox','org-resico-qa');
  SELECT updated_at INTO stamp FROM public.facturapi_credenciales WHERE organization_id=org_a;
  INSERT INTO public.clientes(id,nombre,rfc,organization_id,email) VALUES
    (cliente,'PM QA','EKU9003173C9',org_a,'pm@qa.invalid'),(pf,'PF QA','GODE561231GR8',org_a,'pf@qa.invalid'),(generico,'Generico QA','XAXX010101000',org_a,'generic@qa.invalid');
  PERFORM pg_temp.as_user_rpc_interna(usuario);
  perfil:=public.registrar_perfil_fiscal_emisor(org_a,'sandbox',usuario,stamp,0,
    '{"facturapi_org_id":"org-resico-qa","rfc":"GODE561231GR8","razon_social":"QA","regimen_fiscal":"626","codigo_postal":"01000"}');
  PERFORM pg_temp.as_user(usuario);
  r:=public.evaluar_isr_resico(org_a,cliente,'sandbox',1,100.3996,'gravado_16');
  PERFORM pg_temp.assert(r->>'estado'='pendiente' AND r->'tasa_ret_isr'='null'::jsonb,'pending is not zero');
  PERFORM public.confirmar_perfil_fiscal_emisor(org_a,'sandbox',perfil,public.fecha_negocio_mx());

  PERFORM pg_temp.as_postgres();
  INSERT INTO public.configuracion(organization_id,categoria,clave,valor) VALUES(org_a,'facturacion','isr_resico_automatico','true');
  lineas:='[{"id":"uno","descripcion":"QA1","cantidad":1,"precio_unitario":100.40,"moneda":"MXN","tipo_iva":"gravado_16","tasa_iva_aplicada":0.16},{"id":"dos","descripcion":"QA2","cantidad":1,"precio_unitario":100.40,"moneda":"MXN","tipo_iva":"gravado_16","tasa_iva_aplicada":0.16},{"id":"usd","descripcion":"QAUSD","cantidad":1,"precio_unitario":10000,"moneda":"USD","tipo_iva":"gravado_16","tasa_iva_aplicada":0.16}]';
  PERFORM pg_temp.as_user(usuario);
  r:=public.evaluar_documento_isr_resico(org_a,cliente,lineas);
  PERFORM pg_temp.assert(r#>>'{snapshot,estado}'='confirmado','batch confirmed');
  PERFORM pg_temp.assert((r#>>'{snapshot,bloques,0,total}')::numeric=230.42 AND (r#>>'{snapshot,bloques,1,total}')::numeric=11475,'exact groups separated currencies');
  PERFORM pg_temp.assert(NOT(r#>'{conceptos,0,evaluacion_fiscal}' ? 'emisor'),'batch privacy');
  INSERT INTO public.cotizaciones(id,folio,organization_id,cliente_id,modo,tipo,conceptos_venta)
    VALUES(cotizacion,'RESICO-STAGE3',org_a,cliente,'Terrestre','Nacional',lineas);
  SELECT evaluacion_fiscal,conceptos_venta INTO saved,lineas FROM public.cotizaciones WHERE id=cotizacion;
  PERFORM pg_temp.assert(saved->>'estado'='confirmado','automatic persisted enrollment');
  PERFORM pg_temp.assert(saved#>>'{bloques,0,total}'='230.42','persisted total');
  bloqueado:=false;
  BEGIN UPDATE public.cotizaciones SET estado='Enviada' WHERE id=cotizacion; EXCEPTION WHEN raise_exception THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'commercial approval still required');
  PERFORM pg_temp.as_postgres();
  PERFORM set_config('lc.cot_autorizacion','1',true);
  UPDATE public.cotizaciones SET autorizada_at=now(),autorizada_por=usuario WHERE id=cotizacion;
  PERFORM set_config('lc.cot_autorizacion','',true);
  UPDATE public.cotizaciones SET estado='Enviada' WHERE id=cotizacion;
  SELECT evaluacion_fiscal INTO r FROM public.cotizaciones WHERE id=cotizacion;
  PERFORM pg_temp.assert(r=saved,'sending preserves approved snapshot');
  bloqueado:=false;
  BEGIN UPDATE public.cotizaciones SET conceptos_venta=jsonb_set(conceptos_venta,'{0,precio_unitario}','200') WHERE id=cotizacion;
  EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'sent snapshot immutable');
  PERFORM pg_temp.as_user(usuario);
  r:=public.revisar_cotizacion_fiscal(cotizacion,saved->>'conceptos_fingerprint','Revisión fiscal explícita QA');
  PERFORM pg_temp.assert((SELECT estado='Borrador' AND autorizada_at IS NULL FROM public.cotizaciones WHERE id=cotizacion),'revision revokes authorization');
  PERFORM pg_temp.assert((SELECT count(*)=1 FROM public.cotizacion_revisiones_fiscales WHERE cotizacion_id=cotizacion),'revision audit persisted');
  PERFORM pg_temp.as_postgres();
  UPDATE public.cotizaciones SET tipo_cambio_usd=20, modo='Marítimo', tipo_embarque='FCL',
    num_contenedores=3, tipo_contenedor='40HC' WHERE id=cotizacion;
  INSERT INTO public.cotizacion_costos(cotizacion_id,organization_id,concepto,unidad_medida,moneda,costo_unitario,precio_venta)
    VALUES(cotizacion,org_a,'Costo QA','Contenedor','USD',8000,10000);
  PERFORM set_config('lc.cot_autorizacion','1',true);
  UPDATE public.cotizaciones SET autorizada_at=now(),autorizada_por=usuario WHERE id=cotizacion;
  PERFORM set_config('lc.cot_autorizacion','',true);
  UPDATE public.cotizaciones SET estado='Aceptada' WHERE id=cotizacion;
  PERFORM pg_temp.as_user(usuario);
  convertido:=public.crear_embarque_borrador_desde_cotizacion(cotizacion);
  PERFORM pg_temp.assert(public.crear_embarque_borrador_desde_cotizacion(cotizacion)=convertido,'conversion reuses shipment');
  r:=public.obtener_evaluacion_fiscal_embarque(convertido);
  PERFORM pg_temp.assert(r#>'{snapshot,bloques}'=saved->'bloques','conversion preserves approved tax groups');
  PERFORM pg_temp.assert((SELECT count(*)=3 FROM public.conceptos_venta WHERE embarque_id=convertido AND deleted_at IS NULL
    AND cotizacion_concepto_origen_id IN ('uno','dos','usd')),'conversion preserves quote line ids once');
  PERFORM pg_temp.assert((SELECT count(DISTINCT contenedor_id)=3 AND sum(monto)=8000
    AND array_agg(monto ORDER BY monto)=ARRAY[2666.66,2666.67,2666.67]::numeric[]
    FROM public.conceptos_costo WHERE embarque_id=convertido AND deleted_at IS NULL),
    'FCL allocates cost across the three containers without losing cents');
  PERFORM pg_temp.assert((SELECT sum(total) FROM public.conceptos_venta WHERE embarque_id=convertido AND moneda='USD')
    - (SELECT sum(monto) FROM public.conceptos_costo WHERE embarque_id=convertido AND moneda='USD')=2000,
    'USD operating margin uses the original sale base');
  PERFORM pg_temp.assert((SELECT estado='Aceptada' FROM public.cotizaciones WHERE id=cotizacion),'draft shipment stays operationally inactive');
  PERFORM pg_temp.as_postgres();
  UPDATE public.perfiles_fiscales_emisor SET vigente_desde=public.fecha_negocio_mx()+1 WHERE id=perfil;
  UPDATE public.conceptos_venta SET descripcion=descripcion || ' detalle QA' WHERE embarque_id=convertido;
  PERFORM pg_temp.as_user(usuario);
  r:=public.obtener_evaluacion_fiscal_embarque(convertido);
  PERFORM pg_temp.assert(r#>'{snapshot,bloques}'=saved->'bloques','non-fiscal edits preserve the approved amounts after profile change');
  PERFORM pg_temp.as_postgres();
  UPDATE public.perfiles_fiscales_emisor SET vigente_desde=public.fecha_negocio_mx() WHERE id=perfil;
  bloqueado:=false;
  BEGIN UPDATE public.conceptos_venta SET precio_unitario=50 WHERE embarque_id=convertido;
  EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'approved amounts require fiscal revision');
  SELECT updated_at INTO actual FROM public.embarques WHERE id=convertido;
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) INTO venta_embarque FROM public.conceptos_venta c WHERE c.embarque_id=convertido;
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) INTO costo_embarque FROM public.conceptos_costo c WHERE c.embarque_id=convertido;
  PERFORM pg_temp.as_user(usuario);
  PERFORM pg_temp.assert(public.preparar_revision_fiscal_embarque(convertido,cliente,venta_embarque,actual) IS NULL,
    'an operational edit does not require a new approval');
  propuesta:=public.preparar_revision_fiscal_embarque(convertido,pf,venta_embarque,actual);
  PERFORM pg_temp.assert((propuesta->>'puede_autorizar')::boolean AND propuesta#>>'{antes,bloques,0,total}'='230.42'
    AND propuesta#>>'{despues,bloques,0,total}'='232.93' AND propuesta#>>'{despues,bloques,1,total}'='11600.00',
    'customer review shows the approved and proposed amounts separately');
  datos_embarque:=jsonb_build_object('cliente_id',pf,'cliente_nombre','PF QA','revision_fiscal',
    jsonb_build_object('huella',propuesta->>'huella','motivo','Cambio de receptor confirmado para QA'));
  bloqueado:=false;
  BEGIN PERFORM public.actualizar_embarque_completo(convertido,datos_embarque-'revision_fiscal',venta_embarque,'[]',NULL,actual);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_REVISION_REQUERIDA'; END;
  PERFORM pg_temp.assert(bloqueado,'writer rejects customer change without confirmation');
  bloqueado:=false;
  BEGIN PERFORM public.actualizar_embarque_completo(convertido,datos_embarque,
    jsonb_set(venta_embarque,'{0,precio_unitario}','50'),'[]',NULL,actual);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_REVISION_REQUERIDA'; END;
  PERFORM pg_temp.assert(bloqueado,'confirmation is bound to the proposed bases');
  bloqueado:=false;
  BEGIN PERFORM public.actualizar_embarque_completo(convertido,datos_embarque,venta_embarque,'[]',NULL,actual-interval '1 second');
  EXCEPTION WHEN serialization_failure THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'optimistic timestamp rejects stale review');
  PERFORM pg_temp.as_user(operador);
  bloqueado:=false;
  BEGIN PERFORM public.actualizar_embarque_completo(convertido,datos_embarque,venta_embarque,'[]',NULL,actual);
  EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'operational role cannot apply the review');
  PERFORM pg_temp.as_user(ajeno);
  bloqueado:=false;
  BEGIN PERFORM public.preparar_revision_fiscal_embarque(convertido,pf,venta_embarque,actual);
  EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'review preview stays inside its organization');
  PERFORM pg_temp.as_user(usuario);
  bloqueado:=false;
  BEGIN PERFORM public.actualizar_embarque_con_contenedores(convertido,datos_embarque,venta_embarque,costo_embarque,solicitud,actual,'[]');
  EXCEPTION WHEN raise_exception THEN bloqueado:=SQLERRM LIKE 'LC_CONTENEDOR_CON_CONCEPTOS%'; END;
  PERFORM pg_temp.assert(bloqueado AND (SELECT cliente_id=cliente FROM public.embarques WHERE id=convertido)
    AND NOT EXISTS(SELECT 1 FROM public.embarque_revisiones_fiscales WHERE embarque_id=convertido),
    'container failure rolls back the recalculation, the audit and the retry claim');
  PERFORM public.actualizar_embarque_con_contenedores(convertido,datos_embarque,venta_embarque,costo_embarque,solicitud,actual,NULL);
  PERFORM public.actualizar_embarque_con_contenedores(convertido,datos_embarque,venta_embarque,costo_embarque,solicitud,actual,NULL);
  r:=public.obtener_evaluacion_fiscal_embarque(convertido);
  PERFORM pg_temp.assert(r#>'{snapshot,bloques}'=propuesta#>'{despues,bloques}' AND r#>>'{snapshot,cliente_id}'=pf::text,
    'reopening shows the approved recalculation');
  PERFORM pg_temp.assert((SELECT count(*)=1 AND bool_and(aplicada_at IS NOT NULL AND actor_id=usuario
      AND snapshot_anterior=propuesta->'antes' AND snapshot_nuevo=propuesta->'despues')
    FROM public.embarque_revisiones_fiscales WHERE embarque_id=convertido),'review audit is immutable and idempotent');
  PERFORM pg_temp.assert((SELECT count(*)=3 FROM public.conceptos_venta WHERE embarque_id=convertido AND deleted_at IS NULL
    AND cotizacion_concepto_origen_id IN ('uno','dos','usd')),'review preserves quote lineage');
  PERFORM pg_temp.as_postgres();
  bloqueado:=false;
  BEGIN UPDATE public.embarques SET cliente_id=cliente WHERE id=convertido;
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_REVISION_REQUERIDA'; END;
  PERFORM pg_temp.assert(bloqueado,'a completed review does not authorize another write in the transaction');
  -- Exercise the existing direct wizard when automatic handover is unavailable.
  INSERT INTO public.cotizaciones(id,folio,organization_id,cliente_id,modo,tipo,tipo_cambio_usd,conceptos_venta)
    VALUES(cot_manual,'RESICO-STAGE3-MANUAL',org_a,cliente,'Terrestre','Nacional',20,lineas);
  INSERT INTO public.cotizacion_costos(cotizacion_id,organization_id,concepto,unidad_medida,moneda,costo_unitario,precio_venta)
    VALUES(cot_manual,org_a,'Costo manual QA','BL','USD',8000,10000);
  PERFORM set_config('lc.cot_autorizacion','1',true);
  UPDATE public.cotizaciones SET autorizada_at=now(),autorizada_por=usuario WHERE id=cot_manual;
  PERFORM set_config('lc.cot_autorizacion','',true);
  ALTER TABLE public.cotizaciones DISABLE TRIGGER trg_cotizacion_zz_embarque_al_aceptar;
  UPDATE public.cotizaciones SET estado='Aceptada' WHERE id=cot_manual;
  ALTER TABLE public.cotizaciones ENABLE TRIGGER trg_cotizacion_zz_embarque_al_aceptar;
  datos_manual:=jsonb_build_object('cotizacion_id',cot_manual,'cliente_id',cliente,
    'cliente_nombre','PM QA','modo','Terrestre','tipo','Nacional','tipo_cambio_usd',20);
  SELECT jsonb_agg(l - 'id' || jsonb_build_object('cotizacion_concepto_origen_id',l->>'id'))
    INTO venta_manual FROM public.cotizaciones c, LATERAL jsonb_array_elements(c.conceptos_venta) l WHERE c.id=cot_manual;
  PERFORM pg_temp.as_user(usuario);
  bloqueado:=false;
  BEGIN PERFORM public.crear_embarque_completo(datos_manual,jsonb_set(venta_manual,'{0,precio_unitario}','50'));
  EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'direct writer rejects amounts different from approved quote');
  manual:=(public.crear_embarque_completo(datos_manual,venta_manual)->>'id')::uuid;
  r:=public.obtener_evaluacion_fiscal_embarque(manual);
  PERFORM pg_temp.assert(r#>'{snapshot,bloques}'=saved->'bloques','direct writer preserves the same approved tax groups');
  PERFORM pg_temp.as_postgres();
  INSERT INTO public.embarques(id,organization_id,cliente_id,cliente_nombre,modo,tipo,estado)
    VALUES(embarque,org_a,cliente,'PM QA','Terrestre','Nacional','Borrador');
  INSERT INTO public.conceptos_venta(id,organization_id,embarque_id,descripcion,cantidad,precio_unitario,tipo_iva,aplica_iva,moneda,total)
    VALUES(concepto,org_a,embarque,'manual QA',1,100.3996,'gravado_16',true,'MXN',100.40);
  PERFORM pg_temp.assert((SELECT evaluacion_fiscal->>'estado'='aplica' AND monto_ret_isr=1.25 FROM public.conceptos_venta WHERE id=concepto),'manual automatic evaluation');
  bloqueado:=false;
  BEGIN UPDATE public.conceptos_venta SET precio_unitario=200,total=200 WHERE id=concepto;
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_REVISION_REQUERIDA'; END;
  PERFORM pg_temp.assert(bloqueado,'direct edits of manually entered fiscal bases also require review');
  SELECT updated_at INTO actual FROM public.embarques WHERE id=embarque;
  PERFORM pg_temp.as_user(usuario);
  venta_embarque:=jsonb_build_array(jsonb_build_object('id',concepto,'precio_unitario',200));
  propuesta:=public.preparar_revision_fiscal_embarque(embarque,cliente,venta_embarque,actual);
  datos_embarque:=jsonb_build_object('revision_fiscal',
    jsonb_build_object('huella',propuesta->>'huella','motivo','Monto de venta confirmado para QA'));
  PERFORM public.actualizar_embarque_completo(embarque,datos_embarque,venta_embarque,'[]',NULL,actual);
  r:=public.obtener_evaluacion_fiscal_embarque(embarque);
  PERFORM pg_temp.assert(r#>>'{snapshot,estado}'='confirmado' AND (r#>>'{snapshot,bloques,0,ret_isr}')::numeric=2.5,'shipment getter canonical');
  PERFORM pg_temp.as_user(ajeno);
  bloqueado:=false;
  BEGIN PERFORM public.obtener_evaluacion_fiscal_embarque(embarque); EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'shipment getter tenant');
END;
$$;
ROLLBACK;
