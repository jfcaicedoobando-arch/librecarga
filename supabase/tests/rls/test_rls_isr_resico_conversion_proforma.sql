BEGIN;
\ir _helpers.sql

CREATE FUNCTION pg_temp.crear_proforma_conversion(p_org uuid,p_emb uuid,p_cli uuid,p_ids uuid[])
RETURNS public.proformas LANGUAGE sql AS $$
  SELECT public.crear_proforma_atomica(p_org,p_emb,p_cli,'Cliente QA','RESICO-75',NULL,p_ids,
    0,0,0,0,0,0,NULL,NULL,30,.16);
$$;

DO $$
DECLARE
  fx record;
  cliente uuid:=gen_random_uuid(); embarque uuid:=gen_random_uuid(); serie uuid:=gen_random_uuid();
  linea1 uuid:=gen_random_uuid(); linea2 uuid:=gen_random_uuid(); usd uuid:=gen_random_uuid();
  solicitud uuid:=gen_random_uuid(); id_mxn uuid; id_usd uuid; borradores uuid[];
  normal public.proformas; a public.proformas; b public.proformas; consolidada public.proformas;
  perfil uuid; stamp timestamptz; bloqueado boolean;
BEGIN
  SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('RESICO75');
  INSERT INTO public.clientes(id,nombre,rfc,organization_id,email)
    VALUES(cliente,'PM QA','EKU9003173C9',fx.org_a,'resico75-pm@qa.invalid');
  INSERT INTO public.configuracion(organization_id,categoria,clave,valor)
    VALUES(fx.org_a,'empresa','rfc','"GODE561231GR8"') ON CONFLICT(organization_id,categoria,clave) DO UPDATE SET valor=EXCLUDED.valor;
  INSERT INTO public.facturapi_credenciales(organization_id,ambiente,facturapi_org_id)
    VALUES(fx.org_a,'sandbox','org-resico75-qa') RETURNING updated_at INTO stamp;
  PERFORM pg_temp.as_user_rpc_interna(fx.admin_a);
  perfil:=public.registrar_perfil_fiscal_emisor(fx.org_a,'sandbox',fx.admin_a,stamp,0,
    '{"facturapi_org_id":"org-resico75-qa","rfc":"GODE561231GR8","razon_social":"QA","regimen_fiscal":"626","codigo_postal":"01000"}');
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM public.confirmar_perfil_fiscal_emisor(fx.org_a,'sandbox',perfil,public.fecha_negocio_mx());
  PERFORM pg_temp.as_postgres();
  INSERT INTO public.embarques(id,organization_id,cliente_id,cliente_nombre,modo,tipo,estado,tipo_cambio_usd)
    VALUES(embarque,fx.org_a,cliente,'PM QA','Terrestre','Nacional','Borrador',20);
  INSERT INTO public.factura_series(id,organization_id,codigo) VALUES(serie,fx.org_a,'QA75');
  INSERT INTO public.tipos_cambio_dof(fecha,usd_mxn,origen) VALUES(public.fecha_negocio_mx(),19.90,'manual')
    ON CONFLICT(fecha) DO UPDATE SET usd_mxn=EXCLUDED.usd_mxn;
  INSERT INTO public.configuracion(organization_id,categoria,clave,valor)
    VALUES(fx.org_a,'facturacion','isr_resico_automatico','true');
  INSERT INTO public.conceptos_venta(id,organization_id,embarque_id,descripcion,cantidad,precio_unitario,total,moneda,tipo_iva,aplica_iva,tasa_iva_aplicada)
    VALUES(linea1,fx.org_a,embarque,'Flete QA',1,100.40,100.40,'MXN','gravado_16',true,.16),
          (linea2,fx.org_a,embarque,'Flete QA',1,100.40,100.40,'MXN','gravado_16',true,.16),
          (usd,fx.org_a,embarque,'Flete QA USD',1,100,100,'USD','gravado_16',true,.16);

  PERFORM pg_temp.as_user(fx.admin_a);
  normal:=pg_temp.crear_proforma_conversion(fx.org_a,embarque,cliente,ARRAY[linea1,linea2,usd]);
  bloqueado:=false;
  BEGIN PERFORM public.convertir_proformas_a_factura(ARRAY[normal.id],serie,'PPD','99','G03',30,NULL,solicitud);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN bloqueado:=SQLERRM LIKE 'LC_PROFORMA_REQUIERE_ACEPTACION:%'; END;
  PERFORM pg_temp.assert(bloqueado,'pending proforma cannot be converted');
  UPDATE public.proformas SET estado_cliente='aceptada' WHERE id=normal.id;

  PERFORM pg_temp.as_user(fx.admin_b);
  bloqueado:=false;
  BEGIN PERFORM public.convertir_proformas_a_factura(ARRAY[normal.id],serie,'PPD','99','G03',30,NULL,solicitud);
  EXCEPTION WHEN raise_exception THEN bloqueado:=SQLERRM='No puedes convertir proformas de otra organización'; END;
  PERFORM pg_temp.assert(bloqueado,'conversion is scoped to the issuer tenant');
  PERFORM pg_temp.as_user(fx.admin_a);
  bloqueado:=false;
  BEGIN
    UPDATE public.clientes SET rfc='AAA010101AA0' WHERE id=cliente;
    PERFORM public.convertir_proformas_a_factura(ARRAY[normal.id],serie,'PPD','99','G03',30,NULL,solicitud);
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_CONVERSION_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'a different RFC with the same tax treatment still requires review');

  SELECT array_agg(f.id ORDER BY f.moneda) INTO borradores FROM
    public.convertir_proformas_a_factura(ARRAY[normal.id],serie,'PPD','99','G03',30,NULL,solicitud) f;
  id_mxn:=borradores[1]; id_usd:=borradores[2];
  PERFORM pg_temp.assert(cardinality(borradores)=2 AND (SELECT factura_id=id_mxn AND factura_secundaria_id=id_usd
    AND estado_proforma='facturada' FROM public.proformas WHERE id=normal.id),'both currency links persist atomically');
  PERFORM pg_temp.assert((SELECT moneda='MXN' AND (subtotal,iva,ret_isr,total)=(200.80,32.13,2.51,230.42)
    AND uuid_fiscal IS NULL AND estado='Borrador' AND evaluacion_fiscal->'perfil_id'=normal.evaluacion_fiscal->'perfil_id'
    AND evaluacion_fiscal->'conceptos_fingerprint'=normal.evaluacion_fiscal->'conceptos_fingerprint'
    AND evaluacion_fiscal#>>'{receptor,rfc}'='EKU9003173C9'
    FROM public.facturas WHERE id=id_mxn),'MXN draft preserves grouped amounts and accepted issuer/recipient identity');
  PERFORM pg_temp.assert((SELECT moneda='USD' AND (subtotal,iva,ret_isr,total,tipo_cambio)=(100,16,1.25,114.75,19.90)
    AND jsonb_array_length(evaluacion_fiscal->'bloques')=1 FROM public.facturas WHERE id=id_usd),
    'USD draft preserves native amounts and uses the invoice-date DOF rate');
  PERFORM pg_temp.assert((SELECT count(*)=2 AND bool_and(tasa_ret_isr=.0125 AND proforma_id_origen=normal.id)
    FROM public.conceptos_factura WHERE factura_id=id_mxn)
    AND EXISTS (SELECT 1 FROM public.conceptos_factura WHERE factura_id=id_mxn AND
      origen_fiscal->'lineas' @> jsonb_build_array(jsonb_build_object('proforma_id',normal.id,'concepto_venta_id',linea1))),
    'normal lines preserve exact origin and rate');
  PERFORM pg_temp.assert((SELECT array_agg(f.id ORDER BY f.moneda)=borradores FROM
     public.convertir_proformas_a_factura(ARRAY[normal.id],serie,'PPD','99','G03',30,NULL,solicitud) f),
    'retry returns the same pair of drafts');
  bloqueado:=false;
  BEGIN UPDATE public.facturas SET facturapi_id='PENDING:qa',facturapi_claim_at=now() WHERE id=id_mxn;
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_TIMBRADO_PENDIENTE'; END;
  PERFORM pg_temp.assert(bloqueado,'the provider claim is blocked before emission');
  bloqueado:=false;
  BEGIN UPDATE public.conceptos_factura SET cantidad=2 WHERE factura_id=id_mxn;
  EXCEPTION WHEN check_violation THEN bloqueado:=SQLERRM='LC_ISR_CONVERSION_REVISION'; END;
  PERFORM pg_temp.assert(bloqueado,'approved commercial line data is frozen');
  PERFORM public.eliminar_factura_borrador(id_mxn);
  PERFORM pg_temp.assert((SELECT estado_proforma='facturada' AND factura_id IS NULL AND factura_secundaria_id=id_usd
    FROM public.proformas WHERE id=normal.id),'removing one draft preserves the other currency');
  PERFORM public.eliminar_factura_borrador(id_usd);
  PERFORM pg_temp.assert((SELECT estado_proforma='pendiente' AND estado_cliente='aceptada' AND factura_secundaria_id IS NULL
    FROM public.proformas WHERE id=normal.id),'removing both drafts restores the accepted proforma');
  PERFORM public.eliminar_proforma_rpc(normal.id);

  a:=pg_temp.crear_proforma_conversion(fx.org_a,embarque,cliente,ARRAY[linea1]);
  b:=pg_temp.crear_proforma_conversion(fx.org_a,embarque,cliente,ARRAY[linea2]);
  consolidada:=public.consolidar_proformas(embarque,cliente,'PM QA','RESICO-75',NULL,NULL,30,fx.org_a,
    ARRAY[a.id,b.id],.16,gen_random_uuid());
  PERFORM public.aprobar_ajuste_consolidacion_proforma(consolidada.id,consolidada.evaluacion_fiscal->>'conceptos_fingerprint');
  UPDATE public.proformas SET estado_cliente='aceptada' WHERE id=consolidada.id;
  SELECT f.id INTO STRICT id_mxn FROM public.convertir_proformas_a_factura(ARRAY[consolidada.id],serie,'PPD','99','G03') f;
  PERFORM pg_temp.assert((SELECT total=230.42 AND ret_isr=2.51 FROM public.facturas WHERE id=id_mxn)
    AND (SELECT count(*)=1 AND bool_and(cantidad=2 AND monto_ret_isr=2.51 AND origen_fiscal->>'grupo_id' IS NOT NULL
        AND origen_fiscal->'lineas' @> jsonb_build_array(
          jsonb_build_object('proforma_id',a.id,'concepto_venta_id',linea1),
          jsonb_build_object('proforma_id',b.id,'concepto_venta_id',linea2)))
      FROM public.conceptos_factura WHERE factura_id=id_mxn),
    'consolidated line preserves the final tax and both original sales');
END;
$$;
ROLLBACK;
