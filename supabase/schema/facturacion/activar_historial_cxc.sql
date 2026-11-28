CREATE OR REPLACE FUNCTION public.activar_historial_cxc(p_org uuid,p_evidencia text) RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := public._cxc_org_contador(p_org);
  v_hoy date := public.fecha_negocio_mx();
  v_anterior date;
BEGIN
  IF length(btrim(COALESCE(p_evidencia,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Registra la referencia de la apertura conciliada.';
  END IF;
  -- La apertura debe incluir todas las escrituras previas y entregar las posteriores al journal.
  LOCK TABLE public.facturas, public.pagos_factura, public.factura_notas_credito, public.refacturaciones IN SHARE MODE;
  PERFORM pg_advisory_xact_lock(hashtextextended('cierre-contable:' || v_org::text,0));
  SELECT desde INTO v_anterior FROM public.cxc_aperturas WHERE organization_id=v_org;
  IF FOUND THEN RETURN v_anterior; END IF;
  INSERT INTO public.cxc_aperturas VALUES (v_org,v_hoy,auth.uid(),now(),btrim(p_evidencia));
  INSERT INTO public.cxc_versiones(organization_id,fuente,fuente_id,factura_id,fecha_efectiva,datos)
  SELECT v_org, q.fuente, q.id, q.factura_id, GREATEST(v_hoy,public._cxc_fecha_fuente(q.fuente,d.dato)), d.dato
  FROM (
    SELECT 'facturas' AS fuente,t.id,t.id AS factura_id,to_jsonb(t) AS fila FROM public.facturas t WHERE t.organization_id=v_org
    UNION ALL SELECT 'pagos_factura',t.id,t.factura_id,to_jsonb(t) FROM public.pagos_factura t WHERE t.organization_id=v_org
    UNION ALL SELECT 'factura_notas_credito',t.id,t.factura_id,to_jsonb(t) FROM public.factura_notas_credito t WHERE t.organization_id=v_org
    UNION ALL SELECT 'refacturaciones',t.id,t.factura_original_id,to_jsonb(t) FROM public.refacturaciones t WHERE t.organization_id=v_org
  ) q CROSS JOIN LATERAL (SELECT public._cxc_dato_fuente(q.fuente,q.fila) AS dato) d
  WHERE d.dato IS NOT NULL;
  RETURN v_hoy;
END;
$$;
