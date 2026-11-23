-- Isolated PostgreSQL fixtures. All changes are rolled back.
BEGIN;
\ir _helpers.sql

CREATE FUNCTION pg_temp.crear_proforma_resico(p_org uuid, p_embarque uuid, p_cliente uuid, p_ids uuid[])
RETURNS public.proformas LANGUAGE sql AS $$
  SELECT public.crear_proforma_atomica(p_org,p_embarque,p_cliente,'Cliente QA','RESICO-73',NULL,p_ids,
    999,999,999,999,999,999,NULL,NULL,30,.16);
$$;

DO $$
DECLARE
  fx record;
  cliente uuid:=gen_random_uuid(); embarque uuid:=gen_random_uuid(); otro uuid:=gen_random_uuid();
  linea1 uuid:=gen_random_uuid(); linea2 uuid:=gen_random_uuid(); linea_usd uuid:=gen_random_uuid();
  legado uuid:=gen_random_uuid(); pendiente uuid:=gen_random_uuid(); perfil uuid; stamp timestamptz;
  normal public.proformas; dolares public.proformas; recreada public.proformas;
  token uuid:=gen_random_uuid(); token_rechazo uuid:=gen_random_uuid(); datos jsonb; bloqueado boolean;
BEGIN
  SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('RESICO73');
  INSERT INTO public.clientes(id,nombre,rfc,organization_id,email)
    VALUES(cliente,'PM QA','EKU9003173C9',fx.org_a,'resico73-pm@qa.invalid');
  INSERT INTO public.configuracion(organization_id,categoria,clave,valor)
    VALUES(fx.org_a,'empresa','rfc','"GODE561231GR8"') ON CONFLICT(organization_id,categoria,clave) DO UPDATE SET valor=EXCLUDED.valor;
  INSERT INTO public.facturapi_credenciales(organization_id,ambiente,facturapi_org_id)
    VALUES(fx.org_a,'sandbox','org-resico73-qa') RETURNING updated_at INTO stamp;
  PERFORM pg_temp.as_user_rpc_interna(fx.admin_a);
  perfil:=public.registrar_perfil_fiscal_emisor(fx.org_a,'sandbox',fx.admin_a,stamp,0,
    '{"facturapi_org_id":"org-resico73-qa","rfc":"GODE561231GR8","razon_social":"QA","regimen_fiscal":"626","codigo_postal":"01000"}');
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM public.confirmar_perfil_fiscal_emisor(fx.org_a,'sandbox',perfil,public.fecha_negocio_mx());
  PERFORM pg_temp.as_postgres();

  INSERT INTO public.embarques(id,organization_id,cliente_id,cliente_nombre,modo,tipo,estado,tipo_cambio_usd)
    VALUES(embarque,fx.org_a,cliente,'PM QA','Terrestre','Nacional','Borrador',20),
          (otro,fx.org_a,cliente,'PM QA','Terrestre','Nacional','Borrador',20);
  INSERT INTO public.conceptos_venta(id,organization_id,embarque_id,descripcion,cantidad,precio_unitario,total,moneda,tipo_iva,aplica_iva)
    VALUES(legado,fx.org_a,embarque,'Histórico',1,50,50,'MXN','gravado_16',true);
  INSERT INTO public.configuracion(organization_id,categoria,clave,valor)
    VALUES(fx.org_a,'facturacion','isr_resico_automatico','true');
  INSERT INTO public.conceptos_venta(id,organization_id,embarque_id,descripcion,cantidad,precio_unitario,total,moneda,tipo_iva,aplica_iva,tasa_iva_aplicada)
    VALUES(linea1,fx.org_a,embarque,'Flete A',1,100.40,100.40,'MXN','gravado_16',true,.16),
          (linea2,fx.org_a,embarque,'Flete B',1,100.40,100.40,'MXN','gravado_16',true,.16),
          (linea_usd,fx.org_a,embarque,'Flete USD',1,100,100,'USD','gravado_16',true,.16),
          (pendiente,fx.org_a,otro,'Sin resolver',1,100,100,'MXN','no_objeto',false,0);

  PERFORM pg_temp.as_user(fx.admin_b);
  bloqueado:=false;
  BEGIN PERFORM pg_temp.crear_proforma_resico(fx.org_b,embarque,cliente,ARRAY[linea1]);
  EXCEPTION WHEN raise_exception THEN bloqueado:=SQLERRM LIKE 'LC_PROFORMA_EMBARQUE_INVALIDO%'; END;
  PERFORM pg_temp.assert(bloqueado,'cross-organization sources are blocked');
  PERFORM pg_temp.as_user(fx.admin_a);
  bloqueado:=false;
  BEGIN PERFORM pg_temp.crear_proforma_resico(fx.org_a,embarque,cliente,ARRAY[legado,linea1]);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_PROFORMA_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'mixed legacy/evaluated sources are blocked');
  bloqueado:=false;
  BEGIN PERFORM pg_temp.crear_proforma_resico(fx.org_a,embarque,cliente,ARRAY[legado]);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_PROFORMA_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'selecting only legacy rows cannot bypass fiscal validation');
  bloqueado:=false;
  BEGIN PERFORM pg_temp.crear_proforma_resico(fx.org_a,otro,cliente,ARRAY[pendiente]);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_PROFORMA_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'pending fiscal classification does not create a proforma');
  PERFORM pg_temp.as_postgres();
  UPDATE public.perfiles_fiscales_emisor SET vigente_desde=public.fecha_negocio_mx()+1 WHERE id=perfil;
  PERFORM pg_temp.as_user(fx.admin_a);
  bloqueado:=false;
  BEGIN PERFORM pg_temp.crear_proforma_resico(fx.org_a,embarque,cliente,ARRAY[linea1,linea2]);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_PROFORMA_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'changed fiscal profile requires a review before capturing the proforma');
  PERFORM pg_temp.as_postgres();
  UPDATE public.perfiles_fiscales_emisor SET vigente_desde=public.fecha_negocio_mx() WHERE id=perfil;
  PERFORM pg_temp.as_user(fx.admin_a);

  normal:=pg_temp.crear_proforma_resico(fx.org_a,embarque,cliente,ARRAY[linea1,linea2]);
  PERFORM pg_temp.assert((normal.subtotal_mxn, normal.iva_mxn, normal.total_mxn) = (200.80,32.13,230.42)
    AND normal.evaluacion_fiscal#>>'{bloques,0,ret_isr}'='2.51', 'server ignores client totals and persists grouped ISR');
  PERFORM pg_temp.assert((SELECT count(*)=2 FROM public.conceptos_venta WHERE proforma_id=normal.id AND estado_facturacion='en_proforma')
    AND jsonb_array_length(normal.conceptos_fiscales)=2,'capture and concept assignment are atomic');
  PERFORM pg_temp.assert(normal.conceptos_fiscales @> jsonb_build_array(jsonb_build_object('id',linea1)),
    'capture retains original sale record');
  bloqueado:=false;
  BEGIN UPDATE public.proformas SET total_mxn=1 WHERE id=normal.id;
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_PROFORMA_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'stored fiscal amount is immutable');
  bloqueado:=false;
  BEGIN UPDATE public.conceptos_venta SET proforma_id=NULL, estado_facturacion='pendiente' WHERE id=linea1;
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_FLUJO_NO_HABILITADO'; END;
  PERFORM pg_temp.assert(bloqueado,'concept cannot escape a live fiscal proforma');
  bloqueado:=false;
  BEGIN INSERT INTO public.proformas(numero,embarque_id,cliente_id,cliente_nombre,expediente,organization_id,evaluacion_fiscal,conceptos_fiscales)
    VALUES('FORGED-73',embarque,cliente,'PM QA','RESICO-73',fx.org_a,normal.evaluacion_fiscal,normal.conceptos_fiscales);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_PROFORMA_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'authenticated user cannot forge a fiscal snapshot');

  dolares:=pg_temp.crear_proforma_resico(fx.org_a,embarque,cliente,ARRAY[linea_usd]);
  PERFORM pg_temp.assert(dolares.total_usd=114.75 AND dolares.total_mxn=2295
    AND dolares.evaluacion_fiscal#>>'{bloques,0,moneda}'='USD' AND jsonb_array_length(dolares.evaluacion_fiscal->'bloques')=1,
    'original USD and the MXN equivalent are kept separately');
  UPDATE public.proformas SET token_publico=token,token_expira_at=now()+interval '1 day',enviada_at=now() WHERE id=normal.id;
  UPDATE public.proformas SET token_publico=token_rechazo,token_expira_at=now()+interval '1 day',enviada_at=now() WHERE id=dolares.id;
  PERFORM pg_temp.as_postgres();
  PERFORM set_config('role','anon',true);
  datos:=public.portal_obtener_proforma_por_token(token);
  PERFORM pg_temp.assert(datos#>>'{proforma,totales_fiscales,0,total}'='230.42' AND jsonb_array_length(datos->'conceptos')=2
    AND datos::text !~ 'evaluacion_fiscal|perfil_id|organization_id|conceptos_fingerprint|cotizacion_concepto_origen_id',
    'public link exposes the approved amounts and display rows only');
  datos:=public.portal_obtener_proforma_por_token(token_rechazo);
  PERFORM pg_temp.assert(datos#>>'{proforma,moneda}'='USD' AND datos#>>'{proforma,subtotal_mxn}' IS NULL
    AND datos#>>'{proforma,total}'='114.75','USD-only portal shows only the original currency');
  PERFORM public.portal_responder_por_token(token,'aceptada');
  PERFORM public.portal_responder_por_token(token_rechazo,'rechazada','Corrección de captura');
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM pg_temp.assert((SELECT proforma_id IS NULL AND estado_facturacion='pendiente' FROM public.conceptos_venta WHERE id=linea_usd),
    'rejection releases the original concept');
  bloqueado:=false;
  BEGIN UPDATE public.proformas SET estado_proforma='facturada' WHERE id=normal.id;
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_FLUJO_NO_HABILITADO'; END;
  PERFORM pg_temp.assert(bloqueado,'direct status updates cannot convert a fiscal proforma');
  bloqueado:=false;
  BEGIN INSERT INTO public.facturas(numero,organization_id,cliente_id,cliente_nombre,fecha_vencimiento,proforma_id)
    VALUES('FACTURA-DIRECTA-73',fx.org_a,cliente,'PM QA',CURRENT_DATE,normal.id);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_FLUJO_NO_HABILITADO'; END;
  PERFORM pg_temp.assert(bloqueado,'direct invoice links cannot bypass the fiscal conversion');
  PERFORM public.eliminar_proforma_rpc(normal.id);
  PERFORM pg_temp.assert((SELECT estado_proforma='cancelada' AND evaluacion_fiscal=normal.evaluacion_fiscal
    AND conceptos_fiscales=normal.conceptos_fiscales
    FROM public.proformas WHERE id=normal.id),'cancellation preserves the approved historic snapshot');
  PERFORM pg_temp.assert((SELECT count(*)=2 FROM public.conceptos_venta WHERE id IN (linea1,linea2)
    AND proforma_id IS NULL AND estado_facturacion='pendiente'),'cancellation releases the original sales');
  recreada:=pg_temp.crear_proforma_resico(fx.org_a,embarque,cliente,ARRAY[linea1,linea2,linea_usd]);
  PERFORM pg_temp.assert(recreada.id<>normal.id AND recreada.total_mxn=2525.42
     AND recreada.evaluacion_fiscal#>>'{bloques,0,total}'='230.42' AND recreada.evaluacion_fiscal#>>'{bloques,1,total}'='114.75',
    'regeneration creates a separate document and preserves independent native totals');
  PERFORM pg_temp.as_postgres();
  PERFORM set_config('role','anon',true);
  datos:=public.portal_obtener_proforma_por_token(token);
  PERFORM pg_temp.assert(datos->>'estado_link'='cancelada' AND NOT (datos->'proforma' ? 'totales_fiscales')
    AND datos->'conceptos'='[]'::jsonb,'cancelled public links remain terminal and disclose no amounts');
END;
$$;
ROLLBACK;
