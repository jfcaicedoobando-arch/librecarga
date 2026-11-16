CREATE OR REPLACE FUNCTION public.obtener_intento_timbrado_isr(p_factura_id uuid, p_organization_id uuid, p_claim text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_intento public.intentos_timbrado_isr;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  SELECT i.* INTO v_intento FROM public.intentos_timbrado_isr i
  JOIN public.facturas f ON f.id = i.factura_id AND f.organization_id = i.organization_id
  WHERE i.factura_id = p_factura_id AND i.organization_id = p_organization_id
    AND f.deleted_at IS NULL AND f.facturapi_id = p_claim AND 'PENDING:' || i.id::text = p_claim
    AND i.estado IN ('reservado','pendiente','conciliacion');
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('prevalidacion', v_intento.prevalidacion, 'facturapi_id', v_intento.facturapi_id);
END;
$$;
REVOKE ALL ON FUNCTION public.obtener_intento_timbrado_isr(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_intento_timbrado_isr(uuid,uuid,text) TO service_role;
