-- Fixtures synthetic, transaction-local. Never run on a production database.
BEGIN;
\ir _helpers.sql
\ir _ci_check_isr_resico_acl.sql
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
  factura uuid := gen_random_uuid();
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
  PERFORM public.confirmar_perfil_fiscal_emisor(org_a,'sandbox',perfil,CURRENT_DATE);
  r:=public.evaluar_isr_resico(org_a,cliente,'sandbox',1,100.3996,'gravado_16');
  PERFORM pg_temp.assert(r->>'estado'='aplica' AND (r->>'base')::numeric=100.40 AND (r->>'monto_ret_isr')::numeric=1.25,'tax on exact base matches provider');
  PERFORM pg_temp.assert(NOT (r ?| ARRAY['emisor','receptor']),'preview does not expose fiscal identity snapshots');
  PERFORM pg_temp.assert((public.evaluar_isr_resico(org_a,cliente,'sandbox',1,100.40,'gravado_16')->>'monto_ret_isr')::numeric=1.26,'rounded unit price is a different input');
  PERFORM pg_temp.assert((public.evaluar_isr_resico(org_a,cliente,'sandbox',1,1.005,'gravado_16')->>'base')::numeric=1.01,'half cent rounds up');
  PERFORM pg_temp.assert((public.evaluar_isr_resico(org_a,cliente,'sandbox',1,0.40,'gravado_16')->>'monto_ret_isr')::numeric*2=0.02,'sum per line not tax on aggregated base');
  PERFORM pg_temp.assert(public.evaluar_isr_resico(org_a,pf,'sandbox',1,100,'gravado_16')->>'estado'='no_aplica','PF receiver');
  PERFORM pg_temp.assert(public.evaluar_isr_resico(org_a,generico,'sandbox',1,100,'gravado_16')->>'estado'='pendiente','generic receiver');
  PERFORM pg_temp.assert(public.evaluar_isr_resico(org_a,cliente,'sandbox',1,100,'no_objeto')->>'motivo'='conflicto_no_objeto','no objeto conflict');
  PERFORM pg_temp.assert(public.evaluar_isr_resico(org_a,cliente,'live',1,100,'gravado_16')->>'motivo'='ambiente_discordante','environment isolation');
  PERFORM pg_temp.as_user(ajeno);
  bloqueado:=false;
  BEGIN PERFORM public.evaluar_isr_resico(org_a,cliente,'sandbox',1,100,'gravado_16');
  EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'cross tenant rejected');
  PERFORM pg_temp.as_user(operador);
  PERFORM pg_temp.assert(public.evaluar_isr_resico(org_a,cliente,'sandbox',1,100,'gravado_16')->>'estado'='aplica','operational preview without fiscal administration');
  PERFORM pg_temp.assert((SELECT count(*) FROM public.perfiles_fiscales_emisor WHERE organization_id=org_a)=0,'operational role still cannot read fiscal table');
  PERFORM pg_temp.as_user(broker);
  bloqueado:=false;
  BEGIN PERFORM public.evaluar_isr_resico(org_a,cliente,'sandbox',1,100,'gravado_16'); EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'broker rejected even with explicit membership');
  PERFORM pg_temp.as_user(superadmin);
  bloqueado:=false;
  BEGIN PERFORM public.evaluar_isr_resico(org_a,cliente,'sandbox',1,100,'gravado_16'); EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'superadmin needs active org');
  PERFORM pg_temp.as_postgres();
  INSERT INTO public.super_admin_org_activa(user_id,organization_id) VALUES(superadmin,org_a);
  PERFORM pg_temp.as_user(superadmin);
  PERFORM pg_temp.assert(public.evaluar_isr_resico(org_a,cliente,'sandbox',1,100,'gravado_16')->>'estado'='aplica','superadmin active scope');
  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
  bloqueado:=false;
  BEGIN PERFORM public.evaluar_isr_resico(org_a,cliente,'sandbox',1,100,'gravado_16'); EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'missing uid rejected');
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.assert(NOT has_function_privilege('anon','public.evaluar_isr_resico(uuid,uuid,text,numeric,numeric,text)','EXECUTE'),'anon rejected');
  PERFORM pg_temp.assert(NOT has_function_privilege('authenticated','public._evaluar_isr_resico(uuid,uuid,text,numeric,numeric,text)','EXECUTE'),'private evaluator closed');

  INSERT INTO public.embarques(id,organization_id,cliente_id,cliente_nombre,modo,tipo,estado)
    VALUES(embarque,org_a,cliente,'PM QA','Terrestre','Nacional','Borrador');
  INSERT INTO public.embarques(id,organization_id,cliente_id,cliente_nombre,modo,tipo,estado)
    VALUES(otro_embarque,org_a,cliente,'PM QA','Terrestre','Nacional','Borrador');
  INSERT INTO public.conceptos_venta(id,organization_id,embarque_id,descripcion,cantidad,precio_unitario,total)
    VALUES(legado,org_a,embarque,'legacy sibling',1,10,10),(legado_otro,org_a,otro_embarque,'legacy other',1,10,10);
  INSERT INTO public.conceptos_venta(id,organization_id,embarque_id,descripcion,cantidad,precio_unitario,tipo_iva,total,evaluacion_fiscal,tasa_ret_isr,monto_ret_isr)
    VALUES(concepto,org_a,embarque,'QA',1,100.3996,'gravado_16',100.40,'{"ambiente":"sandbox","estado":"no_aplica"}',0.1,1000);
  SELECT evaluacion_fiscal INTO r FROM public.conceptos_venta WHERE id=concepto;
  PERFORM pg_temp.assert(r->>'estado'='aplica' AND (r->>'monto_ret_isr')::numeric=1.25,'browser forgery replaced with server result');
  bloqueado:=false;
  BEGIN UPDATE public.conceptos_venta SET precio_unitario=200,total=200 WHERE id=concepto;
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_REVISION_REQUERIDA'; END;
  PERFORM pg_temp.assert(bloqueado AND (SELECT monto_ret_isr=1.25 AND tasa_ret_isr=0.0125
    FROM public.conceptos_venta WHERE id=concepto),'direct update cannot replace an approved calculation');
  bloqueado:=false;
  BEGIN UPDATE public.conceptos_venta SET evaluacion_fiscal=NULL,tasa_ret_isr=NULL,monto_ret_isr=NULL WHERE id=concepto;
  EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'cannot remove evaluation');
  bloqueado:=false;
  BEGIN DELETE FROM public.conceptos_venta WHERE id=concepto; EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'cannot delete and recreate legacy');
  bloqueado:=false;
  BEGIN UPDATE public.conceptos_venta SET deleted_at=now() WHERE id=concepto; EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'cannot hide evaluated line with soft delete');
  bloqueado:=false;
  BEGIN UPDATE public.conceptos_venta SET embarque_id=otro_embarque WHERE id=concepto; EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'cannot reparent evaluated line');
  bloqueado:=false;
  BEGIN UPDATE public.conceptos_venta SET embarque_id=embarque WHERE id=legado_otro; EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'cannot move legacy replacement into evaluated parent');
  INSERT INTO public.conceptos_venta(organization_id,embarque_id,descripcion,cantidad,precio_unitario,total,tipo_iva)
    VALUES(org_a,embarque,'replacement legacy',1,200,200,'gravado_16');
  PERFORM pg_temp.assert((SELECT evaluacion_fiscal->>'estado'='aplica' AND monto_ret_isr=2.50
    FROM public.conceptos_venta WHERE embarque_id=embarque AND descripcion='replacement legacy'),
    'new sibling of an evaluated concept is automatically evaluated');
  bloqueado:=false;
  BEGIN UPDATE public.embarques SET cliente_id=pf WHERE id=embarque; EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'cannot change receiver behind snapshot');
  INSERT INTO public.cotizaciones(id,folio,organization_id,cliente_id,modo,tipo,evaluacion_fiscal,conceptos_venta)
    VALUES(cotizacion,'RESICO-QA',org_a,cliente,'Terrestre','Nacional','{"ambiente":"sandbox"}',
      '[{"descripcion":"QA","cantidad":1,"precio_unitario":100.3996,"moneda":"MXN","tipo_iva":"gravado_16"}]');
  PERFORM pg_temp.assert((SELECT (conceptos_venta#>>'{0,monto_ret_isr}')::numeric=1.25 FROM public.cotizaciones WHERE id=cotizacion),'JSON persistence');
  UPDATE public.cotizaciones SET conceptos_venta='[]' WHERE id=cotizacion;
  bloqueado:=false;
  BEGIN UPDATE public.cotizaciones SET evaluacion_fiscal=NULL WHERE id=cotizacion; EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'empty document retains opt-in');
  INSERT INTO public.proformas(id,numero,organization_id,cliente_id,cliente_nombre,expediente,es_consolidada)
    VALUES(proforma,'RESICO-QA',org_a,cliente,'PM QA','QA',true);
  bloqueado:=false;
  BEGIN UPDATE public.conceptos_venta SET proforma_id=proforma,estado_facturacion='en_proforma' WHERE id=legado; EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'legacy sibling cannot bypass parent opt-in');
  UPDATE public.conceptos_venta SET descripcion='unrelated legacy remains editable' WHERE id=legado_otro;
  INSERT INTO public.proforma_conceptos_consolidados(id,proforma_id,organization_id,descripcion,cantidad,precio_unitario,tipo_iva,evaluacion_fiscal)
    VALUES(consolidado,proforma,org_a,'QA',1,100.3996,'gravado_16','{"ambiente":"sandbox"}');
  PERFORM pg_temp.assert((SELECT monto_ret_isr=1.25 FROM public.proforma_conceptos_consolidados WHERE id=consolidado),'consolidated persistence');
  bloqueado:=false;
  BEGIN UPDATE public.proformas SET enviada_at=now() WHERE id=proforma; EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'incomplete downstream remains closed');
  INSERT INTO public.facturas(id,numero,organization_id,cliente_id,cliente_nombre,fecha_vencimiento)
    VALUES(factura,'RESICO-QA',org_a,cliente,'PM QA',CURRENT_DATE);
  bloqueado:=false;
  BEGIN INSERT INTO public.conceptos_factura(factura_id,organization_id,descripcion,cantidad,precio_unitario,total,proforma_id_origen)
    VALUES(factura,org_a,'attempt direct conversion',1,100.3996,100.40,proforma);
  EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'direct invoice origin cannot bypass conversion guard');
  INSERT INTO public.conceptos_factura(factura_id,organization_id,descripcion,cantidad,precio_unitario,total,tasa_ret_isr)
    VALUES(factura,org_a,'legacy arithmetic unchanged',1,100.3996,100.40,0.0125);
  PERFORM pg_temp.assert((SELECT total=100.40 AND monto_ret_isr=1.25 FROM public.conceptos_factura
    WHERE factura_id=factura),'legacy invoice base and exact arithmetic unchanged');
  UPDATE public.perfiles_fiscales_emisor SET vigente_desde=NULL WHERE id=perfil;
  PERFORM pg_temp.as_user(usuario);
  PERFORM pg_temp.assert(public.evaluar_isr_resico(org_a,cliente,'sandbox',1,100,'gravado_16')->>'motivo'='vigencia_perfil_pendiente','PF626 requires explicit effective date');
  PERFORM pg_temp.as_postgres();
  UPDATE public.perfiles_fiscales_emisor SET regimen_fiscal='601' WHERE id=perfil;
  PERFORM pg_temp.as_user(usuario);
  PERFORM pg_temp.assert(public.evaluar_isr_resico(org_a,cliente,'sandbox',1,100,'gravado_16')->>'estado'='no_aplica','outside RESICO does not require effective date');
  PERFORM pg_temp.as_postgres();
  UPDATE public.clientes SET rfc='ABC991331AA1' WHERE id=cliente;
  PERFORM pg_temp.as_user(usuario);
  PERFORM pg_temp.assert(public.evaluar_isr_resico(org_a,cliente,'sandbox',1,100,'gravado_16')->>'estado'='pendiente','invalid RFC calendar date remains pending');
END;
$$;
ROLLBACK;
