CREATE OR REPLACE FUNCTION public.obtener_intento_nota_credito_isr(p_nota_id uuid, p_organization_id uuid, p_claim text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_intento public.intentos_nota_credito_isr;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.factura_notas_credito n JOIN public.facturas f
      ON f.id = n.factura_id AND f.organization_id = n.organization_id
    WHERE n.id = p_nota_id AND n.organization_id = p_organization_id AND f.evaluacion_fiscal IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('protegido',false);
  END IF;
  SELECT i.* INTO v_intento FROM public.intentos_nota_credito_isr i JOIN public.factura_notas_credito n
    ON n.id=i.nota_id AND n.organization_id=i.organization_id
  WHERE i.nota_id=p_nota_id AND i.organization_id=p_organization_id AND n.deleted_at IS NULL
    AND n.facturapi_id=p_claim AND 'PENDING:' || i.id::text=p_claim
    AND i.estado IN ('reservado','pendiente','conciliacion');
  RETURN jsonb_build_object('protegido',true,'esperado',v_intento.esperado,'facturapi_id',v_intento.facturapi_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.obtener_intento_nota_credito_isr(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_intento_nota_credito_isr(uuid,uuid,text) TO service_role;
