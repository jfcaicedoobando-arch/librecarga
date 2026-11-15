CREATE OR REPLACE FUNCTION public._isr_guard_conversion_factura() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.proforma_id_origen IS NOT NULL THEN
    PERFORM 1 FROM public.proformas WHERE id=NEW.proforma_id_origen FOR NO KEY UPDATE;
  END IF;
  IF NEW.proforma_id_origen IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.proforma_conceptos_consolidados
    WHERE proforma_id=NEW.proforma_id_origen AND evaluacion_fiscal IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
