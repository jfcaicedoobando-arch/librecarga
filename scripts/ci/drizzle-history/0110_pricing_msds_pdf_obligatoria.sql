CREATE OR REPLACE FUNCTION public._crm_pricing_validar_msds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.imo IS NOT TRUE OR NEW.estado IN ('borrador', 'cancelada', 'sin_opcion') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.estado = 'borrador' OR OLD.imo IS DISTINCT FROM NEW.imo) THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'crm-pricing-adjuntos'
      AND split_part(o.name, '/', 1) = NEW.organization_id::text
      AND split_part(o.name, '/', 2) = NEW.id::text
      AND array_length(string_to_array(o.name, '/'), 1) = 3
      AND split_part(o.name, '/', 3) ~* '^[0-9]{13}-MSDS-.+\.pdf$'
      AND o.metadata->>'mimetype' = 'application/pdf'
      AND CASE WHEN jsonb_typeof(o.metadata->'size') = 'number'
        THEN (o.metadata->>'size')::numeric > 0 AND (o.metadata->>'size')::numeric <= 10485760
        ELSE false END
  ) THEN
    RAISE EXCEPTION 'LC_PRICING_INCOMPLETA: Hoja de seguridad (MSDS) en PDF' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._crm_pricing_validar_msds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._crm_pricing_validar_msds() TO service_role;
CREATE TRIGGER crm_pricing_msds_pdf_obligatoria
BEFORE INSERT OR UPDATE OF estado, imo ON public.crm_solicitudes_pricing
FOR EACH ROW EXECUTE FUNCTION public._crm_pricing_validar_msds();
COMMENT ON FUNCTION public._crm_pricing_validar_msds() IS 'Requires explicitly identified private MSDS PDF on hazardous request submission; does not rewrite historical requests or workflow permissions.';