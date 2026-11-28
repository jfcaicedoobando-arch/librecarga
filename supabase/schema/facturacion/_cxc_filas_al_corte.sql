CREATE OR REPLACE FUNCTION public._cxc_filas_al_corte(p_org uuid,p_fecha date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH vigentes AS MATERIALIZED (
    SELECT DISTINCT ON (fuente,fuente_id) fuente,fuente_id,factura_id,datos
    FROM public.cxc_versiones
    WHERE organization_id=p_org AND fecha_efectiva<=p_fecha
    ORDER BY fuente,fuente_id,id DESC
  ), saldos AS (
    SELECT f.factura_id,f.datos,
      GREATEST((f.datos->>'total')::numeric - COALESCE(SUM(
        CASE a.fuente
          WHEN 'pagos_factura' THEN (a.datos->>'monto')::numeric
          WHEN 'factura_notas_credito' THEN public.nc_convertida_a_moneda_factura(
            (a.datos->>'monto')::numeric,a.datos->>'moneda',(a.datos->>'tc')::numeric,
            f.datos->>'moneda',(f.datos->>'tc')::numeric)
        END
      ),0),0) AS saldo
    FROM vigentes f
    LEFT JOIN vigentes a ON a.factura_id=f.factura_id AND a.fuente IN ('pagos_factura','factura_notas_credito')
      AND a.datos IS NOT NULL
    WHERE f.fuente='facturas' AND f.datos IS NOT NULL
      AND NOT EXISTS (SELECT FROM vigentes s WHERE s.fuente='refacturaciones'
        AND s.factura_id=f.factura_id AND s.datos IS NOT NULL)
    GROUP BY f.factura_id,f.datos
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',s.factura_id,'folio',s.datos->>'folio','contraparte',s.datos->>'cliente',
    'moneda',s.datos->>'moneda','saldo',round(s.saldo,2),'fechaEmision',s.datos->>'emision',
    'fechaVencimiento',s.datos->>'vencimiento','tipoCambio',s.datos->'tc',
    'expediente',COALESCE(e.expediente,'')) ORDER BY s.factura_id),'[]'::jsonb)
  FROM saldos s LEFT JOIN public.embarques e
    ON e.id=(s.datos->>'embarque')::uuid AND e.organization_id=p_org
  WHERE round(s.saldo,2)>0;
$$;
