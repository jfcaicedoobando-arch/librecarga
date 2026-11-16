CREATE OR REPLACE FUNCTION public._isr_guard_concepto_factura_convertida() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_propietario boolean := current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID));
  v_factura public.facturas;
  v_campos_editables text[] := ARRAY['updated_at','clave_sat','clave_unidad','deleted_at','deleted_by'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.origen_fiscal IS NOT NULL THEN RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  SELECT f.* INTO v_factura FROM public.facturas f
    WHERE f.id = NEW.factura_id AND f.organization_id = NEW.organization_id;
  IF v_factura.evaluacion_fiscal IS NULL AND NEW.origen_fiscal IS NULL
    AND (TG_OP = 'INSERT' OR OLD.origen_fiscal IS NULL) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_propietario OR v_factura.evaluacion_fiscal IS NULL OR v_factura.deleted_at IS NOT NULL
      OR NEW.deleted_at IS NOT NULL OR NEW.proforma_id_origen IS DISTINCT FROM v_factura.proforma_id
      OR NEW.embarque_id IS DISTINCT FROM v_factura.embarque_id OR NEW.moneda IS DISTINCT FROM v_factura.moneda
      OR NEW.tasa_ret_iva <> 0 OR jsonb_typeof(NEW.origen_fiscal->'lineas') IS DISTINCT FROM 'array'
      OR jsonb_array_length(NEW.origen_fiscal->'lineas') = 0
      OR (NEW.origen_fiscal#>>'{evaluacion,base_exacta}')::numeric IS DISTINCT FROM NEW.cantidad * NEW.precio_unitario
      OR NEW.tasa_ret_isr IS DISTINCT FROM (NEW.origen_fiscal#>>'{evaluacion,tasa_ret_isr}')::numeric
      OR NEW.monto_ret_isr IS DISTINCT FROM (NEW.origen_fiscal#>>'{evaluacion,monto_ret_isr}')::numeric THEN
      RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.origen_fiscal IS NULL AND NEW.origen_fiscal IS NOT NULL AND v_propietario
    AND v_factura.origen = 'manual' AND v_factura.deleted_at IS NULL AND v_factura.evaluacion_fiscal IS NOT NULL
    AND OLD.deleted_at IS NULL AND (NEW.origen_fiscal->>'captura_id')::uuid = OLD.id
    AND NEW.tasa_ret_isr = (NEW.origen_fiscal#>>'{evaluacion,tasa_ret_isr}')::numeric
    AND NEW.monto_ret_isr = (NEW.origen_fiscal#>>'{evaluacion,monto_ret_isr}')::numeric
    AND NEW.cantidad * NEW.precio_unitario = (NEW.origen_fiscal#>>'{evaluacion,base_exacta}')::numeric
    AND NEW.total = round(NEW.cantidad * NEW.precio_unitario, 2)
    AND (to_jsonb(NEW) - ARRAY['updated_at','total','tasa_ret_isr','monto_ret_isr','origen_fiscal'])
      IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at','total','tasa_ret_isr','monto_ret_isr','origen_fiscal']) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - v_campos_editables) IS DISTINCT FROM (to_jsonb(OLD) - v_campos_editables)
    OR ((NEW.deleted_at, NEW.deleted_by) IS DISTINCT FROM (OLD.deleted_at, OLD.deleted_by)
      AND (NOT v_propietario OR OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL
        OR NEW.deleted_by IS DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
