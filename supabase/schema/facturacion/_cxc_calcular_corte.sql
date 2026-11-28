CREATE OR REPLACE FUNCTION public._cxc_calcular_corte(p_org uuid,p_fecha date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_filas jsonb;
  v_tc jsonb;
BEGIN
  IF p_fecha IS NULL OR p_fecha >= public.fecha_negocio_mx()
    OR p_fecha <> (date_trunc('month',p_fecha) + interval '1 month - 1 day')::date THEN
    RAISE EXCEPTION 'Selecciona el último día de un mes terminado.';
  END IF;
  IF NOT EXISTS (SELECT FROM public.cxc_aperturas WHERE organization_id=p_org AND desde<=p_fecha) THEN
    RAISE EXCEPTION 'Sin corte verificado para la fecha seleccionada.';
  END IF;
  v_filas := public._cxc_filas_al_corte(p_org,p_fecha);
  SELECT jsonb_build_object('fecha',t.fecha,'usdMxn',t.usd_mxn,'eurMxn',t.eur_mxn,'exacto',t.fecha=p_fecha)
    INTO v_tc FROM public.tc_dof_vigente(p_fecha) t;
  RETURN jsonb_build_object('filas',v_filas,'tipoCambio',v_tc);
END;
$$;
