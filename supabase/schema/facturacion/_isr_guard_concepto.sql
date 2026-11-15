CREATE OR REPLACE FUNCTION public._isr_guard_concepto() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cliente uuid; v_eval jsonb; v_parent_org uuid; v_opt_in boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.evaluacion_fiscal IS NOT NULL THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL AND NEW.evaluacion_fiscal IS NULL THEN
    RAISE EXCEPTION 'LC_ISR_NO_DESACTIVAR' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL AND (
    (to_jsonb(NEW)->'organization_id',to_jsonb(NEW)->'embarque_id',to_jsonb(NEW)->'proforma_id',to_jsonb(NEW)->'deleted_at')
      IS DISTINCT FROM
    (to_jsonb(OLD)->'organization_id',to_jsonb(OLD)->'embarque_id',to_jsonb(OLD)->'proforma_id',to_jsonb(OLD)->'deleted_at')
  ) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  IF NEW.evaluacion_fiscal IS NULL THEN
    IF NEW.tasa_ret_isr IS NOT NULL OR NEW.monto_ret_isr IS NOT NULL THEN
      RAISE EXCEPTION 'LC_ISR_EVALUACION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    v_opt_in := (
      (TG_TABLE_NAME='conceptos_venta' AND EXISTS(SELECT 1 FROM public.conceptos_venta
        WHERE embarque_id=(to_jsonb(NEW)->>'embarque_id')::uuid AND evaluacion_fiscal IS NOT NULL))
      OR (TG_TABLE_NAME='proforma_conceptos_consolidados' AND EXISTS(SELECT 1 FROM public.proforma_conceptos_consolidados
        WHERE proforma_id=(to_jsonb(NEW)->>'proforma_id')::uuid AND evaluacion_fiscal IS NOT NULL))
    );
    -- Serialize opt-in against legacy conversion, not ordinary legacy edits.
    IF TG_TABLE_NAME='conceptos_venta' AND NEW.proforma_id IS NOT NULL THEN
      PERFORM 1 FROM public.embarques WHERE id=NEW.embarque_id FOR NO KEY UPDATE;
      SELECT EXISTS(SELECT 1 FROM public.conceptos_venta WHERE embarque_id=NEW.embarque_id
        AND evaluacion_fiscal IS NOT NULL) INTO v_opt_in;
      IF v_opt_in THEN RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514'; END IF;
    END IF;
    IF v_opt_in AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND
      (to_jsonb(NEW)->'embarque_id',to_jsonb(NEW)->'proforma_id',NEW.organization_id) IS DISTINCT FROM
      (to_jsonb(OLD)->'embarque_id',to_jsonb(OLD)->'proforma_id',OLD.organization_id))) THEN
      RAISE EXCEPTION 'LC_ISR_EVALUACION_REQUERIDA' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'conceptos_venta' THEN
    SELECT cliente_id,organization_id INTO v_cliente,v_parent_org FROM public.embarques WHERE id=NEW.embarque_id FOR NO KEY UPDATE;
    IF EXISTS(SELECT 1 FROM public.conceptos_venta WHERE embarque_id=NEW.embarque_id AND proforma_id IS NOT NULL) THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
    END IF;
    IF NEW.proforma_id IS NOT NULL OR NEW.estado_facturacion <> 'pendiente' THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT cliente_id,organization_id INTO v_cliente,v_parent_org FROM public.proformas
      WHERE id=NEW.proforma_id AND estado_aprobacion='borrador' AND estado_proforma='pendiente'
      AND enviada_at IS NULL AND factura_id IS NULL AND factura_secundaria_id IS NULL
      AND estado_cliente='pendiente' AND consolidada_en IS NULL FOR NO KEY UPDATE;
    IF EXISTS(SELECT 1 FROM public.conceptos_factura WHERE proforma_id_origen=NEW.proforma_id) THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
    END IF;
  END IF;
  IF v_parent_org IS DISTINCT FROM NEW.organization_id OR v_parent_org IS NULL THEN
    RAISE EXCEPTION 'LC_ISR_PADRE_INVALIDO' USING ERRCODE = '23514';
  END IF;
  v_eval := public._evaluar_isr_resico(NEW.organization_id,v_cliente,NEW.evaluacion_fiscal->>'ambiente',
    NEW.cantidad,NEW.precio_unitario,NEW.tipo_iva);
  NEW.evaluacion_fiscal := v_eval;
  NEW.tasa_ret_isr := (v_eval->>'tasa_ret_isr')::numeric;
  NEW.monto_ret_isr := (v_eval->>'monto_ret_isr')::numeric;
  RETURN NEW;
END;
$$;
