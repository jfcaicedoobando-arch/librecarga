CREATE OR REPLACE FUNCTION public._copiar_conceptos_factura_reemplazo(
  p_nueva_id uuid, p_original_id uuid, p_caso_id uuid
) RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_new public.facturas;
  v_old public.facturas;
  v_cliente public.clientes;
  v_caso public.refacturaciones;
  v_lineas jsonb;
  v_calculo jsonb;
  v_snapshot jsonb;
  v_bloque jsonb;
  v_origen jsonb;
  v_ret_iva numeric;
  v_habilitado boolean;
BEGIN
  SELECT * INTO STRICT v_new FROM public.facturas WHERE id=p_nueva_id AND deleted_at IS NULL;
  SELECT * INTO STRICT v_old FROM public.facturas WHERE id=p_original_id AND organization_id=v_new.organization_id
    AND deleted_at IS NULL FOR UPDATE;
  v_habilitado := public._isr_documento_habilitado(v_new.organization_id);
  IF NOT v_habilitado AND v_old.evaluacion_fiscal IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE='23514';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'concepto_original_id',c.id,
    'cantidad',c.cantidad,'precio_unitario',c.precio_unitario,'moneda',c.moneda,
    'tipo_iva',c.tipo_iva,'tasa_iva_aplicada',c.tasa_iva_aplicada) ORDER BY c.id)
  INTO v_lineas FROM public.conceptos_factura c WHERE c.factura_id=p_original_id
    AND c.organization_id=v_new.organization_id AND c.deleted_at IS NULL;

  INSERT INTO public.conceptos_factura (id,factura_id,organization_id,
    descripcion,cantidad,precio_unitario,moneda,total,clave_sat,tipo_iva,tasa_iva_aplicada,
    tasa_ret_isr,tasa_ret_iva,monto_ret_isr,monto_ret_iva,clave_unidad,embarque_id,proforma_id_origen)
  SELECT (l->>'id')::uuid,p_nueva_id,v_new.organization_id,c.descripcion,c.cantidad,c.precio_unitario,c.moneda,c.total,
    c.clave_sat,c.tipo_iva,c.tasa_iva_aplicada,c.tasa_ret_isr,c.tasa_ret_iva,c.monto_ret_isr,c.monto_ret_iva,
    c.clave_unidad,c.embarque_id,c.proforma_id_origen
  FROM jsonb_array_elements(v_lineas) l JOIN public.conceptos_factura c ON c.id=(l->>'concepto_original_id')::uuid;
  IF NOT v_habilitado THEN RETURN; END IF;

  SELECT * INTO v_cliente FROM public.clientes WHERE id=v_new.cliente_id AND organization_id=v_new.organization_id
    AND deleted_at IS NULL FOR SHARE;
  IF v_cliente.id IS NULL OR v_old.uuid_fiscal IS NULL OR v_lineas IS NULL
    OR upper(btrim(v_cliente.rfc)) IS DISTINCT FROM upper(btrim(v_new.rfc_cliente))
    OR EXISTS (SELECT 1 FROM public.conceptos_factura c WHERE c.factura_id=p_nueva_id AND
      (c.moneda<>v_new.moneda OR c.tasa_ret_iva NOT BETWEEN 0 AND 1
        OR (c.tipo_iva IN ('no_objeto','exento','tasa_0') AND c.tasa_ret_iva<>0))) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE='23514';
  END IF;

  IF p_caso_id IS NOT NULL THEN
    SELECT * INTO STRICT v_caso FROM public.refacturaciones WHERE id=p_caso_id AND organization_id=v_new.organization_id
      AND factura_original_id=p_original_id AND factura_nueva_id=p_nueva_id AND cliente_destino_id=v_new.cliente_id;
  END IF;
  IF v_new.sustituye_a IS DISTINCT FROM (CASE WHEN COALESCE(v_caso.ruta_fiscal,'01')='01' THEN p_original_id END) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE='23514';
  END IF;
  IF v_new.sustituye_a IS NOT NULL AND upper(btrim(v_new.rfc_cliente)) IS DISTINCT FROM
    upper(btrim(COALESCE(v_old.snapshot_emision#>>'{cliente_snapshot,rfc}',v_old.rfc_cliente))) THEN
    RAISE EXCEPTION 'LC_ISR_SUSTITUCION_RECEPTOR' USING ERRCODE='23514';
  END IF;

  v_calculo := public._evaluar_documento_isr_resico(v_new.organization_id,v_new.cliente_id,v_lineas);
  v_snapshot := v_calculo->'snapshot';
  v_bloque := v_snapshot#>'{bloques,0}';
  SELECT t.ret_iva INTO v_ret_iva FROM public._totales_factura_resico_agrupados(p_nueva_id) t;
  IF v_snapshot->>'estado' IS DISTINCT FROM 'confirmado' OR (v_bloque->>'total')::numeric<=v_ret_iva THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE='23514';
  END IF;
  v_bloque := v_bloque || jsonb_build_object('ret_iva',v_ret_iva,'total',(v_bloque->>'total')::numeric-v_ret_iva);
  v_origen := jsonb_build_object('factura_id',p_original_id,'uuid',upper(v_old.uuid_fiscal),'caso_id',p_caso_id,
    'ruta',COALESCE(v_caso.ruta_fiscal,'01'),'ambiente',v_old.ambiente);
  v_snapshot := v_snapshot || jsonb_build_object('factura_id',p_nueva_id,'origen_reemplazo',v_origen,
    'bloques',jsonb_build_array(v_bloque),'emisor',v_calculo#>'{conceptos,0,evaluacion_fiscal,emisor}',
    'receptor',v_calculo#>'{conceptos,0,evaluacion_fiscal,receptor}' || jsonb_build_object('regimen_fiscal',v_cliente.regimen_fiscal));
  UPDATE public.facturas SET evaluacion_fiscal=v_snapshot WHERE id=p_nueva_id;
  UPDATE public.conceptos_factura c SET tasa_ret_isr=(l->>'tasa_ret_isr')::numeric,
    total=(l#>>'{evaluacion_fiscal,base}')::numeric,
    origen_fiscal=jsonb_build_object('factura_original_id',p_original_id,'concepto_original_id',o.id,
      'origen_previo',o.origen_fiscal,'evaluacion',l->'evaluacion_fiscal')
  FROM jsonb_array_elements(v_calculo->'conceptos') l
  JOIN public.conceptos_factura o ON o.id=(l->>'concepto_original_id')::uuid
  WHERE c.id=(l->>'id')::uuid AND c.factura_id=p_nueva_id AND c.organization_id=v_new.organization_id;

  IF NOT EXISTS (SELECT 1 FROM public.facturas f WHERE f.id=p_nueva_id AND
      (f.subtotal,f.iva,f.ret_isr,f.ret_iva,f.total)=((v_bloque->>'subtotal')::numeric,(v_bloque->>'iva')::numeric,
        (v_bloque->>'ret_isr')::numeric,(v_bloque->>'ret_iva')::numeric,(v_bloque->>'total')::numeric)) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE='23514';
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public._copiar_conceptos_factura_reemplazo(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
