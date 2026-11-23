-- Rated credits and receipt allocations on evaluated invoices.

CREATE OR REPLACE FUNCTION public._isr_totales_nota_credito(p_conceptos jsonb)
RETURNS TABLE(subtotal numeric, iva numeric, ret_isr numeric, ret_iva numeric, total numeric)
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
  WITH bases AS (
    SELECT (c->>'cantidad')::numeric * (c->>'precio_unitario')::numeric AS base,
      CASE c->>'tipo_iva' WHEN 'gravado_16' THEN 0.16 WHEN 'gravado_8' THEN 0.08 ELSE 0 END AS iva,
      COALESCE((c->>'tasa_ret_isr')::numeric, 0) AS ret_isr,
      COALESCE((c->>'tasa_ret_iva')::numeric, 0) AS ret_iva
    FROM jsonb_array_elements(p_conceptos) c
  ), grupos AS (
    SELECT impuesto, round(sum(b.base * t.tasa), 2) AS importe
    FROM bases b
    CROSS JOIN LATERAL (VALUES ('iva', b.iva), ('ret_isr', b.ret_isr), ('ret_iva', b.ret_iva)) t(impuesto, tasa)
    GROUP BY impuesto, tasa
  ), totales AS (
    SELECT COALESCE((SELECT round(sum(base), 2) FROM bases), 0) AS subtotal,
      COALESCE(sum(importe) FILTER (WHERE impuesto = 'iva'), 0) AS iva,
      COALESCE(sum(importe) FILTER (WHERE impuesto = 'ret_isr'), 0) AS ret_isr,
      COALESCE(sum(importe) FILTER (WHERE impuesto = 'ret_iva'), 0) AS ret_iva
    FROM grupos
  )
  SELECT subtotal, iva, ret_isr, ret_iva, subtotal + iva - ret_isr - ret_iva FROM totales
