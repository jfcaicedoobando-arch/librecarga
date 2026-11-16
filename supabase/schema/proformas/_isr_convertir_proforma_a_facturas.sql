CREATE OR REPLACE FUNCTION public._isr_convertir_proforma_a_facturas(p_proforma_id uuid, p_serie_id uuid,
  p_metodo text, p_forma text, p_uso text, p_dias int, p_notas text, p_fecha date)
RETURNS uuid[] LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_proforma public.proformas;
  v_evaluacion jsonb;
  v_bloque jsonb;
  v_factura public.facturas;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_moneda public.moneda;
BEGIN
  v_evaluacion := public._isr_validar_conversion_proforma(p_proforma_id);
  SELECT * INTO STRICT v_proforma FROM public.proformas WHERE id = p_proforma_id;
  FOR v_bloque IN SELECT value FROM jsonb_array_elements(v_evaluacion->'bloques') ORDER BY value->>'moneda' LOOP
    IF (v_bloque->>'subtotal')::numeric <= 0 THEN CONTINUE; END IF;
    v_moneda := (v_bloque->>'moneda')::public.moneda;
    INSERT INTO public.facturas (numero, embarque_id, expediente, cliente_id, cliente_nombre,
      moneda, fecha_emision, fecha_vencimiento, estado, organization_id, proforma_id, serie_id,
      rfc_cliente, uso_cfdi, forma_pago, metodo_pago, dias_credito, notas, origen, evaluacion_fiscal)
    VALUES ('BORRADOR-' || left(replace(gen_random_uuid()::text, '-', ''), 12), v_proforma.embarque_id,
      v_proforma.expediente, v_proforma.cliente_id, v_proforma.cliente_nombre, v_moneda,
      p_fecha, p_fecha + p_dias, 'Borrador', v_proforma.organization_id, p_proforma_id, p_serie_id,
      v_evaluacion#>>'{receptor,rfc}', p_uso, p_forma, p_metodo, p_dias, p_notas, 'conversion_proforma',
      v_evaluacion || jsonb_build_object('bloques', jsonb_build_array(v_bloque), 'proforma_id', p_proforma_id))
    RETURNING * INTO v_factura;

    PERFORM public._convertir_proformas_insertar_conceptos(v_factura.id, ARRAY[p_proforma_id],
      v_proforma.organization_id, v_proforma.es_consolidada, v_moneda);
    SELECT * INTO STRICT v_factura FROM public.facturas WHERE id = v_factura.id;
    IF (v_factura.subtotal, v_factura.iva, v_factura.ret_isr, v_factura.ret_iva, v_factura.total)
      IS DISTINCT FROM ((v_bloque->>'subtotal')::numeric, (v_bloque->>'iva')::numeric,
        (v_bloque->>'ret_isr')::numeric, (v_bloque->>'ret_iva')::numeric, (v_bloque->>'total')::numeric) THEN
      RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.factura_embarques (factura_id, embarque_id, organization_id)
    VALUES (v_factura.id, v_proforma.embarque_id, v_proforma.organization_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.bitacora_actividad (
      organization_id, usuario_id, usuario_email, accion, modulo, entidad_id, entidad_nombre, detalles
    ) VALUES (v_proforma.organization_id, auth.uid(), (SELECT email FROM auth.users WHERE id=auth.uid()),
      'factura.borrador_generado', 'facturacion', v_factura.id, v_factura.numero,
      jsonb_build_object('proforma_ids', ARRAY[p_proforma_id], 'serie_id', p_serie_id, 'moneda', v_moneda,
        'embarque_ids', ARRAY[v_proforma.embarque_id], 'huella_fiscal', v_evaluacion->'conceptos_fingerprint'));
    v_ids := array_append(v_ids, v_factura.id);
  END LOOP;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
  END IF;

  UPDATE public.proformas
  SET estado_proforma = 'facturada', fecha_facturacion = p_fecha, factura_id = v_ids[1],
    factura_secundaria_id = v_ids[2], updated_at = now()
  WHERE id = p_proforma_id;
  RETURN v_ids;
END;
$$;
