-- Documentary arithmetic for RESICO drafts. Invoker/RLS; no backfill.
CREATE OR REPLACE FUNCTION public._totales_factura_resico_agrupados(p_factura_id uuid)
RETURNS TABLE(subtotal numeric, iva numeric, ret_isr numeric, ret_iva numeric)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  WITH bases AS (
    SELECT COALESCE(c.cantidad,1)*COALESCE(c.precio_unitario,0) AS base,
      CASE WHEN c.tipo_iva IN ('no_objeto','exento','tasa_0') THEN 0
        WHEN c.tipo_iva='gravado_16' THEN COALESCE(c.tasa_iva_aplicada,0.16)
        WHEN c.tipo_iva='gravado_8' THEN COALESCE(c.tasa_iva_aplicada,0.08) ELSE 0 END AS tasa_iva,
      COALESCE(c.tasa_ret_isr,0) AS tasa_isr, COALESCE(c.tasa_ret_iva,0) AS tasa_ret_iva
    FROM public.conceptos_factura c JOIN public.facturas f ON f.id=c.factura_id
    WHERE c.factura_id=p_factura_id AND c.deleted_at IS NULL AND f.deleted_at IS NULL
  ), iva_grupos AS (
    SELECT round(sum(base*tasa_iva),2) AS importe FROM bases WHERE tasa_iva>0 GROUP BY tasa_iva
  ), isr_grupos AS (
    SELECT round(sum(base*tasa_isr),2) AS importe FROM bases WHERE tasa_isr>0 GROUP BY tasa_isr
  ), ret_iva_grupos AS (
    SELECT round(sum(base*tasa_ret_iva),2) AS importe FROM bases WHERE tasa_ret_iva>0 GROUP BY tasa_ret_iva
  )
  SELECT COALESCE((SELECT round(sum(base),2) FROM bases),0),
    COALESCE((SELECT sum(importe) FROM iva_grupos),0),
    COALESCE((SELECT sum(importe) FROM isr_grupos),0),
    COALESCE((SELECT sum(importe) FROM ret_iva_grupos),0);
$$;
REVOKE ALL ON FUNCTION public._totales_factura_resico_agrupados(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public._totales_factura_resico_agrupados(uuid) TO authenticated,service_role;
