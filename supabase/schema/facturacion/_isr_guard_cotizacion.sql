CREATE OR REPLACE FUNCTION public._isr_guard_cotizacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_linea jsonb; v_eval jsonb; v_lineas jsonb := '[]'; v_ambiente text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.evaluacion_fiscal IS NOT NULL THEN RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL AND NEW.evaluacion_fiscal IS NULL THEN
    RAISE EXCEPTION 'LC_ISR_NO_DESACTIVAR' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL
    AND (NEW.organization_id,NEW.deleted_at) IS DISTINCT FROM (OLD.organization_id,OLD.deleted_at) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  IF NEW.evaluacion_fiscal IS NULL THEN
    IF jsonb_typeof(NEW.conceptos_venta) IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.conceptos_venta) l
      WHERE l ?| ARRAY['evaluacion_fiscal','tasa_ret_isr','monto_ret_isr']) THEN
      RAISE EXCEPTION 'LC_ISR_EVALUACION_REQUERIDA' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.conceptos_venta) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'LC_ISR_IMPORTES_INVALIDOS' USING ERRCODE='22023';
  END IF;
  IF NEW.estado::text NOT IN ('Borrador','Solicitada') OR NEW.embarque_id IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
  END IF;
  v_ambiente := NEW.evaluacion_fiscal->>'ambiente';
  -- Document marker survives removal of all lines; opt-in cannot be erased.
  NEW.evaluacion_fiscal := jsonb_build_object('ambiente',v_ambiente,'regla_version','resico_113j_v1');
  FOR v_linea IN SELECT value FROM jsonb_array_elements(NEW.conceptos_venta) LOOP
    v_eval := public._evaluar_isr_resico(NEW.organization_id,NEW.cliente_id,v_ambiente,
      (v_linea->>'cantidad')::numeric,(v_linea->>'precio_unitario')::numeric,v_linea->>'tipo_iva');
    v_lineas := v_lineas || jsonb_build_array(v_linea || jsonb_build_object('evaluacion_fiscal',v_eval,
      'tasa_ret_isr',v_eval->'tasa_ret_isr','monto_ret_isr',v_eval->'monto_ret_isr'));
  END LOOP;
  IF v_ambiente IS NULL OR v_ambiente NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'LC_ISR_AMBIENTE_INVALIDO' USING ERRCODE='22023';
  END IF;
  NEW.conceptos_venta := v_lineas;
  RETURN NEW;
END;
$$;
