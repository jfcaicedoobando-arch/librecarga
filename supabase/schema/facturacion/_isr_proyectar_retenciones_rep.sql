CREATE OR REPLACE FUNCTION public._isr_proyectar_retenciones_rep(p_factura public.facturas)
RETURNS TABLE(pago_id uuid, ret_isr numeric, ret_iva numeric)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
  WITH activos AS (
    SELECT p.id,p.fecha_pago,p.created_at,p.monto_aplicado_factura AS monto,p.ret_isr,p.ret_iva,
      (p.uuid_rep IS NOT NULL OR p.facturapi_rep_id IS NOT NULL OR p.estado_rep NOT IN ('Pendiente','Error')) AS fijo
    FROM public.pagos_factura p WHERE p.factura_id=p_factura.id AND p.organization_id=p_factura.organization_id
      AND p.deleted_at IS NULL AND NOT public.pago_rep_anulado(p.estado_rep)
  ), disponible AS (
    SELECT round(p_factura.total-n.neto_aplicado-f.neto,2) AS neto,
      greatest(round(p_factura.ret_isr-n.isr_aplicado-f.isr,2),0) AS isr,
      greatest(round(p_factura.ret_iva-n.iva_aplicado-f.iva,2),0) AS iva
    FROM public._isr_notas_credito_vigentes(p_factura,NULL) n
    CROSS JOIN LATERAL (SELECT COALESCE(sum(a.monto),0) AS neto,
      COALESCE(sum(a.ret_isr),0) AS isr, COALESCE(sum(a.ret_iva),0) AS iva FROM activos a WHERE a.fijo) f
  ), acumulados AS (
    SELECT a.id,a.monto,sum(a.monto) OVER (ORDER BY a.fecha_pago,a.created_at,a.id ROWS UNBOUNDED PRECEDING) AS acumulado
    FROM activos a WHERE NOT a.fijo
  )
  SELECT a.id,
    COALESCE(round(d.isr*least(a.acumulado,d.neto)/NULLIF(d.neto,0),2)
      -round(d.isr*least(a.acumulado-a.monto,d.neto)/NULLIF(d.neto,0),2),0),
    COALESCE(round(d.iva*least(a.acumulado,d.neto)/NULLIF(d.neto,0),2)
      -round(d.iva*least(a.acumulado-a.monto,d.neto)/NULLIF(d.neto,0),2),0)
  FROM acumulados a CROSS JOIN disponible d WHERE d.neto>=0;
$fn$;
REVOKE ALL ON FUNCTION public._isr_proyectar_retenciones_rep(public.facturas) FROM PUBLIC,anon,authenticated,service_role;
