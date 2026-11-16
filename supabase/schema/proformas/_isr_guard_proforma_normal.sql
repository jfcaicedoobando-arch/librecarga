CREATE OR REPLACE FUNCTION public._isr_guard_proforma_normal() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_propietario boolean := current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID));
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.evaluacion_fiscal IS NOT NULL AND (
      NOT v_propietario OR NEW.embarque_id IS NULL OR NEW.deleted_at IS NOT NULL
      OR (NEW.es_consolidada AND (COALESCE(cardinality(NEW.proformas_origen),0) < 2
        OR jsonb_typeof(NEW.evaluacion_fiscal->'ajustes_consolidacion') IS DISTINCT FROM 'array'))
      OR (NOT NEW.es_consolidada AND NEW.proformas_origen IS NOT NULL)
      OR NEW.ajuste_consolidacion_aprobado_at IS NOT NULL OR NEW.ajuste_consolidacion_aprobado_por IS NOT NULL
      OR NEW.factura_id IS NOT NULL OR NEW.factura_secundaria_id IS NOT NULL
      OR NEW.estado_proforma IS DISTINCT FROM 'pendiente' OR NEW.estado_cliente IS DISTINCT FROM 'pendiente'
      OR NEW.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado'
      OR NEW.evaluacion_fiscal->>'organization_id' IS DISTINCT FROM NEW.organization_id::text
      OR NEW.evaluacion_fiscal->>'cliente_id' IS DISTINCT FROM NEW.cliente_id::text
    ) THEN RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.evaluacion_fiscal IS NOT NULL THEN
      RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.evaluacion_fiscal, NEW.conceptos_fiscales) IS DISTINCT FROM (OLD.evaluacion_fiscal, OLD.conceptos_fiscales) THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  IF OLD.evaluacion_fiscal IS NULL THEN RETURN NEW; END IF;
  IF (NEW.organization_id, NEW.cliente_id, NEW.embarque_id, NEW.es_consolidada, NEW.deleted_at,
      NEW.subtotal_usd, NEW.iva_usd, NEW.total_usd, NEW.subtotal_mxn, NEW.iva_mxn, NEW.total_mxn, NEW.tasa_iva_aplicada,
      NEW.proformas_origen, NEW.embarques_ids, NEW.cliente_nombre)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.cliente_id, OLD.embarque_id, OLD.es_consolidada, OLD.deleted_at,
      OLD.subtotal_usd, OLD.iva_usd, OLD.total_usd, OLD.subtotal_mxn, OLD.iva_mxn, OLD.total_mxn, OLD.tasa_iva_aplicada,
      OLD.proformas_origen, OLD.embarques_ids, OLD.cliente_nombre) THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  IF NEW.estado_proforma = 'facturada' OR NEW.factura_id IS NOT NULL OR NEW.factura_secundaria_id IS NOT NULL
    OR NEW.folio_factura_externa IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
  END IF;
  IF NEW.consolidada_en IS DISTINCT FROM OLD.consolidada_en THEN
    IF NOT v_propietario OR OLD.es_consolidada OR OLD.consolidada_en IS NOT NULL
      OR NEW.estado_revision IS DISTINCT FROM 'consolidada' OR NEW.token_publico IS NOT NULL OR NEW.token_expira_at IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM public.proformas p WHERE p.id = NEW.consolidada_en AND p.es_consolidada
        AND p.organization_id = OLD.organization_id AND p.cliente_id = OLD.cliente_id AND p.embarque_id = OLD.embarque_id
        AND p.evaluacion_fiscal IS NOT NULL AND OLD.id = ANY(p.proformas_origen)) THEN
      RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_INCOMPATIBLE' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.consolidada_en IS NOT NULL AND (
    NEW.estado_proforma, NEW.estado_cliente, NEW.estado_revision, NEW.estado_aprobacion,
    NEW.token_publico, NEW.token_expira_at, NEW.enviada_at, NEW.enviada_por
  ) IS DISTINCT FROM (
    OLD.estado_proforma, OLD.estado_cliente, OLD.estado_revision, OLD.estado_aprobacion,
    OLD.token_publico, OLD.token_expira_at, OLD.enviada_at, OLD.enviada_por
  ) THEN RAISE EXCEPTION 'LC_PROFORMA_FUENTE_CONSOLIDADA' USING ERRCODE = '23514'; END IF;

  IF (NEW.ajuste_consolidacion_aprobado_at, NEW.ajuste_consolidacion_aprobado_por)
    IS DISTINCT FROM (OLD.ajuste_consolidacion_aprobado_at, OLD.ajuste_consolidacion_aprobado_por) THEN
    IF NOT v_propietario OR NOT OLD.es_consolidada OR OLD.ajuste_consolidacion_aprobado_at IS NOT NULL
      OR NEW.ajuste_consolidacion_aprobado_at IS NULL OR NEW.ajuste_consolidacion_aprobado_por IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_APROBACION' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.es_consolidada AND NEW.ajuste_consolidacion_aprobado_at IS NULL
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.evaluacion_fiscal->'ajustes_consolidacion') a
      WHERE (a->>'diferencia')::numeric <> 0)
    AND (NEW.estado_cliente = 'aceptada' OR NEW.estado_revision = 'aprobada' OR NEW.estado_aprobacion = 'aprobada'
      OR NEW.estado_proforma = 'aprobada' OR NEW.token_publico IS NOT NULL OR NEW.enviada_at IS NOT NULL) THEN
    RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_APROBACION' USING ERRCODE = '23514';
  END IF;
  IF OLD.estado_cliente = 'rechazada' AND NEW.estado_cliente IS DISTINCT FROM OLD.estado_cliente THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
