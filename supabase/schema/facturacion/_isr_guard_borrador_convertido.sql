CREATE OR REPLACE FUNCTION public._isr_guard_borrador_convertido() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_propietario boolean := current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID));
  v_proforma public.proformas;
BEGIN
  IF NEW.evaluacion_fiscal IS NULL AND (TG_OP = 'INSERT' OR OLD.evaluacion_fiscal IS NULL) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'Borrador' OR NEW.snapshot_emision IS NOT NULL OR NEW.uuid_fiscal IS NOT NULL
      OR NEW.facturapi_id IS NOT NULL OR NEW.facturapi_claim_at IS NOT NULL OR NEW.facturapi_pendiente_id IS NOT NULL
      OR NEW.facturapi_pendiente_at IS NOT NULL OR NEW.timbrado_en IS NOT NULL OR NEW.timbrado_por IS NOT NULL THEN
      RAISE EXCEPTION 'LC_ISR_TIMBRADO_PENDIENTE' USING ERRCODE = '23514';
    END IF;
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

  -- The existing manual capture keeps its invoker RLS for header and lines.
  -- Only the evaluated transition is written by the scoped fiscal function.
  IF OLD.evaluacion_fiscal IS NULL AND NEW.evaluacion_fiscal IS NOT NULL
    AND v_propietario AND (to_jsonb(NEW) - ARRAY['evaluacion_fiscal','updated_at'])
      IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['evaluacion_fiscal','updated_at'])
    AND OLD.origen = 'manual' AND OLD.deleted_at IS NULL AND OLD.proforma_id IS NULL AND OLD.embarque_id IS NULL
    AND OLD.estado = 'Borrador' AND OLD.uuid_fiscal IS NULL AND OLD.facturapi_id IS NULL AND OLD.snapshot_emision IS NULL
    AND (NEW.evaluacion_fiscal->>'factura_id')::uuid = OLD.id
    AND (NEW.evaluacion_fiscal->>'organization_id')::uuid = OLD.organization_id
    AND (NEW.evaluacion_fiscal->>'cliente_id')::uuid = OLD.cliente_id
    AND NEW.evaluacion_fiscal->>'estado' = 'confirmado'
    AND NEW.evaluacion_fiscal#>>'{receptor,rfc}' = upper(btrim(OLD.rfc_cliente))
    AND jsonb_array_length(NEW.evaluacion_fiscal->'bloques') = 1
    AND NEW.evaluacion_fiscal#>>'{bloques,0,moneda}' = OLD.moneda::text THEN
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
  IF OLD.uuid_fiscal IS NOT NULL THEN
    IF (NEW.uuid_fiscal, NEW.facturapi_id, NEW.snapshot_emision, NEW.ambiente, NEW.timbrado_en, NEW.timbrado_por)
      IS DISTINCT FROM (OLD.uuid_fiscal, OLD.facturapi_id, OLD.snapshot_emision, OLD.ambiente, OLD.timbrado_en, OLD.timbrado_por) THEN
      RAISE EXCEPTION 'LC_ISR_TIMBRADO_PENDIENTE' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.facturapi_id IS NOT NULL OR NEW.facturapi_id IS NOT NULL OR NEW.estado <> 'Borrador'
    OR NEW.snapshot_emision IS NOT NULL OR NEW.uuid_fiscal IS NOT NULL OR NEW.facturapi_claim_at IS NOT NULL
    OR NEW.facturapi_pendiente_id IS NOT NULL OR NEW.facturapi_pendiente_at IS NOT NULL
    OR NEW.timbrado_en IS NOT NULL OR NEW.timbrado_por IS NOT NULL THEN
    IF (to_jsonb(NEW) - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN RETURN NEW; END IF;
    IF NOT v_propietario THEN RAISE EXCEPTION 'LC_ISR_TIMBRADO_PENDIENTE' USING ERRCODE = '23514'; END IF;
    IF public._isr_validar_estado_timbrado_factura(OLD, NEW) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'LC_ISR_TIMBRADO_PENDIENTE' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
