CREATE OR REPLACE FUNCTION public._isr_guard_proforma_normal() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.evaluacion_fiscal IS NOT NULL AND (
      current_user IS DISTINCT FROM pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID))
      OR NEW.es_consolidada OR NEW.embarque_id IS NULL OR NEW.deleted_at IS NOT NULL
      OR NEW.factura_id IS NOT NULL OR NEW.factura_secundaria_id IS NOT NULL
      OR NEW.estado_proforma IS DISTINCT FROM 'pendiente' OR NEW.estado_cliente IS DISTINCT FROM 'pendiente'
      OR NEW.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado'
      OR NEW.evaluacion_fiscal->>'organization_id' IS DISTINCT FROM NEW.organization_id::text
      OR NEW.evaluacion_fiscal->>'cliente_id' IS DISTINCT FROM NEW.cliente_id::text
    ) THEN RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.evaluacion_fiscal IS NOT NULL THEN
      RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.evaluacion_fiscal, NEW.conceptos_fiscales) IS DISTINCT FROM (OLD.evaluacion_fiscal, OLD.conceptos_fiscales) THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  IF OLD.evaluacion_fiscal IS NULL THEN RETURN NEW; END IF;
  IF (NEW.organization_id, NEW.cliente_id, NEW.embarque_id, NEW.es_consolidada, NEW.deleted_at,
      NEW.subtotal_usd, NEW.iva_usd, NEW.total_usd, NEW.subtotal_mxn, NEW.iva_mxn, NEW.total_mxn, NEW.tasa_iva_aplicada)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.cliente_id, OLD.embarque_id, OLD.es_consolidada, OLD.deleted_at,
      OLD.subtotal_usd, OLD.iva_usd, OLD.total_usd, OLD.subtotal_mxn, OLD.iva_mxn, OLD.total_mxn, OLD.tasa_iva_aplicada) THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  IF NEW.estado_proforma = 'facturada' OR NEW.factura_id IS NOT NULL OR NEW.factura_secundaria_id IS NOT NULL
    OR NEW.consolidada_en IS NOT NULL OR NEW.folio_factura_externa IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
  END IF;
  IF OLD.estado_cliente = 'rechazada' AND NEW.estado_cliente IS DISTINCT FROM OLD.estado_cliente THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
