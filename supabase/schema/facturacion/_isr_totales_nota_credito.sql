CREATE OR REPLACE FUNCTION public._isr_totales_nota_credito(p_conceptos jsonb)
RETURNS TABLE(subtotal numeric, iva numeric, ret_isr numeric, ret_iva numeric, total numeric)
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
  WITH bases AS (
    SELECT (c->>'cantidad')::numeric * (c->>'precio_unitario')::numeric AS base,
      CASE c->>'tipo_iva' WHEN 'gravado_16' THEN 0.16 WHEN 'gravado_8' THEN 0.08 ELSE 0 END AS iva,
      COALESCE((c->>'tasa_ret_isr')::numeric, 0) AS ret_isr,
      COALESCE((c->>'tasa_ret_iva')::numeric, 0) AS ret_iva
    FROM jsonb_array_elements(p_conceptos) c
  ), grupos AS (
    SELECT impuesto, round(sum(b.base * t.tasa), 2) AS importe
    FROM bases b
    CROSS JOIN LATERAL (VALUES ('iva', b.iva), ('ret_isr', b.ret_isr), ('ret_iva', b.ret_iva)) t(impuesto, tasa)
    GROUP BY impuesto, tasa
  ), totales AS (
    SELECT COALESCE((SELECT round(sum(base), 2) FROM bases), 0) AS subtotal,
      COALESCE(sum(importe) FILTER (WHERE impuesto = 'iva'), 0) AS iva,
      COALESCE(sum(importe) FILTER (WHERE impuesto = 'ret_isr'), 0) AS ret_isr,
      COALESCE(sum(importe) FILTER (WHERE impuesto = 'ret_iva'), 0) AS ret_iva
    FROM grupos
  )
  SELECT subtotal, iva, ret_isr, ret_iva, subtotal + iva - ret_isr - ret_iva FROM totales
$fn$;
REVOKE ALL ON FUNCTION public._isr_totales_nota_credito(jsonb) FROM PUBLIC,anon,authenticated,service_role;
