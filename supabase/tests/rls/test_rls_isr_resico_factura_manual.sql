BEGIN;
\ir _helpers.sql

DO $$
DECLARE
  fx record;
  lector record;
  cliente uuid:=gen_random_uuid(); perfil uuid; stamp timestamptz;
  cliente_sin_perfil uuid:=gen_random_uuid();
  solicitud uuid:=gen_random_uuid(); factura uuid; anterior uuid; bloqueado boolean;
  cabecera jsonb; lineas jsonb; revision jsonb;
  embarque uuid:=gen_random_uuid(); serie uuid:=gen_random_uuid(); venta1 uuid:=gen_random_uuid(); venta2 uuid:=gen_random_uuid();
  a public.proformas; b public.proformas; consolidada public.proformas; convertida uuid;
BEGIN
  SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('RESICO76');
  SELECT * INTO STRICT lector FROM pg_temp.seed_org_pair('RESICO76-LECTOR','customer_service');
  INSERT INTO public.clientes(id,nombre,rfc,regimen_fiscal,organization_id,email)
    VALUES(cliente,'PM QA','EKU9003173C9','601',fx.org_a,'resico76-pm@qa.invalid'),
          (cliente_sin_perfil,'PM otra organización','EKU9003173C9','601',fx.org_b,'resico76-otro@qa.invalid');
  INSERT INTO public.configuracion(organization_id,categoria,clave,valor)
    VALUES(fx.org_a,'empresa','rfc','"GODE561231GR8"') ON CONFLICT(organization_id,categoria,clave) DO UPDATE SET valor=EXCLUDED.valor;
  INSERT INTO public.facturapi_credenciales(organization_id,ambiente,facturapi_org_id)
    VALUES(fx.org_a,'sandbox','org-resico76-qa') RETURNING updated_at INTO stamp;
  PERFORM pg_temp.as_user_rpc_interna(fx.admin_a);
  perfil:=public.registrar_perfil_fiscal_emisor(fx.org_a,'sandbox',fx.admin_a,stamp,0,
    '{"facturapi_org_id":"org-resico76-qa","rfc":"GODE561231GR8","razon_social":"QA","regimen_fiscal":"626","codigo_postal":"01000"}');
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM public.confirmar_perfil_fiscal_emisor(fx.org_a,'sandbox',perfil,public.fecha_negocio_mx());
  cabecera:=jsonb_build_object('organization_id',fx.org_a,'cliente_id',cliente,'cliente_nombre','PM QA',
    'rfc_cliente','EKU9003173C9','numero','BORRADOR-RESICO76','moneda','MXN','tipo_cambio',1,'subtotal',1,'iva',1,'total',2,
    'fecha_emision',public.fecha_negocio_mx(),'fecha_vencimiento',public.fecha_negocio_mx()+30,
    'metodo_pago','PPD','forma_pago','99','uso_cfdi','G03','serie','QA','dias_credito',30);
  lineas:='[
    {"descripcion":"Flete A","cantidad":1,"precio_unitario":100.40,"total":1,"clave_sat":"78101800","tipo_iva":"gravado_16","tasa_iva_aplicada":0.16,"tasa_ret_isr":0.10},
    {"descripcion":"Flete B","cantidad":1,"precio_unitario":100.40,"total":1,"clave_sat":"78101800","tipo_iva":"gravado_16","tasa_iva_aplicada":0.16}
  ]';
  anterior:=public.crear_factura_manual_idempotente(gen_random_uuid(),cabecera||'{"numero":"BORRADOR-76-ANTERIOR"}',lineas);
  PERFORM pg_temp.assert((SELECT evaluacion_fiscal IS NULL AND ret_isr=0 FROM public.facturas WHERE id=anterior) IS TRUE,
    'manual legacy without opt-in retains its behavior');
  PERFORM pg_temp.assert(public.prevalidar_emision_isr_factura(anterior) IS NULL,'legacy emission retains its preflight');
  UPDATE public.conceptos_factura SET tasa_ret_iva=.04 WHERE factura_id=anterior;

  PERFORM pg_temp.as_postgres();
  INSERT INTO public.configuracion(organization_id,categoria,clave,valor)
    VALUES(fx.org_a,'facturacion','isr_resico_automatico','true'),
          (fx.org_b,'facturacion','isr_resico_automatico','true'),
          (lector.org_a,'facturacion','isr_resico_automatico','true');
  INSERT INTO public.embarques(id,organization_id,cliente_id,cliente_nombre,modo,tipo,estado,tipo_cambio_usd)
    VALUES(embarque,fx.org_a,cliente,'PM QA','Terrestre','Nacional','Borrador',20);
  INSERT INTO public.factura_series(id,organization_id,codigo) VALUES(serie,fx.org_a,'QA76');
  INSERT INTO public.conceptos_venta(id,organization_id,embarque_id,descripcion,cantidad,precio_unitario,total,moneda,tipo_iva,aplica_iva,tasa_iva_aplicada)
    VALUES(venta1,fx.org_a,embarque,'Flete QA',1,100.40,100.40,'MXN','gravado_16',true,.16),
          (venta2,fx.org_a,embarque,'Flete QA',1,100.40,100.40,'MXN','gravado_16',true,.16);
  PERFORM pg_temp.as_user(fx.admin_a);
  bloqueado:=false;
  BEGIN PERFORM public.prevalidar_emision_isr_factura(anterior);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_FACTURA_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'opt-in requires evaluating old drafts before allowing emission');
  factura:=public.crear_factura_manual_idempotente(solicitud,cabecera,lineas);
  PERFORM pg_temp.assert((SELECT (subtotal,iva,ret_isr,ret_iva,total)=(200.80,32.13,2.51,0,230.42)
    AND evaluacion_fiscal->>'perfil_id'=perfil::text AND evaluacion_fiscal#>>'{receptor,rfc}'='EKU9003173C9'
    AND evaluacion_fiscal#>>'{receptor,regimen_fiscal}'='601'
    FROM public.facturas WHERE id=factura) IS TRUE,'server evaluates accepted issuer and ignores supplied ISR and totals');
  PERFORM pg_temp.assert((SELECT count(*)=2 AND bool_and(
    tasa_ret_isr=.0125 AND total=100.40 AND origen_fiscal->>'captura_id'=id::text)
    FROM public.conceptos_factura WHERE factura_id=factura),'manual capture retains authoritative per-line evaluations');
  PERFORM pg_temp.assert(public.crear_factura_manual_idempotente(solicitud,cabecera,lineas)=factura,
    'retry returns the same evaluated draft');
  bloqueado:=false;
  BEGIN UPDATE public.conceptos_factura SET tasa_ret_isr=0 WHERE factura_id=factura;
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_CONVERSION_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'the existing edit surface cannot override the evaluated ISR');
  PERFORM public.aplicar_evaluacion_isr_factura_manual(anterior);
  PERFORM pg_temp.assert((SELECT (ret_isr,ret_iva,total)=(2.51,8.03,222.39)
    AND (evaluacion_fiscal#>>'{bloques,0,ret_iva}')::numeric=8.03
    FROM public.facturas WHERE id=anterior) IS TRUE,'the existing manual IVA withholding coexists with automatic ISR');
  a:=public.crear_proforma_atomica(fx.org_a,embarque,cliente,'PM QA','RESICO76',NULL,ARRAY[venta1],0,0,0,0,0,0,NULL,NULL,30,.16);
  b:=public.crear_proforma_atomica(fx.org_a,embarque,cliente,'PM QA','RESICO76',NULL,ARRAY[venta2],0,0,0,0,0,0,NULL,NULL,30,.16);
  consolidada:=public.consolidar_proformas(embarque,cliente,'PM QA','RESICO76',NULL,NULL,30,fx.org_a,
    ARRAY[a.id,b.id],.16,gen_random_uuid());
  PERFORM public.aprobar_ajuste_consolidacion_proforma(consolidada.id,consolidada.evaluacion_fiscal->>'conceptos_fingerprint');
  UPDATE public.proformas SET estado_cliente='aceptada' WHERE id=consolidada.id;
  SELECT f.id INTO STRICT convertida FROM public.convertir_proformas_a_factura(ARRAY[consolidada.id],serie,'PPD','99','G03') f;
  revision:=public.prevalidar_emision_isr_factura(convertida);
  PERFORM pg_temp.assert((revision#>>'{receptor,regimen_fiscal}'='601' AND (revision#>>'{totales,total}')::numeric=230.42)
    IS TRUE,'the same preflight checks the approved consolidated invoice');

  PERFORM pg_temp.as_user(fx.admin_b);
  bloqueado:=false;
  BEGIN PERFORM public.aplicar_evaluacion_isr_factura_manual(factura);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_FACTURA_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'the fiscal writer remains scoped to the active organization');
  bloqueado:=false;
  BEGIN PERFORM public.prevalidar_emision_isr_factura(factura);
  EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'another organization cannot read the preflight');
  bloqueado:=false;
  BEGIN PERFORM public.crear_factura_manual_idempotente(gen_random_uuid(),cabecera||jsonb_build_object(
    'organization_id',fx.org_b,'cliente_id',cliente_sin_perfil,'numero','BORRADOR-76-SIN-PERFIL'),lineas);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_FACTURA_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado AND NOT EXISTS (SELECT 1 FROM public.facturas
    WHERE organization_id=fx.org_b AND numero='BORRADOR-76-SIN-PERFIL'),
    'if classification is pending the manual capture rolls back atomically');
  PERFORM pg_temp.as_user(lector.admin_a);
  bloqueado:=false;
  BEGIN PERFORM public.aplicar_evaluacion_isr_factura_manual(factura);
  EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'a reader cannot invoke the fiscal writer');

  PERFORM pg_temp.as_postgres();
  revision:=public._isr_revisar_factura_emision(factura);
  PERFORM pg_temp.assert((revision->>'ambiente'='sandbox' AND revision->>'perfil_id'=perfil::text
    AND revision#>>'{emisor,facturapi_org_id}'='org-resico76-qa' AND revision#>>'{emisor,regimen_fiscal}'='626'
    AND (revision#>>'{totales,total}')::numeric=230.42) IS TRUE,'preflight provides the expected provider organization and amounts');
  revision:=public._isr_revisar_factura_emision(anterior);
  PERFORM pg_temp.assert(((revision#>>'{totales,ret_iva}')::numeric=8.03) IS TRUE,'preflight independently reconciles both retentions');
  bloqueado:=false;
  BEGIN
    UPDATE public.facturapi_credenciales SET facturapi_org_id='otra-qa' WHERE organization_id=fx.org_a;
    PERFORM public._isr_revisar_factura_emision(factura);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_FACTURA_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'a different key binding invalidates the original evaluation before issuance');
  bloqueado:=false;
  BEGIN
    UPDATE public.clientes SET regimen_fiscal='603' WHERE id=cliente;
    PERFORM public._isr_revisar_factura_emision(factura);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_FACTURA_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'a newer receptor regime requires review even when the RFC is unchanged');
END;
$$;
ROLLBACK;
