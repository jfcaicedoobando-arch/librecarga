CREATE OR REPLACE FUNCTION public._isr_notas_credito_vigentes(p_factura public.facturas, p_excluir uuid)
RETURNS TABLE(neto_reservado numeric, isr_reservado numeric, iva_reservado numeric,
  neto_aplicado numeric, isr_aplicado numeric, iva_aplicado numeric)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
  WITH notas AS (
    SELECT n.conceptos, n.monto, n.estado IN ('Timbrada', 'Aplicada') AS aplicada,
      public._nc_factor_moneda_factura(n.moneda::text, n.tipo_cambio,
        p_factura.moneda::text, p_factura.tipo_cambio) AS factor
    FROM public.factura_notas_credito n
    WHERE n.factura_id = p_factura.id AND n.organization_id = p_factura.organization_id
      AND n.id IS DISTINCT FROM p_excluir AND n.deleted_at IS NULL
      AND (n.estado IN ('Timbrada', 'Aplicada')
        OR (n.estado IN ('Borrador', 'Aprobada') AND n.facturapi_id LIKE 'PENDING:%'))
  )
  SELECT COALESCE(sum(n.monto * n.factor) FILTER (WHERE NOT n.aplicada), 0),
    COALESCE(sum(t.ret_isr * n.factor) FILTER (WHERE NOT n.aplicada), 0),
    COALESCE(sum(t.ret_iva * n.factor) FILTER (WHERE NOT n.aplicada), 0),
    COALESCE(sum(n.monto * n.factor) FILTER (WHERE n.aplicada), 0),
    COALESCE(sum(t.ret_isr * n.factor) FILTER (WHERE n.aplicada), 0),
    COALESCE(sum(t.ret_iva * n.factor) FILTER (WHERE n.aplicada), 0)
  FROM notas n
  CROSS JOIN LATERAL public._isr_totales_nota_credito(n.conceptos) t
$fn$;
REVOKE ALL ON FUNCTION public._isr_notas_credito_vigentes(public.facturas,uuid) FROM PUBLIC,anon,authenticated,service_role;
