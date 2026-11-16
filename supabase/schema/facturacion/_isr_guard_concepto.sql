CREATE OR REPLACE FUNCTION public._isr_guard_concepto() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cliente uuid; v_eval jsonb; v_parent_org uuid; v_opt_in boolean; v_ambiente text; v_origen jsonb; v_cot public.cotizaciones;
  v_revision boolean := false;
  v_linea jsonb;
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
  IF TG_TABLE_NAME = 'conceptos_venta' THEN
    -- An authenticated writer cannot create an open audit row or reuse a completed review.
    SELECT EXISTS (SELECT 1 FROM public.embarque_revisiones_fiscales r
      WHERE r.embarque_id = NEW.embarque_id AND r.organization_id = NEW.organization_id
        AND r.transaccion = txid_current() AND r.actor_id = auth.uid() AND r.aplicada_at IS NULL)
      INTO v_revision;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL AND (
    (to_jsonb(NEW)->'organization_id',to_jsonb(NEW)->'embarque_id',to_jsonb(NEW)->'proforma_id')
      IS DISTINCT FROM
    (to_jsonb(OLD)->'organization_id',to_jsonb(OLD)->'embarque_id',to_jsonb(OLD)->'proforma_id')
    OR (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      AND NOT (v_revision AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='conceptos_venta' THEN
    IF TG_OP='UPDATE' AND OLD.cotizacion_concepto_origen_id IS DISTINCT FROM NEW.cotizacion_concepto_origen_id THEN
      RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE='23514';
    END IF;
    v_opt_in := public._isr_documento_habilitado(NEW.organization_id) OR EXISTS(
      SELECT 1 FROM public.conceptos_venta WHERE embarque_id=NEW.embarque_id AND evaluacion_fiscal IS NOT NULL
    );
    IF TG_OP='UPDATE' AND OLD.embarque_id IS DISTINCT FROM NEW.embarque_id
      AND (v_opt_in OR NEW.evaluacion_fiscal IS NOT NULL) THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
    END IF;
    IF NEW.evaluacion_fiscal IS NULL AND NEW.proforma_id IS NULL AND NEW.estado_facturacion='pendiente'
      AND v_opt_in THEN
      NEW.evaluacion_fiscal:='{}';
    END IF;
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
  IF v_revision AND NEW.deleted_at IS NULL THEN
    v_linea := public._evaluar_documento_isr_resico(NEW.organization_id, v_cliente, jsonb_build_array(to_jsonb(NEW)))
      ->'conceptos'->0;
    NEW.tipo_iva := v_linea->>'tipo_iva';
    NEW.total := round(NEW.cantidad * NEW.precio_unitario, 2);
    NEW.evaluacion_fiscal := v_linea->'evaluacion_fiscal';
    NEW.tasa_ret_isr := (v_linea->>'tasa_ret_isr')::numeric;
    NEW.monto_ret_isr := (v_linea->>'monto_ret_isr')::numeric;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='conceptos_venta' AND TG_OP='UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL THEN
    IF public._isr_base_revision_venta(to_jsonb(NEW)) IS DISTINCT FROM public._isr_base_revision_venta(to_jsonb(OLD))
      OR NEW.total IS DISTINCT FROM OLD.total THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    NEW.evaluacion_fiscal := OLD.evaluacion_fiscal;
    NEW.tasa_ret_isr := OLD.tasa_ret_isr;
    NEW.monto_ret_isr := OLD.monto_ret_isr;
    RETURN NEW;
  END IF;
  SELECT ambiente INTO v_ambiente FROM public.facturapi_credenciales WHERE organization_id=NEW.organization_id;
  IF TG_TABLE_NAME='conceptos_venta' AND TG_OP='INSERT' AND to_jsonb(NEW)->>'cotizacion_concepto_origen_id' IS NOT NULL THEN
    SELECT c.* INTO v_cot FROM public.cotizaciones c JOIN public.embarques e ON e.cotizacion_id=c.id
      WHERE e.id=NEW.embarque_id AND c.organization_id=NEW.organization_id AND c.deleted_at IS NULL;
    SELECT l INTO v_origen FROM jsonb_array_elements(v_cot.conceptos_venta) l WHERE l->>'id'=NEW.cotizacion_concepto_origen_id;
    IF v_cot.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado' OR v_cot.estado::text NOT IN ('Aceptada','En operación')
      OR v_origen IS NULL OR NEW.origen<>'cotizacion'
      OR (NEW.cantidad,NEW.precio_unitario,NEW.moneda::text,NEW.tipo_iva,NEW.tasa_iva_aplicada)
        IS DISTINCT FROM ((v_origen->>'cantidad')::numeric,(v_origen->>'precio_unitario')::numeric,v_origen->>'moneda',
          v_origen->>'tipo_iva',COALESCE((v_origen->>'tasa_iva_aplicada')::numeric,CASE v_origen->>'tipo_iva' WHEN 'gravado_16' THEN .16 WHEN 'gravado_8' THEN .08 ELSE 0 END)) THEN
      RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE='23514';
    END IF;
    v_eval:=public._evaluar_isr_resico(NEW.organization_id,v_cliente,COALESCE(v_ambiente,'sandbox'),NEW.cantidad,NEW.precio_unitario,NEW.tipo_iva);
    IF v_eval IS DISTINCT FROM v_origen->'evaluacion_fiscal' THEN RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514'; END IF;
    v_eval:=v_origen->'evaluacion_fiscal';
  ELSE
    v_eval := public._evaluar_isr_resico(NEW.organization_id,v_cliente,COALESCE(v_ambiente,'sandbox'),
      NEW.cantidad,NEW.precio_unitario,NEW.tipo_iva);
  END IF;
  NEW.evaluacion_fiscal := v_eval;
  NEW.tasa_ret_isr := (v_eval->>'tasa_ret_isr')::numeric;
  NEW.monto_ret_isr := (v_eval->>'monto_ret_isr')::numeric;
  RETURN NEW;
END;
$$;
