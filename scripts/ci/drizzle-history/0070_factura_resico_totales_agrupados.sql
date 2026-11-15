-- Documentary arithmetic for RESICO drafts. Invoker/RLS; no backfill.
CREATE OR REPLACE FUNCTION public._totales_factura_resico_agrupados(p_factura_id uuid)
RETURNS TABLE(subtotal numeric, iva numeric, ret_isr numeric, ret_iva numeric)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  WITH bases AS (
    SELECT COALESCE(c.cantidad,1)*COALESCE(c.precio_unitario,0) AS base,
      CASE WHEN c.tipo_iva IN ('no_objeto','exento','tasa_0') THEN 0
        WHEN c.tipo_iva='gravado_16' THEN COALESCE(c.tasa_iva_aplicada,0.16)
        WHEN c.tipo_iva='gravado_8' THEN COALESCE(c.tasa_iva_aplicada,0.08) ELSE 0 END AS tasa_iva,
      COALESCE(c.tasa_ret_isr,0) AS tasa_isr, COALESCE(c.tasa_ret_iva,0) AS tasa_ret_iva
    FROM public.conceptos_factura c JOIN public.facturas f ON f.id=c.factura_id
    WHERE c.factura_id=p_factura_id AND c.deleted_at IS NULL AND f.deleted_at IS NULL
  ), iva_grupos AS (
    SELECT round(sum(base*tasa_iva),2) AS importe FROM bases WHERE tasa_iva>0 GROUP BY tasa_iva
  ), isr_grupos AS (
    SELECT round(sum(base*tasa_isr),2) AS importe FROM bases WHERE tasa_isr>0 GROUP BY tasa_isr
  ), ret_iva_grupos AS (
    SELECT round(sum(base*tasa_ret_iva),2) AS importe FROM bases WHERE tasa_ret_iva>0 GROUP BY tasa_ret_iva
  )
  SELECT COALESCE((SELECT round(sum(base),2) FROM bases),0),
    COALESCE((SELECT sum(importe) FROM iva_grupos),0),
    COALESCE((SELECT sum(importe) FROM isr_grupos),0),
    COALESCE((SELECT sum(importe) FROM ret_iva_grupos),0);
$$;
REVOKE ALL ON FUNCTION public._totales_factura_resico_agrupados(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public._totales_factura_resico_agrupados(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.recalc_factura_totales(p_factura_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_n        int;
  v_resico boolean;
  v_editable boolean;
  v_subtotal numeric;
  v_iva      numeric;
  v_isr      numeric;
  v_iva_ret  numeric;
BEGIN
  -- Keep INVOKER/RLS semantics and the existing no-op for an unavailable parent.
  -- Serialize against soft deletion before reading or calculating its concepts.
  PERFORM 1 FROM public.facturas
  WHERE id = p_factura_id AND deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.conceptos_factura c WHERE c.factura_id=f.id
      AND c.deleted_at IS NULL AND c.tasa_ret_isr=0.0125),
    f.estado IN ('Borrador','Por timbrar') AND f.snapshot_emision IS NULL
      AND NULLIF(btrim(f.uuid_fiscal),'') IS NULL
  INTO v_resico,v_editable FROM public.facturas f WHERE f.id=p_factura_id;
  -- A fiscal snapshot/issued invoice must never be reinterpreted by this rule.
  IF v_resico AND NOT v_editable THEN RETURN; END IF;

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
  WHERE c.factura_id = p_factura_id
    AND c.deleted_at IS NULL;

  IF v_resico AND v_editable THEN
    SELECT t.subtotal,t.iva,t.ret_isr,t.ret_iva INTO v_subtotal,v_iva,v_isr,v_iva_ret
    FROM public._totales_factura_resico_agrupados(p_factura_id) t;
  END IF;

  IF v_n = 0 THEN
    -- QA-R2 D-05: factura sin renglones vivos -> totales en cero (antes se
    -- conservaban subtotal/iva capturados y el total quedaba inflado).
    UPDATE public.facturas
       SET subtotal = 0,
           iva = 0,
           ret_isr = 0,
           ret_iva = 0,
           total = 0,
           updated_at = now()
     WHERE id = p_factura_id AND deleted_at IS NULL;
    RETURN;
  END IF;

  UPDATE public.facturas
     SET subtotal   = v_subtotal,
         iva        = v_iva,
         ret_isr    = v_isr,
         ret_iva    = v_iva_ret,
         total      = v_subtotal + v_iva - v_isr - v_iva_ret,
         updated_at = now()
   WHERE id = p_factura_id AND deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.recalc_factura_totales(uuid) IS
  'C4a: recalcula subtotal, IVA, retenciones y total de una factura desde sus conceptos vivos. QA-R2 D-05: sin conceptos -> todo en 0.';

REVOKE ALL ON FUNCTION public.recalc_factura_totales(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_factura_totales(uuid) TO authenticated, service_role;

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

-- Cover state/snapshot-only transitions without changing legacy arithmetic routing.
CREATE TRIGGER trg_facturas_totales_fiscal_guard
BEFORE UPDATE OF estado,snapshot_emision,uuid_fiscal ON public.facturas
FOR EACH ROW EXECUTE FUNCTION public.guard_factura_totales_conceptos();
