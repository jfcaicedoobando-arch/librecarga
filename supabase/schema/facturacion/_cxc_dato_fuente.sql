CREATE OR REPLACE FUNCTION public._cxc_dato_fuente(p_fuente text,p_dato jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
BEGIN
  IF p_dato IS NULL OR p_dato->>'deleted_at' IS NOT NULL THEN RETURN NULL; END IF;
  CASE p_fuente
    WHEN 'facturas' THEN
      IF p_dato->>'estado' NOT IN ('Emitida','Parcialmente pagada','Vencida','Pagada')
        OR COALESCE(p_dato->>'cancellation_status','none') IN ('pending','verifying','accepted')
        OR p_dato->>'sustituida_por' IS NOT NULL THEN RETURN NULL; END IF;
      RETURN jsonb_build_object('total',p_dato->'total','moneda',p_dato->'moneda','tc',p_dato->'tipo_cambio',
        'emision',p_dato->'fecha_emision','vencimiento',p_dato->'fecha_vencimiento',
        'folio',p_dato->'numero','cliente',p_dato->'cliente_nombre','embarque',p_dato->'embarque_id');
    WHEN 'pagos_factura' THEN
      IF public.pago_rep_anulado(p_dato->>'estado_rep') THEN RETURN NULL; END IF;
      RETURN jsonb_build_object('monto',p_dato->'monto_aplicado_factura','fecha',p_dato->'fecha_pago');
    WHEN 'factura_notas_credito' THEN
      IF p_dato->>'estado' NOT IN ('Timbrada','Aplicada') THEN RETURN NULL; END IF;
      RETURN jsonb_build_object('monto',p_dato->'monto','moneda',p_dato->'moneda',
        'tc',p_dato->'tipo_cambio','fecha',p_dato->'fecha_emision');
    WHEN 'refacturaciones' THEN
      IF p_dato->>'estado' = 'completado' THEN
        RETURN jsonb_build_object('fecha',(COALESCE((p_dato->>'cerrado_at')::timestamptz,now()) AT TIME ZONE 'America/Mexico_City')::date);
      END IF;
      RETURN NULL;
    ELSE RAISE EXCEPTION 'Fuente de CxC desconocida.';
  END CASE;
END;
$$;
