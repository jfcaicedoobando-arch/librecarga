CREATE OR REPLACE FUNCTION public._isr_base_revision_venta(p_linea jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT jsonb_build_object('moneda', p_linea->'moneda', 'cantidad', p_linea->'cantidad',
    'precio_unitario', p_linea->'precio_unitario', 'tipo_iva', p_linea->'tipo_iva',
    'aplica_iva', p_linea->'aplica_iva', 'tasa_iva_aplicada', p_linea->'tasa_iva_aplicada');
$$;
