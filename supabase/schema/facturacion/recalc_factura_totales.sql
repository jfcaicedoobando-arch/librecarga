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
