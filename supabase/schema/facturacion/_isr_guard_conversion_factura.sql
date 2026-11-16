CREATE OR REPLACE FUNCTION public._isr_guard_conversion_factura() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_proforma_id uuid := (to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME = 'facturas' THEN 'proforma_id' ELSE 'proforma_id_origen' END)::uuid;
BEGIN
  IF v_proforma_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'conceptos_factura' THEN
    PERFORM 1 FROM public.proformas WHERE id=v_proforma_id FOR NO KEY UPDATE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.proformas WHERE id=v_proforma_id AND evaluacion_fiscal IS NOT NULL
  ) OR (TG_TABLE_NAME='conceptos_factura' AND EXISTS (
    SELECT 1 FROM public.proforma_conceptos_consolidados WHERE proforma_id=v_proforma_id AND evaluacion_fiscal IS NOT NULL
  )) THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