$fn$;
REVOKE ALL ON FUNCTION public._isr_totales_nota_credito(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public._isr_notas_credito_vigentes(p_factura public.facturas, p_excluir uuid)
RETURNS TABLE(neto_reservado numeric, isr_reservado numeric, iva_reservado numeric,
  neto_aplicado numeric, isr_aplicado numeric, iva_aplicado numeric)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
  WITH notas AS (
    SELECT n.conceptos, n.monto, n.estado IN ('Timbrada', 'Aplicada') AS aplicada,
      public._nc_factor_moneda_factura(n.moneda::text, n.tipo_cambio,
        p_factura.moneda::text, p_factura.tipo_cambio) AS factor
    FROM public.factura_notas_credito n
    WHERE n.factura_id = p_factura.id AND n.organization_id = p_factura.organization_id
      AND n.id IS DISTINCT FROM p_excluir AND n.deleted_at IS NULL
      AND (n.estado IN ('Timbrada', 'Aplicada')
        OR (n.estado IN ('Borrador', 'Aprobada') AND n.facturapi_id LIKE 'PENDING:%'))
  )
  SELECT COALESCE(sum(n.monto * n.factor) FILTER (WHERE NOT n.aplicada), 0),
    COALESCE(sum(t.ret_isr * n.factor) FILTER (WHERE NOT n.aplicada), 0),
    COALESCE(sum(t.ret_iva * n.factor) FILTER (WHERE NOT n.aplicada), 0),
    COALESCE(sum(n.monto * n.factor) FILTER (WHERE n.aplicada), 0),
    COALESCE(sum(t.ret_isr * n.factor) FILTER (WHERE n.aplicada), 0),
    COALESCE(sum(t.ret_iva * n.factor) FILTER (WHERE n.aplicada), 0)
  FROM notas n
  CROSS JOIN LATERAL public._isr_totales_nota_credito(n.conceptos) t
$fn$;
REVOKE ALL ON FUNCTION public._isr_notas_credito_vigentes(public.facturas,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public._isr_guard_nota_credito()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_factura public.facturas;
  v_totales record;
  v_notas record;
  v_pagos record;
  v_factor numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.factura_id, NEW.organization_id) IS DISTINCT FROM (OLD.factura_id, OLD.organization_id)
    AND EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = OLD.factura_id AND f.evaluacion_fiscal IS NOT NULL) THEN
    RAISE EXCEPTION 'LC_ISR_NC_INMUTABLE' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_factura FROM public.facturas
  WHERE id = NEW.factura_id AND organization_id = NEW.organization_id AND evaluacion_fiscal IS NOT NULL
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND (OLD.facturapi_id IS NOT NULL OR OLD.estado IN ('Timbrada','Aplicada','Cancelada')) THEN
    IF (NEW.conceptos, NEW.monto, NEW.moneda, NEW.tipo_cambio, NEW.uso_cfdi, NEW.forma_pago, NEW.fecha_emision, NEW.deleted_at)
      IS DISTINCT FROM (OLD.conceptos, OLD.monto, OLD.moneda, OLD.tipo_cambio, OLD.uso_cfdi, OLD.forma_pago, OLD.fecha_emision, OLD.deleted_at) THEN
      RAISE EXCEPTION 'LC_ISR_NC_INMUTABLE' USING ERRCODE = '23514';
    END IF;
    -- The transition from a claim to a confirmed credit still verifies its
    -- allocation. Cancellation and metadata do not rewrite a fiscal credit.
    IF OLD.estado IN ('Timbrada','Aplicada','Cancelada')
      OR (NEW.facturapi_id IS NULL AND NEW.estado IN ('Borrador','Aprobada')) THEN RETURN NEW; END IF;
  END IF;
  IF NEW.deleted_at IS NOT NULL OR NEW.estado = 'Cancelada' THEN RETURN NEW; END IF;

  IF jsonb_typeof(NEW.conceptos) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.conceptos) = 0
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(NEW.conceptos) l
      WHERE l->>'tipo_iva' IS NULL OR l->>'tipo_iva' NOT IN ('gravado_16','gravado_8','tasa_0','exento','no_objeto')
        OR (l->>'cantidad')::numeric IS NULL OR (l->>'cantidad')::numeric <= 0
        OR (l->>'precio_unitario')::numeric IS NULL OR (l->>'precio_unitario')::numeric < 0
        OR (l->>'cantidad')::numeric::text IN ('NaN','Infinity','-Infinity')
        OR (l->>'precio_unitario')::numeric::text IN ('NaN','Infinity','-Infinity')
        OR COALESCE((l->>'tasa_iva')::numeric, CASE l->>'tipo_iva' WHEN 'gravado_16' THEN 0.16 WHEN 'gravado_8' THEN 0.08 ELSE 0 END)
          <> CASE l->>'tipo_iva' WHEN 'gravado_16' THEN 0.16 WHEN 'gravado_8' THEN 0.08 ELSE 0 END
        OR NOT EXISTS (
          SELECT 1 FROM public.conceptos_factura c
          WHERE c.factura_id = v_factura.id AND c.organization_id = v_factura.organization_id
            AND c.deleted_at IS NULL AND c.tipo_iva::text = l->>'tipo_iva'
            AND (NULLIF(btrim(l->>'concepto_factura_id'), '') IS NULL OR c.id::text = lower(btrim(l->>'concepto_factura_id')))
            AND c.tasa_ret_isr = COALESCE((l->>'tasa_ret_isr')::numeric, 0)
            AND c.tasa_ret_iva = COALESCE((l->>'tasa_ret_iva')::numeric, 0)
        )
    ) THEN
    RAISE EXCEPTION 'LC_ISR_NC_IMPUESTOS_ORIGEN' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_totales FROM public._isr_totales_nota_credito(NEW.conceptos);
  IF NEW.monto IS DISTINCT FROM v_totales.total OR v_totales.total <= 0
    OR NEW.tipo_cambio::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'LC_ISR_NC_TOTAL' USING ERRCODE = '23514';
  END IF;
  IF NEW.facturapi_id IS NULL AND NEW.estado NOT IN ('Timbrada','Aplicada') THEN RETURN NEW; END IF;

  v_factor := public._nc_factor_moneda_factura(NEW.moneda::text, NEW.tipo_cambio,
    v_factura.moneda::text, v_factura.tipo_cambio);
  IF v_factura.uuid_fiscal IS NULL OR v_factura.deleted_at IS NOT NULL
    OR v_factura.estado IN ('Cancelada','Sustituida') OR v_factura.cancellation_status IN ('pending','verifying')
    OR v_factor IS NULL OR v_factor <= 0 THEN
    RAISE EXCEPTION 'LC_ISR_NC_FACTURA' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_notas FROM public._isr_notas_credito_vigentes(v_factura, NEW.id);
  SELECT COALESCE(sum(monto_aplicado_factura), 0) AS neto, COALESCE(sum(ret_isr), 0) AS isr,
    COALESCE(sum(ret_iva), 0) AS iva INTO v_pagos
  FROM public.pagos_factura
  WHERE factura_id = v_factura.id AND organization_id = v_factura.organization_id
    AND deleted_at IS NULL AND (NOT public.pago_rep_anulado(estado_rep) OR facturapi_rep_id LIKE 'PENDING:%');
  IF round(NEW.monto * v_factor + v_notas.neto_reservado + v_notas.neto_aplicado + v_pagos.neto, 2) > v_factura.total
    OR round(v_totales.ret_isr * v_factor + v_notas.isr_aplicado + v_notas.isr_reservado + v_pagos.isr, 2) > v_factura.ret_isr
    OR round(v_totales.ret_iva * v_factor + v_notas.iva_aplicado + v_notas.iva_reservado + v_pagos.iva, 2) > v_factura.ret_iva THEN
    RAISE EXCEPTION 'LC_NC_EXCEDE_SALDO: la nota excede el saldo o las retenciones disponibles'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public._isr_guard_nota_credito() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.calc_pago_retenciones() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_factura public.facturas;
  v_notas record;
  v_disponible numeric;
  v_fac_ret_isr numeric; v_fac_ret_iva numeric;
  v_ncs numeric; v_base numeric; v_ratio numeric; v_monto numeric;
  v_prev_isr numeric; v_prev_iva numeric; v_prev_monto numeric;
