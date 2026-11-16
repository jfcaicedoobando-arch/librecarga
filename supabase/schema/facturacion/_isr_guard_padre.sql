CREATE OR REPLACE FUNCTION public._isr_guard_padre() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME='embarques' THEN
    IF (NEW.cliente_id,NEW.organization_id) IS DISTINCT FROM (OLD.cliente_id,OLD.organization_id)
      AND EXISTS (SELECT 1 FROM public.conceptos_venta WHERE embarque_id=OLD.id AND evaluacion_fiscal IS NOT NULL)
      AND (NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NOT EXISTS (
        SELECT 1 FROM public.embarque_revisiones_fiscales r
        WHERE r.embarque_id = OLD.id AND r.organization_id = OLD.organization_id
          AND r.transaccion = txid_current() AND r.actor_id = auth.uid() AND r.aplicada_at IS NULL
          AND (r.snapshot_anterior->>'cliente_id')::uuid IS NOT DISTINCT FROM OLD.cliente_id
          AND (r.snapshot_nuevo->>'cliente_id')::uuid IS NOT DISTINCT FROM NEW.cliente_id
      )) THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
    END IF;
  ELSE
    IF OLD.evaluacion_fiscal IS NULL AND EXISTS (SELECT 1 FROM public.proforma_conceptos_consolidados WHERE proforma_id=OLD.id AND evaluacion_fiscal IS NOT NULL)
      AND ((NEW.cliente_id,NEW.organization_id) IS DISTINCT FROM (OLD.cliente_id,OLD.organization_id)
        OR NEW.estado_aprobacion <> 'borrador' OR NEW.estado_proforma <> 'pendiente'
        OR NEW.enviada_at IS NOT NULL OR NEW.factura_id IS NOT NULL OR NEW.factura_secundaria_id IS NOT NULL
        OR NEW.consolidada_en IS NOT NULL OR NEW.estado_cliente <> 'pendiente') THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
