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
  v_proy record;
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
      IF v_factura.metodo_pago='PPD' AND auth.role()='service_role' AND OLD.uuid_rep IS NULL
        AND OLD.facturapi_rep_id IS NULL AND OLD.estado_rep IN ('Pendiente','Error')
        AND (NEW.ret_isr,NEW.ret_iva) IS DISTINCT FROM (OLD.ret_isr,OLD.ret_iva) THEN
        SELECT p.ret_isr,p.ret_iva INTO v_proy FROM public._isr_proyectar_retenciones_rep(v_factura) p WHERE p.pago_id=OLD.id;
        IF FOUND THEN
          NEW.ret_isr := v_proy.ret_isr;
          NEW.ret_iva := v_proy.ret_iva;
          RETURN NEW;
        END IF;
      END IF;
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
