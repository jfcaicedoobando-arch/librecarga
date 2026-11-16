CREATE OR REPLACE FUNCTION public._isr_guard_borrador_convertido() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_propietario boolean := current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID));
  v_proforma public.proformas;
BEGIN
  IF NEW.evaluacion_fiscal IS NULL AND (TG_OP = 'INSERT' OR OLD.evaluacion_fiscal IS NULL) THEN RETURN NEW; END IF;
  IF NEW.estado <> 'Borrador' OR NEW.snapshot_emision IS NOT NULL OR NEW.uuid_fiscal IS NOT NULL
    OR NEW.facturapi_id IS NOT NULL OR NEW.facturapi_claim_at IS NOT NULL OR NEW.facturapi_pendiente_id IS NOT NULL
    OR NEW.timbrado_en IS NOT NULL OR NEW.timbrado_por IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_TIMBRADO_PENDIENTE' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT p.* INTO v_proforma FROM public.proformas p
      WHERE p.id = NEW.proforma_id AND p.organization_id = NEW.organization_id AND p.deleted_at IS NULL;
    IF NOT v_propietario OR NOT FOUND OR NEW.deleted_at IS NOT NULL OR NEW.origen <> 'conversion_proforma'
      OR v_proforma.estado_cliente <> 'aceptada' OR v_proforma.estado_proforma NOT IN ('pendiente','aprobada')
      OR v_proforma.evaluacion_fiscal IS NULL OR NEW.cliente_id IS DISTINCT FROM v_proforma.cliente_id
      OR NEW.embarque_id IS DISTINCT FROM v_proforma.embarque_id
      OR NEW.rfc_cliente IS DISTINCT FROM NEW.evaluacion_fiscal#>>'{receptor,rfc}'
      OR (NEW.evaluacion_fiscal->>'proforma_id')::uuid IS DISTINCT FROM v_proforma.id
      OR (NEW.evaluacion_fiscal - ARRAY['bloques','emisor','receptor','proforma_id'])
        IS DISTINCT FROM (v_proforma.evaluacion_fiscal - 'bloques')
      OR jsonb_array_length(NEW.evaluacion_fiscal->'bloques') IS DISTINCT FROM 1
      OR NEW.evaluacion_fiscal#>>'{bloques,0,moneda}' IS DISTINCT FROM NEW.moneda::text
      OR ((v_proforma.evaluacion_fiscal->'bloques') @> (NEW.evaluacion_fiscal->'bloques')) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.evaluacion_fiscal, NEW.organization_id, NEW.cliente_id, NEW.embarque_id, NEW.proforma_id,
      NEW.moneda, NEW.origen, NEW.rfc_cliente, NEW.sustituye_a)
    IS DISTINCT FROM
    (OLD.evaluacion_fiscal, OLD.organization_id, OLD.cliente_id, OLD.embarque_id, OLD.proforma_id,
      OLD.moneda, OLD.origen, OLD.rfc_cliente, OLD.sustituye_a)
    OR ((NEW.deleted_at, NEW.deleted_by) IS DISTINCT FROM (OLD.deleted_at, OLD.deleted_by)
      AND (NOT v_propietario OR OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL
        OR NEW.deleted_by IS DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
