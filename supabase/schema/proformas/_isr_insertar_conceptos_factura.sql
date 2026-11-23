CREATE OR REPLACE FUNCTION public._isr_insertar_conceptos_factura(p_factura_id uuid,
  p_proforma_id uuid, p_org uuid, p_es_consolidada boolean, p_moneda public.moneda)
RETURNS void LANGUAGE sql SET search_path = pg_catalog, public, pg_temp AS $$
  WITH filas AS (
    -- Grouped captures preserve the exact price basis and their complete source lineage.
    SELECT c.descripcion, c.cantidad, c.precio_unitario, c.tipo_iva, c.tasa_iva_aplicada, c.total,
      c.tasa_ret_isr, c.monto_ret_isr, p.embarque_id,
      jsonb_build_object('grupo_id', c.id, 'lineas', c.linaje_fiscal, 'evaluacion', c.evaluacion_fiscal) origen
    FROM public.proforma_conceptos_consolidados c
    JOIN public.proformas p ON p.id = c.proforma_id AND p.organization_id = c.organization_id
    WHERE p_es_consolidada AND c.proforma_id = p_proforma_id AND c.organization_id = p_org
      AND c.moneda = p_moneda AND c.deleted_at IS NULL AND c.linaje_fiscal IS NOT NULL
    UNION ALL
    SELECT l->>'descripcion', (l->>'cantidad')::numeric, (l->>'precio_unitario')::numeric, l->>'tipo_iva',
      (l->>'tasa_iva_aplicada')::numeric, (l->>'total')::numeric,
      (l->>'tasa_ret_isr')::numeric, (l->>'monto_ret_isr')::numeric, p.embarque_id,
      jsonb_build_object('lineas', jsonb_build_array(jsonb_build_object('proforma_id', p.id, 'concepto_venta_id', l->'id')),
        'evaluacion', l->'evaluacion_fiscal')
    FROM public.proformas p CROSS JOIN LATERAL jsonb_array_elements(p.conceptos_fiscales) l
    WHERE NOT p_es_consolidada AND p.id = p_proforma_id AND p.organization_id = p_org AND l->>'moneda' = p_moneda::text
  )
  INSERT INTO public.conceptos_factura (factura_id, descripcion, cantidad, precio_unitario, moneda,
    total, organization_id, clave_sat, tipo_iva, tasa_iva_aplicada, tasa_ret_isr, monto_ret_isr,
    embarque_id, proforma_id_origen, origen_fiscal)
  SELECT p_factura_id, f.descripcion, f.cantidad, f.precio_unitario, p_moneda,
    f.total, p_org, COALESCE(public.resolver_clave_sat(p_org, f.descripcion), '78101800'), f.tipo_iva,
    CASE WHEN f.tipo_iva IN ('no_objeto','exento') THEN NULL ELSE f.tasa_iva_aplicada END,
    f.tasa_ret_isr, f.monto_ret_isr, f.embarque_id, p_proforma_id, f.origen
  FROM filas f;
$$;
