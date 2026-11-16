BEGIN;
\ir _helpers.sql

CREATE FUNCTION pg_temp.proforma_fiscal_fuente(p_org uuid,p_emb uuid,p_cli uuid,p_linea uuid)
RETURNS public.proformas LANGUAGE sql AS $$
  SELECT public.crear_proforma_atomica(p_org,p_emb,p_cli,'Cliente QA','RESICO-74',NULL,ARRAY[p_linea],
    0,0,0,0,0,0,NULL,NULL,30,.16);
$$;
CREATE FUNCTION pg_temp.consolidar_fiscal(p_org uuid,p_emb uuid,p_cli uuid,p_ids uuid[],p_solicitud uuid)
RETURNS public.proformas LANGUAGE sql AS $$
  SELECT public.consolidar_proformas(p_emb,p_cli,'Cliente QA','RESICO-74',NULL,NULL,30,p_org,p_ids,.16,p_solicitud);
$$;
DO $$
DECLARE
  fx record;
  cliente uuid:=gen_random_uuid(); embarque uuid:=gen_random_uuid();
  linea1 uuid:=gen_random_uuid(); linea2 uuid:=gen_random_uuid(); linea_mxn uuid:=gen_random_uuid(); linea_usd uuid:=gen_random_uuid();
  token_previo uuid:=gen_random_uuid(); token uuid:=gen_random_uuid(); solicitud uuid:=gen_random_uuid();
  perfil uuid; stamp timestamptz; a public.proformas; b public.proformas; consolidada public.proformas; mixta public.proformas;
  bloqueado boolean; respuesta jsonb; aprobado_at timestamptz;
