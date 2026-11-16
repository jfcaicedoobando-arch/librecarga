CREATE OR REPLACE FUNCTION public._isr_guard_timbrado_rep()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_firma text[] := ARRAY['facturapi_rep_id','facturapi_rep_claim_at','facturapi_rep_pendiente_id','facturapi_rep_pendiente_at',
    'uuid_rep','folio_rep','serie_rep','ambiente','timbrado_rep_en','timbrado_rep_por','rep_xml_backup_path','rep_xml_url',
    'rep_pdf_url','rep_cancelado_facturapi_id','rep_cancelado_uuid'];
  v_intento public.intentos_rep_isr;
  v_claim text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.facturas f WHERE f.id=NEW.factura_id AND f.organization_id=NEW.organization_id
    AND f.evaluacion_fiscal IS NOT NULL AND f.metodo_pago='PPD') THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.estado_rep='Pendiente' AND NOT EXISTS (
      SELECT 1 FROM unnest(v_firma) campo WHERE to_jsonb(NEW)->>campo IS NOT NULL) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'LC_ISR_REP_PROTEGIDO' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM unnest(v_firma) campo WHERE (to_jsonb(NEW)->campo) IS DISTINCT FROM (to_jsonb(OLD)->campo)) THEN
    IF OLD.facturapi_rep_id LIKE 'PENDING:%' AND (NEW.estado_rep,NEW.ret_isr,NEW.ret_iva)
      IS DISTINCT FROM (OLD.estado_rep,OLD.ret_isr,OLD.ret_iva) THEN
      RAISE EXCEPTION 'LC_ISR_REP_PROTEGIDO' USING ERRCODE = '23514';
    END IF;
    IF NEW.estado_rep=OLD.estado_rep OR (OLD.facturapi_rep_id IS NULL AND OLD.uuid_rep IS NULL
      AND OLD.estado_rep IN ('Pendiente','Error') AND NEW.estado_rep IN ('Pendiente','Error'))
      OR (auth.role()='service_role' AND OLD.estado_rep='Timbrado' AND NEW.estado_rep='Cancelado'
        AND OLD.uuid_rep IS NOT NULL AND NEW.rep_cancellation_status='accepted') THEN RETURN NEW; END IF;
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'LC_ISR_REP_PROTEGIDO' USING ERRCODE = '23514'; END IF;

  v_claim := CASE WHEN OLD.facturapi_rep_id LIKE 'PENDING:%' THEN OLD.facturapi_rep_id ELSE NEW.facturapi_rep_id END;
  SELECT * INTO v_intento FROM public.intentos_rep_isr i WHERE i.pago_id=NEW.id AND i.factura_id=NEW.factura_id
    AND i.organization_id=NEW.organization_id AND 'PENDING:'||i.id::text=v_claim;
  IF NOT FOUND THEN RAISE EXCEPTION 'LC_ISR_REP_PROTEGIDO' USING ERRCODE = '23514'; END IF;

  IF v_intento.estado IN ('reservado','pendiente','conciliacion') AND NEW.estado_rep=OLD.estado_rep
    AND NEW.facturapi_rep_id=v_claim AND NEW.facturapi_rep_claim_at=v_intento.creado_at
    AND NEW.facturapi_rep_pendiente_id IS NOT DISTINCT FROM v_intento.facturapi_id
    AND NEW.facturapi_rep_pendiente_at IS NOT DISTINCT FROM v_intento.actualizado_at
    AND (to_jsonb(NEW)-ARRAY['facturapi_rep_id','facturapi_rep_claim_at','facturapi_rep_pendiente_id',
      'facturapi_rep_pendiente_at','rep_cancelado_facturapi_id','rep_cancelado_uuid','ret_isr','ret_iva','rep_error','updated_at'])
      IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['facturapi_rep_id','facturapi_rep_claim_at','facturapi_rep_pendiente_id',
      'facturapi_rep_pendiente_at','rep_cancelado_facturapi_id','rep_cancelado_uuid','ret_isr','ret_iva','rep_error','updated_at']) THEN
    RETURN NEW;
  END IF;
  IF v_intento.estado='rechazado' AND OLD.facturapi_rep_id=v_claim AND NEW.estado_rep=OLD.estado_rep
    AND NEW.facturapi_rep_id IS NOT DISTINCT FROM v_intento.id_anterior AND NEW.facturapi_rep_claim_at IS NULL
    AND NEW.facturapi_rep_pendiente_id IS NULL AND NEW.facturapi_rep_pendiente_at IS NULL
    AND (to_jsonb(NEW)-ARRAY['facturapi_rep_id','facturapi_rep_claim_at','facturapi_rep_pendiente_id',
      'facturapi_rep_pendiente_at','rep_error','updated_at'])
      IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['facturapi_rep_id','facturapi_rep_claim_at','facturapi_rep_pendiente_id',
      'facturapi_rep_pendiente_at','rep_error','updated_at']) THEN RETURN NEW; END IF;
  IF v_intento.estado='confirmado' AND OLD.facturapi_rep_id=v_claim AND NEW.estado_rep='Timbrado'
    AND NEW.facturapi_rep_id=v_intento.facturapi_id AND NEW.uuid_rep=v_intento.uuid_fiscal
    AND NEW.ambiente=v_intento.ambiente AND NEW.timbrado_rep_en=v_intento.actualizado_at AND NEW.timbrado_rep_por=v_intento.actor_id
    AND NEW.facturapi_rep_claim_at IS NULL AND NEW.facturapi_rep_pendiente_id IS NULL AND NEW.facturapi_rep_pendiente_at IS NULL
    AND NEW.rep_xml_backup_path=v_intento.resultado->>'ruta'
    AND (to_jsonb(NEW)-(v_firma||ARRAY['estado_rep','ret_isr','ret_iva','rep_cancelado_en','rep_motivo_cancel',
      'rep_cancellation_status','rep_error','updated_at']))
      IS NOT DISTINCT FROM (to_jsonb(OLD)-(v_firma||ARRAY['estado_rep','ret_isr','ret_iva','rep_cancelado_en','rep_motivo_cancel',
      'rep_cancellation_status','rep_error','updated_at'])) THEN
    NEW.ret_isr := (v_intento.resultado->>'ret_isr')::numeric;
    NEW.ret_iva := (v_intento.resultado->>'ret_iva')::numeric;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'LC_ISR_REP_PROTEGIDO' USING ERRCODE = '23514';
END;
$fn$;
REVOKE ALL ON FUNCTION public._isr_guard_timbrado_rep() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zzzz_pagos_factura_rep_isr BEFORE INSERT OR UPDATE ON public.pagos_factura
  FOR EACH ROW EXECUTE FUNCTION public._isr_guard_timbrado_rep();
