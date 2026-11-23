CREATE OR REPLACE FUNCTION public._isr_guard_cotizacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_resultado jsonb; v_lineas jsonb; v_old_eval jsonb; v_revision boolean:=false; v_cambio boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.evaluacion_fiscal IS NOT NULL THEN RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    v_old_eval:=OLD.evaluacion_fiscal;
    IF v_old_eval IS NOT NULL AND (NEW.organization_id,NEW.deleted_at) IS DISTINCT FROM (OLD.organization_id,OLD.deleted_at) THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
    END IF;
    IF v_old_eval IS NOT NULL AND NEW.evaluacion_fiscal IS NULL THEN
      RAISE EXCEPTION 'LC_ISR_NO_DESACTIVAR' USING ERRCODE='23514';
    END IF;
    IF v_old_eval IS NOT NULL AND OLD.estado::text NOT IN ('Borrador','Solicitada') THEN
      SELECT NEW.estado::text='Borrador' AND EXISTS(
        SELECT 1 FROM public.cotizacion_revisiones_fiscales
        WHERE cotizacion_id=OLD.id AND transaccion=txid_current()
          AND estado_anterior=OLD.estado::text AND snapshot_anterior=OLD.evaluacion_fiscal
      ) INTO v_revision;
      IF NOT v_revision THEN
        IF (NEW.conceptos_venta,NEW.cliente_id,NEW.evaluacion_fiscal,NEW.moneda,NEW.tipo_cambio_usd)
          IS DISTINCT FROM (OLD.conceptos_venta,OLD.cliente_id,OLD.evaluacion_fiscal,OLD.moneda,OLD.tipo_cambio_usd)
          OR NEW.estado::text IN ('Borrador','Solicitada') THEN
          RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
        END IF;
        -- Sending, acceptance and shipment linkage must still agree with the approved issuer/receptor.
        IF NEW.estado::text IN ('Enviada','Aceptada','En operación') AND
          (NEW.estado,NEW.embarque_id) IS DISTINCT FROM (OLD.estado,OLD.embarque_id) THEN
          v_resultado:=public._evaluar_documento_isr_resico(NEW.organization_id,NEW.cliente_id,NEW.conceptos_venta);
          IF v_old_eval->>'estado'<>'confirmado' OR v_resultado->'conceptos' IS DISTINCT FROM NEW.conceptos_venta THEN
            RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
          END IF;
        END IF;
        RETURN NEW;
      END IF;
    END IF;
  END IF;
  -- Never enrol an already sent legacy quote by a housekeeping update.
  IF v_old_eval IS NULL AND (NEW.estado::text NOT IN ('Borrador','Solicitada') AND
      (TG_OP='INSERT' OR OLD.estado::text NOT IN ('Borrador','Solicitada'))) THEN RETURN NEW; END IF;
  IF NEW.evaluacion_fiscal IS NULL AND NOT public._isr_documento_habilitado(NEW.organization_id) THEN
    IF jsonb_typeof(NEW.conceptos_venta)='array' AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.conceptos_venta) l
      WHERE l ?| ARRAY['evaluacion_fiscal','tasa_ret_isr','monto_ret_isr']) THEN
      RAISE EXCEPTION 'LC_ISR_EVALUACION_REQUERIDA' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.embarque_id IS NOT NULL THEN RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(NEW.conceptos_venta) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'LC_ISR_IMPORTES_INVALIDOS' USING ERRCODE='22023';
  END IF;
  SELECT COALESCE(jsonb_agg(CASE WHEN NULLIF(l->>'id','') IS NULL THEN l||jsonb_build_object('id',gen_random_uuid()) ELSE l END ORDER BY n),'[]')
    INTO v_lineas FROM jsonb_array_elements(NEW.conceptos_venta) WITH ORDINALITY a(l,n);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_lineas) l GROUP BY l->>'id' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE='23514';
  END IF;
  v_resultado:=public._evaluar_documento_isr_resico(NEW.organization_id,NEW.cliente_id,v_lineas);
  NEW.conceptos_venta:=v_resultado->'conceptos'; NEW.evaluacion_fiscal:=v_resultado->'snapshot';
  IF TG_OP='UPDATE' AND OLD.autorizada_at IS NOT NULL AND
    (OLD.evaluacion_fiscal IS DISTINCT FROM NEW.evaluacion_fiscal OR OLD.cliente_id IS DISTINCT FROM NEW.cliente_id) THEN
    IF NEW.estado::text IN ('Enviada','Aceptada') THEN RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514'; END IF;
    NEW.autorizada_at:=NULL; NEW.autorizada_por:=NULL; NEW.margen_autorizado_pct:=NULL;
    NEW.autorizacion_motivo:=NULL; NEW.autorizacion_solicitada_at:=NULL;
  END IF;
  IF NEW.estado::text IN ('Enviada','Aceptada') AND NEW.evaluacion_fiscal->>'estado'<>'confirmado' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
