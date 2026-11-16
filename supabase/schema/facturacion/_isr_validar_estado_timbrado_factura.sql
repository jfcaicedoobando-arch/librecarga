CREATE OR REPLACE FUNCTION public._isr_validar_estado_timbrado_factura(p_old public.facturas, p_new public.facturas)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_intento public.intentos_timbrado_isr;
  v_campos text[] := ARRAY['facturapi_id','facturapi_claim_at','facturapi_pendiente_id','facturapi_pendiente_at','updated_at'];
  v_claim text := COALESCE(p_old.facturapi_id, p_new.facturapi_id);
BEGIN
  SELECT * INTO v_intento FROM public.intentos_timbrado_isr i WHERE i.factura_id = p_old.id
    AND i.organization_id = p_old.organization_id AND 'PENDING:' || i.id::text = v_claim;
  IF NOT FOUND OR p_old.uuid_fiscal IS NOT NULL THEN RETURN false; END IF;

  IF v_intento.estado IN ('reservado','pendiente','conciliacion') THEN
    RETURN p_new.estado = 'Borrador' AND p_new.facturapi_id = v_claim
      AND p_new.facturapi_claim_at = v_intento.creado_at
      AND p_new.facturapi_pendiente_id IS NOT DISTINCT FROM v_intento.facturapi_id
      AND p_new.facturapi_pendiente_at IS NOT DISTINCT FROM
        CASE WHEN v_intento.estado = 'reservado' THEN NULL ELSE v_intento.actualizado_at END
      AND (to_jsonb(p_new) - v_campos) IS NOT DISTINCT FROM (to_jsonb(p_old) - v_campos);
  END IF;

  IF v_intento.estado = 'rechazado' THEN
    RETURN p_old.facturapi_id = v_claim AND p_new.estado = 'Borrador'
      AND p_new.facturapi_id IS NULL AND p_new.facturapi_claim_at IS NULL
      AND p_new.facturapi_pendiente_id IS NULL AND p_new.facturapi_pendiente_at IS NULL
      AND (to_jsonb(p_new) - v_campos) IS NOT DISTINCT FROM (to_jsonb(p_old) - v_campos);
  END IF;

  v_campos := v_campos || ARRAY['estado','snapshot_emision','uuid_fiscal','folio_fiscal','serie','numero','ambiente',
    'uso_cfdi','timbrado_en','timbrado_por','factura_pdf_url','factura_xml_url','factura_xml_backup_path'];
  RETURN v_intento.estado = 'confirmado' AND p_old.facturapi_id = v_claim AND p_new.estado = 'Emitida'
    AND p_new.facturapi_id = v_intento.facturapi_id AND p_new.uuid_fiscal = v_intento.uuid_fiscal
    AND p_new.facturapi_claim_at IS NULL AND p_new.facturapi_pendiente_id IS NULL AND p_new.facturapi_pendiente_at IS NULL
    AND p_new.ambiente::text = v_intento.ambiente AND p_new.timbrado_por = v_intento.actor_id
    AND p_new.snapshot_emision IS NOT NULL
    AND (to_jsonb(p_new) - v_campos) IS NOT DISTINCT FROM (to_jsonb(p_old) - v_campos);
END;
$$;