BEGIN
  SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('RESICO74');
  INSERT INTO public.clientes(id,nombre,rfc,organization_id,email)
    VALUES(cliente,'PM QA','EKU9003173C9',fx.org_a,'resico74-pm@qa.invalid');
  INSERT INTO public.configuracion(organization_id,categoria,clave,valor)
    VALUES(fx.org_a,'empresa','rfc','"GODE561231GR8"') ON CONFLICT(organization_id,categoria,clave) DO UPDATE SET valor=EXCLUDED.valor;
  INSERT INTO public.facturapi_credenciales(organization_id,ambiente,facturapi_org_id)
    VALUES(fx.org_a,'sandbox','org-resico74-qa') RETURNING updated_at INTO stamp;
  PERFORM pg_temp.as_user_rpc_interna(fx.admin_a);
  perfil:=public.registrar_perfil_fiscal_emisor(fx.org_a,'sandbox',fx.admin_a,stamp,0,
    '{"facturapi_org_id":"org-resico74-qa","rfc":"GODE561231GR8","razon_social":"QA","regimen_fiscal":"626","codigo_postal":"01000"}');
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM public.confirmar_perfil_fiscal_emisor(fx.org_a,'sandbox',perfil,public.fecha_negocio_mx());
  PERFORM pg_temp.as_postgres();
  INSERT INTO public.embarques(id,organization_id,cliente_id,cliente_nombre,modo,tipo,estado,tipo_cambio_usd)
    VALUES(embarque,fx.org_a,cliente,'PM QA','Terrestre','Nacional','Borrador',20);
  INSERT INTO public.configuracion(organization_id,categoria,clave,valor)
    VALUES(fx.org_a,'facturacion','isr_resico_automatico','true');
  INSERT INTO public.conceptos_venta(id,organization_id,embarque_id,descripcion,cantidad,precio_unitario,total,moneda,tipo_iva,aplica_iva,tasa_iva_aplicada)
    VALUES(linea1,fx.org_a,embarque,'Flete QA',1,100.40,100.40,'MXN','gravado_16',true,.16),
          (linea2,fx.org_a,embarque,'Flete QA',1,100.40,100.40,'MXN','gravado_16',true,.16),
          (linea_mxn,fx.org_a,embarque,'Flete QA',1,100,100,'MXN','gravado_16',true,.16),
          (linea_usd,fx.org_a,embarque,'Flete QA',1,100,100,'USD','gravado_16',true,.16);
  PERFORM pg_temp.as_user(fx.admin_a);
  a:=pg_temp.proforma_fiscal_fuente(fx.org_a,embarque,cliente,linea1);
  b:=pg_temp.proforma_fiscal_fuente(fx.org_a,embarque,cliente,linea2);
  PERFORM pg_temp.assert(a.total_mxn+b.total_mxn=230.40,'the two prior approvals add to MXN 230.40');
  UPDATE public.proformas SET estado_cliente='aceptada' WHERE id=a.id;
  UPDATE public.proformas SET token_publico=token_previo,token_expira_at=now()+interval '1 day' WHERE id=b.id;
  consolidada:=pg_temp.consolidar_fiscal(fx.org_a,embarque,cliente,ARRAY[a.id,b.id],solicitud);
  PERFORM pg_temp.assert(consolidada.es_consolidada AND consolidada.total_mxn=230.42 AND consolidada.estado_revision='pendiente'
    AND (consolidada.evaluacion_fiscal#>>'{ajustes_consolidacion,0,diferencia}')::numeric=.02,
    'exact fiscal grouping yields 230.42 MXN and opens a two-cent approval');
  PERFORM pg_temp.assert((pg_temp.consolidar_fiscal(fx.org_a,embarque,cliente,ARRAY[b.id,a.id],solicitud)).id=consolidada.id,
    'retry with the same set returns the same document');
  PERFORM pg_temp.assert((SELECT count(*)=1 AND bool_and(cantidad=2 AND total=200.80 AND iva=32.13
      AND monto_ret_isr=2.51 AND (evaluacion_fiscal->>'base_exacta')::numeric=200.80
      AND linaje_fiscal @> jsonb_build_array(jsonb_build_object('proforma_id',a.id,'concepto_venta_id',linea1),
           jsonb_build_object('proforma_id',b.id,'concepto_venta_id',linea2)))
    FROM public.proforma_conceptos_consolidados WHERE proforma_id=consolidada.id),
    'one compatible group retains both source proforma and concept IDs');
  PERFORM pg_temp.assert((SELECT count(*)=2 FROM public.conceptos_venta WHERE proforma_id=consolidada.id),
    'active source concepts now belong to the consolidated document');
  PERFORM pg_temp.assert((SELECT evaluacion_fiscal=a.evaluacion_fiscal AND conceptos_fiscales=a.conceptos_fiscales
     AND consolidada_en=consolidada.id FROM public.proformas WHERE id=a.id),'source document stays historical with its original totals');

  bloqueado:=false;
  BEGIN UPDATE public.proformas SET estado_revision='aprobada',estado_cliente='aceptada' WHERE id=consolidada.id;
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_CONSOLIDACION_APROBACION'; END;
  PERFORM pg_temp.assert(bloqueado,'generic approval cannot bypass the pending fiscal adjustment');
  bloqueado:=false;
  BEGIN UPDATE public.proforma_conceptos_consolidados SET descripcion='Cambio' WHERE proforma_id=consolidada.id;
  EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'frozen group cannot be edited');
  bloqueado:=false;
  BEGIN UPDATE public.proformas SET token_publico=token WHERE id=consolidada.id;
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_CONSOLIDACION_APROBACION'; END;
  PERFORM pg_temp.assert(bloqueado,'pending difference cannot get a public payment quote');
  PERFORM pg_temp.as_postgres();
  respuesta:=public.reservar_proforma_email(consolidada.id,fx.admin_a,gen_random_uuid(),gen_random_uuid(),
    '{"dias_vigencia":1}', 'https://example.invalid');
  PERFORM pg_temp.assert(respuesta->>'estado'='ajuste_pendiente','email reservation is blocked during review');
  respuesta:=public.reservar_proforma_email(b.id,fx.admin_a,gen_random_uuid(),gen_random_uuid(),
    '{"dias_vigencia":1}', 'https://example.invalid');
  PERFORM pg_temp.assert(respuesta->>'estado'='fuente_consolidada','email cannot recreate an expired source link');
  PERFORM pg_temp.as_user(fx.admin_a);
  bloqueado:=false;
  BEGIN PERFORM public.aprobar_ajuste_consolidacion_proforma(consolidada.id,'caducada');
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_CONSOLIDACION_APROBACION'; END;
  PERFORM pg_temp.assert(bloqueado,'approval must acknowledge exact capture fingerprint');
  PERFORM pg_temp.as_user(fx.admin_b);
  bloqueado:=false;
  BEGIN PERFORM public.aprobar_ajuste_consolidacion_proforma(consolidada.id,consolidada.evaluacion_fiscal->>'conceptos_fingerprint');
  EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
  PERFORM pg_temp.assert(bloqueado,'approval is bound to the active tenant');
  PERFORM pg_temp.as_user(fx.admin_a);
  respuesta:=public.aprobar_ajuste_consolidacion_proforma(consolidada.id,consolidada.evaluacion_fiscal->>'conceptos_fingerprint');
  aprobado_at:=(respuesta->>'aprobada_at')::timestamptz;
  PERFORM pg_temp.assert((SELECT estado_revision='aprobada' AND ajuste_consolidacion_aprobado_at=aprobado_at
    AND ajuste_consolidacion_aprobado_por=fx.admin_a AND estado_cliente='pendiente' FROM public.proformas WHERE id=consolidada.id),
    'new approval is recorded and the customer still has to accept the new document');
  UPDATE public.proformas SET token_publico=token,token_expira_at=now()+interval '1 day' WHERE id=consolidada.id;
  PERFORM pg_temp.as_postgres();
  PERFORM set_config('role','anon',true);
  PERFORM pg_temp.assert(public.portal_obtener_proforma_por_token(token_previo)->>'error'='token_invalido','source link is retired');
  respuesta:=public.portal_obtener_proforma_por_token(token);
  PERFORM pg_temp.assert(respuesta->>'estado_link'='activo'
    AND (respuesta#>>'{proforma,totales_fiscales,0,total}')::numeric=230.42
    AND (respuesta#>>'{proforma,totales_fiscales,0,ret_isr}')::numeric=2.51
    AND jsonb_array_length(respuesta->'conceptos')=1 AND (respuesta#>>'{conceptos,0,cantidad}')::numeric=2
    AND NOT (respuesta#>'{conceptos,0}' ? 'linaje_fiscal'),
    'portal publishes newly approved group and canonical amounts with a minimal public projection');
  PERFORM public.portal_responder_por_token(token,'aceptada');
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM public.eliminar_proforma_rpc(consolidada.id);
  PERFORM pg_temp.assert((SELECT count(*)=2 FROM public.conceptos_venta WHERE id IN (linea1,linea2)
    AND proforma_id IS NULL AND estado_facturacion='pendiente'), 'cancellation frees original lines from the consolidated document');

  a:=pg_temp.proforma_fiscal_fuente(fx.org_a,embarque,cliente,linea_mxn);
  b:=pg_temp.proforma_fiscal_fuente(fx.org_a,embarque,cliente,linea_usd);
  mixta:=pg_temp.consolidar_fiscal(fx.org_a,embarque,cliente,ARRAY[a.id,b.id],gen_random_uuid());
  PERFORM pg_temp.assert(mixta.total_usd=114.75 AND mixta.total_mxn=2409.75 AND mixta.estado_revision='aprobada'
    AND mixta.ajuste_consolidacion_aprobado_at IS NULL
    AND (mixta.evaluacion_fiscal#>>'{bloques,0,total}')::numeric=114.75
    AND (mixta.evaluacion_fiscal#>>'{bloques,1,total}')::numeric=114.75,
    'native MXN and USD are independent from the equivalent and need no approval when unchanged');
  PERFORM pg_temp.as_postgres();
  respuesta:=public.reservar_proforma_email(mixta.id,fx.admin_a,gen_random_uuid(),gen_random_uuid(),
    '{"dias_vigencia":1}', 'https://example.invalid');
  PERFORM pg_temp.assert(respuesta->>'estado'='reservado'
    AND (respuesta#>>'{contenido,total_mxn}')::numeric=114.75 AND (respuesta#>>'{contenido,total_usd}')::numeric=114.75,
    'email uses native amounts in each currency');
END;
$$;
ROLLBACK;
