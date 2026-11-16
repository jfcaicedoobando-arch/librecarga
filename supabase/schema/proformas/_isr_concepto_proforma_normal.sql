CREATE OR REPLACE FUNCTION public._isr_concepto_proforma_normal(p_linea jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT public._isr_base_revision_venta(p_linea) || jsonb_build_object(
    'id', p_linea->'id', 'descripcion', p_linea->'descripcion', 'total', p_linea->'total',
    'contenedor_id', p_linea->'contenedor_id', 'origen', p_linea->'origen',
    'cotizacion_concepto_origen_id', p_linea->'cotizacion_concepto_origen_id',
    'tasa_ret_isr', p_linea->'tasa_ret_isr', 'monto_ret_isr', p_linea->'monto_ret_isr',
    'evaluacion_fiscal', (p_linea->'evaluacion_fiscal')-'emisor'-'receptor');
$$;
