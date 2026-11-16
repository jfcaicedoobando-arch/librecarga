CREATE OR REPLACE FUNCTION public._isr_validar_nota_timbrado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_intento public.intentos_nota_credito_isr;
  v_claim text;
  v_firma text[] := ARRAY['uuid_fiscal','facturapi_id','facturapi_claim_at','facturapi_pendiente_id','facturapi_pendiente_at',
    'ambiente','timbrado_en','timbrado_por','folio_fiscal','xml_backup_path','xml_url','pdf_url'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.facturas f
    WHERE f.id=NEW.factura_id AND f.organization_id=NEW.organization_id AND f.evaluacion_fiscal IS NOT NULL) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado='Borrador' AND NOT EXISTS (
      SELECT 1 FROM unnest(v_firma) AS campo WHERE (to_jsonb(NEW)->>campo) IS NOT NULL
    ) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'LC_ISR_NC_TIMBRADO_PROTEGIDO' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(v_firma) AS campo WHERE (to_jsonb(NEW)->campo) IS DISTINCT FROM (to_jsonb(OLD)->campo))
    AND (OLD.uuid_fiscal IS NULL OR (NEW.serie,NEW.folio) IS NOT DISTINCT FROM (OLD.serie,OLD.folio))
    AND (NEW.estado=OLD.estado OR (OLD.uuid_fiscal IS NOT NULL AND NEW.estado IN ('Aplicada','Cancelada'))
      OR (OLD.facturapi_id IS NULL AND OLD.uuid_fiscal IS NULL AND NEW.estado='Cancelada')) THEN
    RETURN NEW;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'LC_ISR_NC_TIMBRADO_PROTEGIDO' USING ERRCODE = '23514';
  END IF;
  v_claim := COALESCE(OLD.facturapi_id,NEW.facturapi_id);
  SELECT * INTO v_intento FROM public.intentos_nota_credito_isr i
  WHERE i.nota_id=NEW.id AND i.organization_id=NEW.organization_id AND 'PENDING:' || i.id::text=v_claim;
  IF NOT FOUND OR OLD.uuid_fiscal IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_NC_TIMBRADO_PROTEGIDO' USING ERRCODE = '23514';
  END IF;

  IF v_intento.estado IN ('reservado','pendiente','conciliacion')
    AND NEW.estado=OLD.estado AND NEW.facturapi_id=v_claim AND NEW.facturapi_claim_at=v_intento.creado_at
    AND NEW.facturapi_pendiente_id IS NOT DISTINCT FROM v_intento.facturapi_id
    AND NEW.facturapi_pendiente_at IS NOT DISTINCT FROM v_intento.actualizado_at
    AND (to_jsonb(NEW) - ARRAY['facturapi_id','facturapi_claim_at','facturapi_pendiente_id','facturapi_pendiente_at','updated_at'])
      IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['facturapi_id','facturapi_claim_at','facturapi_pendiente_id','facturapi_pendiente_at','updated_at'])
  THEN RETURN NEW; END IF;
  IF v_intento.estado='rechazado' AND OLD.facturapi_id=v_claim AND NEW.estado=OLD.estado
    AND NEW.facturapi_id IS NULL AND NEW.facturapi_claim_at IS NULL
    AND NEW.facturapi_pendiente_id IS NULL AND NEW.facturapi_pendiente_at IS NULL
    AND (to_jsonb(NEW) - ARRAY['facturapi_id','facturapi_claim_at','facturapi_pendiente_id','facturapi_pendiente_at','updated_at'])
      IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['facturapi_id','facturapi_claim_at','facturapi_pendiente_id','facturapi_pendiente_at','updated_at'])
  THEN RETURN NEW; END IF;
  IF v_intento.estado='confirmado' AND OLD.facturapi_id=v_claim AND NEW.estado='Timbrada'
    AND NEW.facturapi_id=v_intento.facturapi_id AND NEW.uuid_fiscal=v_intento.uuid_fiscal
    AND NEW.ambiente=v_intento.ambiente AND NEW.timbrado_por=v_intento.actor_id AND NEW.timbrado_en=v_intento.actualizado_at
    AND NEW.facturapi_claim_at IS NULL AND NEW.facturapi_pendiente_id IS NULL AND NEW.facturapi_pendiente_at IS NULL
    AND NEW.xml_backup_path=NEW.organization_id::text || '/notas-credito/' || v_intento.uuid_fiscal || '.xml'
    AND (to_jsonb(NEW) - (v_firma || ARRAY['estado','folio','serie','updated_at']))
      IS NOT DISTINCT FROM (to_jsonb(OLD) - (v_firma || ARRAY['estado','folio','serie','updated_at']))
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'LC_ISR_NC_TIMBRADO_PROTEGIDO' USING ERRCODE = '23514';
END;
$fn$;
REVOKE ALL ON FUNCTION public._isr_validar_nota_timbrado() FROM PUBLIC,anon,authenticated,service_role;
