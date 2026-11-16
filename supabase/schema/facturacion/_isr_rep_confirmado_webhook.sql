CREATE OR REPLACE FUNCTION public._isr_rep_confirmado_webhook(
  p_pago uuid,p_org uuid,p_claim text,p_id_remoto text,p_ambiente text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
  SELECT auth.role()='service_role' AND EXISTS (
    SELECT 1 FROM public.intentos_rep_isr i JOIN public.pagos_factura p ON p.id=i.pago_id
      AND p.organization_id=i.organization_id AND p.factura_id=i.factura_id
    WHERE i.pago_id=p_pago AND i.organization_id=p_org AND 'PENDING:'||i.id::text=p_claim
      AND i.ambiente::text=p_ambiente AND i.estado='confirmado' AND i.facturapi_id=p_id_remoto
      AND p.facturapi_rep_id=i.facturapi_id AND p.uuid_rep=i.uuid_fiscal AND p.deleted_at IS NULL
      AND p.rep_xml_backup_path=i.resultado->>'ruta'
  )
$fn$;
REVOKE ALL ON FUNCTION public._isr_rep_confirmado_webhook(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._isr_rep_confirmado_webhook(uuid,uuid,text,text,text) TO service_role;
