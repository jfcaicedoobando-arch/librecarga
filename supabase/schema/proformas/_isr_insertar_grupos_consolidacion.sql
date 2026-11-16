CREATE OR REPLACE FUNCTION public._isr_insertar_grupos_consolidacion(p_proforma_id uuid, p_org uuid,
  p_embarque_id uuid, p_conceptos jsonb)
RETURNS void LANGUAGE sql SET search_path = pg_catalog, public, pg_temp AS $$
  WITH filas AS (
    SELECT l, l->>'descripcion' descripcion, l->>'moneda' moneda, l->>'tipo_iva' tipo_iva,
      (l->>'aplica_iva')::boolean aplica_iva, (l->>'tasa_iva_aplicada')::numeric tasa_iva,
      (l->>'tasa_ret_isr')::numeric tasa_ret_isr, (l->>'cantidad')::numeric cantidad,
      (l->>'precio_unitario')::numeric precio, l->>'contenedor_id' contenedor_id,
      COALESCE(NULLIF(l#>>'{embarque_contenedores,numero_contenedor}', ''), 'Sin contenedor') contenedor,
      NULLIF(l#>>'{embarque_contenedores,tipo_contenedor}', '') tipo_contenedor
    FROM jsonb_array_elements(p_conceptos) l
  ), grupos AS (
    SELECT descripcion, moneda, tipo_iva, aplica_iva, tasa_iva, tasa_ret_isr, precio, contenedor, tipo_contenedor,
      sum(cantidad) cantidad, sum(cantidad*precio) base_exacta,
      (jsonb_agg(l->'evaluacion_fiscal' ORDER BY l->>'id')->0) evaluacion,
      jsonb_agg(jsonb_build_object('proforma_id', l->'proforma_origen_id', 'concepto_venta_id', l->'id') ORDER BY l->>'id') linaje
    FROM filas GROUP BY descripcion, moneda, tipo_iva, aplica_iva, tasa_iva, tasa_ret_isr, precio,
      contenedor_id, contenedor, tipo_contenedor
  )
  INSERT INTO public.proforma_conceptos_consolidados (proforma_id, embarque_id, organization_id,
    contenedor, tipo_contenedor, descripcion, cantidad, precio_unitario, total, moneda, aplica_iva, iva,
    tasa_iva_aplicada, tipo_iva, tasa_ret_isr, monto_ret_isr, evaluacion_fiscal, linaje_fiscal)
  SELECT p_proforma_id, p_embarque_id, p_org, contenedor, tipo_contenedor, descripcion, cantidad, precio,
    round(base_exacta,2), moneda::public.moneda, aplica_iva, round(base_exacta*tasa_iva,2),
    CASE WHEN tipo_iva='no_objeto' THEN NULL ELSE tasa_iva END, tipo_iva, tasa_ret_isr, round(base_exacta*tasa_ret_isr,2),
    evaluacion || jsonb_build_object('base', round(base_exacta,2), 'base_exacta', base_exacta,
      'monto_ret_isr', round(base_exacta*tasa_ret_isr,2)), linaje
  FROM grupos;
$$;
