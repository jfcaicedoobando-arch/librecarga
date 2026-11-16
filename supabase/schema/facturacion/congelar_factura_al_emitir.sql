CREATE OR REPLACE FUNCTION public.congelar_factura_al_emitir() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_conceptos jsonb;
  v_cliente jsonb;
  v_org jsonb;
  v_tasa_iva numeric;
  v_prevalidacion jsonb;
BEGIN
  -- Sólo congelar al transicionar a Emitida/Pagada y si aún no hay snapshot
  IF NEW.estado NOT IN ('Emitida', 'Pagada') THEN
    RETURN NEW;
  END IF;
  -- QA-R2 D-05: no emitir una factura sin conceptos vivos. Sólo aplica en la
  -- transición normal de captura (Borrador/Por timbrar -> Emitida); en INSERT
  -- los conceptos aún no pueden existir por la FK y otras transiciones
  -- (reapertura de canceladas) tienen su propio candado.
  IF TG_OP = 'UPDATE'
     AND NEW.estado = 'Emitida'
     AND OLD.estado IN ('Borrador', 'Por timbrar')
     AND NOT EXISTS (
       SELECT 1 FROM public.conceptos_factura cf
       WHERE cf.factura_id = NEW.id AND cf.deleted_at IS NULL
     ) THEN
    RAISE EXCEPTION 'LC_FACTURA_SIN_CONCEPTOS: no se puede emitir una factura sin conceptos'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.snapshot_emision IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(cf)), '[]'::jsonb)
    INTO v_conceptos
    FROM public.conceptos_factura cf
   WHERE cf.factura_id = NEW.id
     AND cf.deleted_at IS NULL;
  SELECT jsonb_build_object(
           'id', c.id,
           'nombre', c.nombre,
           'rfc', c.rfc,
           'direccion', c.direccion,
           'ciudad', c.ciudad,
           'estado', c.estado,
           'cp', c.cp
         )
    INTO v_cliente
    FROM public.clientes c
   WHERE c.id = NEW.cliente_id;
  SELECT jsonb_build_object(
           'id', o.id,
           'nombre', o.nombre,
           'rfc', o.rfc
         )
    INTO v_org
    FROM public.organizations o
   WHERE o.id = NEW.organization_id;
  IF NEW.evaluacion_fiscal IS NOT NULL AND TG_OP = 'UPDATE' THEN
    SELECT i.prevalidacion INTO v_prevalidacion FROM public.intentos_timbrado_isr i
    WHERE i.factura_id = NEW.id AND i.organization_id = NEW.organization_id
      AND i.estado = 'confirmado' AND 'PENDING:' || i.id::text = OLD.facturapi_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'LC_ISR_TIMBRADO_PENDIENTE' USING ERRCODE = '23514'; END IF;
    v_cliente := (v_prevalidacion->'receptor') || jsonb_build_object(
      'id', NEW.cliente_id, 'cp', v_prevalidacion#>'{receptor,codigo_postal}');
    v_org := (v_prevalidacion->'emisor') || jsonb_build_object(
      'id', NEW.organization_id, 'nombre', v_prevalidacion#>'{emisor,razon_social}');
  END IF;
  v_tasa_iva := CASE
    WHEN COALESCE(NEW.subtotal, 0) = 0 THEN 0
    ELSE round((NEW.iva / NEW.subtotal)::numeric, 4)
  END;
  NEW.snapshot_emision := jsonb_build_object(
    'version', 1,
    'congelado_at', now(),
    'estado_al_congelar', NEW.estado,
    'numero', NEW.numero,
    'moneda', NEW.moneda,
    'subtotal', NEW.subtotal,
    'iva', NEW.iva,
    'total', NEW.total,
    'tasa_iva', v_tasa_iva,
    'tipo_cambio', NEW.tipo_cambio,
    'fecha_emision', NEW.fecha_emision,
    'fecha_vencimiento', NEW.fecha_vencimiento,
    'expediente', NEW.expediente,
    'referencia_bl', NEW.referencia_bl,
    'cliente_snapshot', v_cliente,
    'organizacion_snapshot', v_org,
    'conceptos', v_conceptos
  );
  IF v_prevalidacion IS NOT NULL THEN
    NEW.snapshot_emision := NEW.snapshot_emision || jsonb_build_object(
      'ret_isr', NEW.ret_isr, 'ret_iva', NEW.ret_iva, 'evaluacion_fiscal', NEW.evaluacion_fiscal,
      'intento_timbrado_isr', OLD.facturapi_id);
  END IF;
  RETURN NEW;
END;
$$;
