CREATE OR REPLACE FUNCTION public.obtener_intento_rep_isr(p_pago_id uuid,p_organization_id uuid,p_claim text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE v_intento public.intentos_rep_isr;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pagos_factura p JOIN public.facturas f ON f.id=p.factura_id
    AND f.organization_id=p.organization_id WHERE p.id=p_pago_id AND p.organization_id=p_organization_id
    AND f.evaluacion_fiscal IS NOT NULL AND f.metodo_pago='PPD') THEN
    RETURN jsonb_build_object('protegido',false);
  END IF;
  SELECT i.* INTO v_intento FROM public.intentos_rep_isr i JOIN public.pagos_factura p ON p.id=i.pago_id
    AND p.organization_id=i.organization_id AND p.factura_id=i.factura_id
  WHERE i.pago_id=p_pago_id AND i.organization_id=p_organization_id AND p.deleted_at IS NULL
    AND p.facturapi_rep_id=p_claim AND 'PENDING:'||i.id::text=p_claim
    AND i.estado IN ('reservado','pendiente','conciliacion');
  RETURN jsonb_build_object('protegido',true,'esperado',v_intento.esperado,'facturapi_id',v_intento.facturapi_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.obtener_intento_rep_isr(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_intento_rep_isr(uuid,uuid,text) TO service_role;
