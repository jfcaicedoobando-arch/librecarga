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