BEGIN
  SELECT * INTO v_factura FROM public.facturas WHERE id = NEW.factura_id AND organization_id = NEW.organization_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_fac_ret_isr := COALESCE(v_factura.ret_isr, 0);
  v_fac_ret_iva := COALESCE(v_factura.ret_iva, 0);
  IF v_factura.evaluacion_fiscal IS NULL AND (
    COALESCE(NEW.ret_isr, 0) > 0 OR COALESCE(NEW.ret_iva, 0) > 0 OR (v_fac_ret_isr = 0 AND v_fac_ret_iva = 0)
    OR (TG_OP = 'UPDATE' AND (OLD.factura_id, OLD.monto_aplicado_factura, OLD.ret_isr, OLD.ret_iva)
        IS NOT DISTINCT FROM (NEW.factura_id, NEW.monto_aplicado_factura, NEW.ret_isr, NEW.ret_iva))
  ) THEN
    RETURN NEW;
  END IF;

  IF v_factura.evaluacion_fiscal IS NOT NULL THEN
    IF NEW.deleted_at IS NOT NULL OR (public.pago_rep_anulado(NEW.estado_rep)
      AND NOT COALESCE(NEW.facturapi_rep_id LIKE 'PENDING:%', false)) THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL
      AND (NOT public.pago_rep_anulado(OLD.estado_rep) OR OLD.facturapi_rep_id LIKE 'PENDING:%')
      AND (OLD.factura_id, OLD.monto_aplicado_factura) IS NOT DISTINCT FROM (NEW.factura_id, NEW.monto_aplicado_factura) THEN
      NEW.ret_isr := OLD.ret_isr;
      NEW.ret_iva := OLD.ret_iva;
      RETURN NEW;
    END IF;
    -- Notes and payments serialize on the invoice before allocating the balance.
    SELECT * INTO STRICT v_factura FROM public.facturas WHERE id = NEW.factura_id FOR NO KEY UPDATE;
  END IF;

  SELECT COALESCE(SUM(COALESCE(p.ret_isr,0)),0),
         COALESCE(SUM(COALESCE(p.ret_iva,0)),0),
         COALESCE(SUM(COALESCE(NULLIF(p.monto_aplicado_factura,0), p.monto)),0)
    INTO v_prev_isr, v_prev_iva, v_prev_monto
    FROM public.pagos_factura p
   WHERE p.factura_id = NEW.factura_id
     AND p.deleted_at IS NULL
     AND (NOT public.pago_rep_anulado(p.estado_rep)
       OR (v_factura.evaluacion_fiscal IS NOT NULL AND p.facturapi_rep_id LIKE 'PENDING:%'))
     AND p.organization_id = v_factura.organization_id
     AND p.id IS DISTINCT FROM NEW.id;

  IF v_factura.evaluacion_fiscal IS NOT NULL THEN
    SELECT * INTO v_notas FROM public._isr_notas_credito_vigentes(v_factura, NULL);
    v_disponible := round(v_factura.total - v_notas.neto_aplicado - v_prev_monto, 2);
    v_monto := NEW.monto_aplicado_factura;
    IF v_disponible <= 0 OR round(v_monto + v_notas.neto_reservado, 2) > v_disponible THEN
      RAISE EXCEPTION 'LC_PAGO_SOBREPAGO: el pago excede el saldo disponible' USING ERRCODE = '23514';
    END IF;
    v_fac_ret_isr := greatest(round(v_factura.ret_isr - v_notas.isr_aplicado - v_prev_isr, 2), 0);
    v_fac_ret_iva := greatest(round(v_factura.ret_iva - v_notas.iva_aplicado - v_prev_iva, 2), 0);
    v_ratio := v_monto / v_disponible;
    NEW.ret_isr := round(v_fac_ret_isr * v_ratio, 2);
    NEW.ret_iva := round(v_fac_ret_iva * v_ratio, 2);
    IF round(NEW.ret_isr + v_notas.isr_reservado, 2) > v_fac_ret_isr
      OR round(NEW.ret_iva + v_notas.iva_reservado, 2) > v_fac_ret_iva THEN
      RAISE EXCEPTION 'LC_ISR_PAGO_NC_RESERVADA: una nota por timbrar tiene reservadas las retenciones' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Retained behavior for invoices issued before the evaluated workflow.
  v_ncs := COALESCE(public.nc_aplicadas_en_moneda_factura(NEW.factura_id), 0);
  v_base := COALESCE(v_factura.subtotal, 0) + COALESCE(v_factura.iva, 0) - v_fac_ret_iva - v_fac_ret_isr - v_ncs;
  v_monto := COALESCE(NULLIF(NEW.monto_aplicado_factura, 0), NEW.monto);
  IF v_base <= 0 OR COALESCE(v_monto, 0) <= 0 THEN RETURN NEW; END IF;
  IF v_prev_monto + v_monto >= v_base - 0.01 THEN
    -- Pago liquidador: absorbe el residuo de centavos del prorrateo.
    NEW.ret_isr := GREATEST(ROUND(v_fac_ret_isr - v_prev_isr, 2), 0);
    NEW.ret_iva := GREATEST(ROUND(v_fac_ret_iva - v_prev_iva, 2), 0);
  ELSE
    v_ratio := v_monto / v_base;
    NEW.ret_isr := ROUND(v_fac_ret_isr * v_ratio, 2);
    NEW.ret_iva := ROUND(v_fac_ret_iva * v_ratio, 2);
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER zzz_pagos_factura_calc_ret
BEFORE INSERT OR UPDATE OF factura_id, monto, moneda, tipo_cambio, monto_aplicado_factura,
  ret_isr, ret_iva, estado_rep, facturapi_rep_id, deleted_at
ON public.pagos_factura FOR EACH ROW EXECUTE FUNCTION public.calc_pago_retenciones();

CREATE TRIGGER trg_isr_guard_nota_credito BEFORE INSERT OR UPDATE ON public.factura_notas_credito FOR EACH ROW EXECUTE FUNCTION public._isr_guard_nota_credito();
