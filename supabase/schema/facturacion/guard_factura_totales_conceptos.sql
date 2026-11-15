CREATE OR REPLACE FUNCTION public.guard_factura_totales_conceptos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_n        int;
  v_subtotal numeric;
  v_iva      numeric;
  v_isr      numeric;
  v_iva_ret  numeric;
BEGIN
  IF EXISTS(SELECT 1 FROM public.conceptos_factura c WHERE c.factura_id=NEW.id
    AND c.deleted_at IS NULL AND c.tasa_ret_isr=0.0125) THEN
    IF OLD.estado NOT IN ('Borrador','Por timbrar') OR OLD.snapshot_emision IS NOT NULL
      OR NULLIF(btrim(OLD.uuid_fiscal),'') IS NOT NULL THEN
      IF (NEW.subtotal,NEW.iva,NEW.ret_isr,NEW.ret_iva,NEW.total)
        IS DISTINCT FROM (OLD.subtotal,OLD.iva,OLD.ret_isr,OLD.ret_iva,OLD.total) THEN
        RAISE EXCEPTION 'LC_FACTURA_INMUTABLE: los totales fiscales emitidos no se recalculan' USING ERRCODE='P0001';
      END IF;
      RETURN NEW;
    END IF;
    SELECT t.subtotal,t.iva,t.ret_isr,t.ret_iva INTO v_subtotal,v_iva,v_isr,v_iva_ret
    FROM public._totales_factura_resico_agrupados(NEW.id) t;
    IF NEW.estado NOT IN ('Borrador','Por timbrar') OR NEW.snapshot_emision IS NOT NULL
      OR NULLIF(btrim(NEW.uuid_fiscal),'') IS NOT NULL THEN
      -- The freeze trigger has already captured NEW: reject, never fix after freezing.
      IF (NEW.subtotal,NEW.iva,NEW.ret_isr,NEW.ret_iva,NEW.total)
        IS DISTINCT FROM (v_subtotal,v_iva,v_isr,v_iva_ret,v_subtotal+v_iva-v_isr-v_iva_ret) THEN
        RAISE EXCEPTION 'LC_FACTURA_TOTALES_DESCUADRE: revisa los totales antes de emitir' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END IF;
    NEW.subtotal:=v_subtotal; NEW.iva:=v_iva; NEW.ret_isr:=v_isr; NEW.ret_iva:=v_iva_ret;
    NEW.total:=v_subtotal+v_iva-v_isr-v_iva_ret;
    RETURN NEW;
  END IF;
  IF TG_NAME='trg_facturas_totales_fiscal_guard' THEN RETURN NEW; END IF;
  SELECT
    count(*),
    COALESCE(SUM(ROUND(COALESCE(c.cantidad, 1) * COALESCE(c.precio_unitario, 0), 2)), 0),
    COALESCE(SUM(ROUND(
        ROUND(COALESCE(c.cantidad, 1) * COALESCE(c.precio_unitario, 0), 2)
        * COALESCE(c.tasa_iva_aplicada,
                   CASE WHEN c.tipo_iva = 'gravado_16' THEN 0.16
                        WHEN c.tipo_iva = 'gravado_8'  THEN 0.08
                        ELSE 0 END),
        2)), 0),
    COALESCE(SUM(COALESCE(c.monto_ret_isr, 0)), 0),
    COALESCE(SUM(COALESCE(c.monto_ret_iva, 0)), 0)
  INTO v_n, v_subtotal, v_iva, v_isr, v_iva_ret
  FROM public.conceptos_factura c
  WHERE c.factura_id = NEW.id
    AND c.deleted_at IS NULL;

  IF v_n > 0 THEN
    NEW.subtotal := v_subtotal;
    NEW.iva      := v_iva;
    NEW.ret_isr  := v_isr;
    NEW.ret_iva  := v_iva_ret;
    NEW.total    := v_subtotal + v_iva - v_isr - v_iva_ret;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_factura_totales_conceptos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_factura_totales_conceptos() TO authenticated, service_role;
