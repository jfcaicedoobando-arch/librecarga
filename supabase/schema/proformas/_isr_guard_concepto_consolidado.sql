CREATE OR REPLACE FUNCTION public._isr_guard_concepto_consolidado() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.linaje_fiscal IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.linaje_fiscal IS NOT NULL OR EXISTS (SELECT 1 FROM public.proformas p
    WHERE p.id = NEW.proforma_id AND p.evaluacion_fiscal IS NOT NULL) THEN
    IF TG_OP <> 'INSERT' OR NEW.linaje_fiscal IS NULL OR NEW.evaluacion_fiscal IS NULL
      OR current_user IS DISTINCT FROM pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID))
      OR NOT EXISTS (SELECT 1 FROM public.proformas p WHERE p.id = NEW.proforma_id AND p.es_consolidada
        AND p.evaluacion_fiscal IS NOT NULL AND p.organization_id = NEW.organization_id
        AND p.embarque_id = NEW.embarque_id AND p.estado_proforma = 'pendiente' AND p.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
