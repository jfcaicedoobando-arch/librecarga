-- Protected attempts for evaluated credit notes.
CREATE TABLE public.intentos_nota_credito_isr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id uuid NOT NULL REFERENCES public.factura_notas_credito(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  ambiente public.ambiente_facturapi NOT NULL,
  esperado jsonb NOT NULL CHECK (jsonb_typeof(esperado) = 'object'),
  estado text NOT NULL DEFAULT 'reservado' CHECK (estado IN ('reservado','pendiente','conciliacion','confirmado','rechazado')),
  facturapi_id text,
  uuid_fiscal text,
  resultado jsonb,
  creado_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actualizado_at timestamptz
);
CREATE UNIQUE INDEX intentos_nota_credito_isr_activas ON public.intentos_nota_credito_isr(nota_id) WHERE estado <> 'rechazado';
CREATE UNIQUE INDEX intentos_nota_credito_isr_remoto ON public.intentos_nota_credito_isr(organization_id,ambiente,facturapi_id)
  WHERE facturapi_id IS NOT NULL;
ALTER TABLE public.intentos_nota_credito_isr ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intentos_nota_credito_isr FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.intentos_nota_credito_isr FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY intento_nc_isr_scope ON public.intentos_nota_credito_isr AS RESTRICTIVE TO authenticated
  USING (public.rls_tenant_scope_ok(organization_id)) WITH CHECK (public.rls_tenant_scope_ok(organization_id));

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

CREATE OR REPLACE FUNCTION public.reservar_nota_credito_isr(
  p_nota_id uuid, p_organization_id uuid, p_actor uuid, p_updated_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_nota public.factura_notas_credito;
  v_factura public.facturas;
  v_totales record;
  v_intento public.intentos_nota_credito_isr;
  v_esperado jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor IS NULL OR NOT public.has_any_role_in_org_exact(
    p_actor, ARRAY['admin','admin_org','contador']::public.app_role[], p_organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_nota FROM public.factura_notas_credito
  WHERE id = p_nota_id AND organization_id = p_organization_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_nota.estado NOT IN ('Borrador','Aprobada')
    OR v_nota.updated_at IS DISTINCT FROM p_updated_at OR v_nota.uuid_fiscal IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_NC_FACTURA' USING ERRCODE = '23514';
  END IF;
  IF v_nota.facturapi_id IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_INTENTO_ACTIVO' USING ERRCODE = '23505';
  END IF;
  SELECT * INTO v_factura FROM public.facturas
  WHERE id = v_nota.factura_id AND organization_id = p_organization_id AND deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND OR v_factura.evaluacion_fiscal IS NULL OR v_factura.uuid_fiscal IS NULL
    OR v_factura.ambiente IS NULL OR v_factura.snapshot_emision->'evaluacion_fiscal' IS NULL
    OR nullif(v_factura.snapshot_emision#>>'{organizacion_snapshot,facturapi_org_id}','') IS NULL
    OR COALESCE(v_nota.uso_cfdi,'G02') <> 'G02' THEN
    RAISE EXCEPTION 'LC_ISR_NC_FACTURA' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_totales FROM public._isr_totales_nota_credito(v_nota.conceptos);
  IF v_totales.total IS DISTINCT FROM v_nota.monto THEN
    RAISE EXCEPTION 'LC_ISR_NC_TOTAL' USING ERRCODE = '23514';
  END IF;
  v_esperado := jsonb_build_object(
    'tipo','E','nota_id',v_nota.id,'organization_id',v_nota.organization_id,'factura_uuid',upper(v_factura.uuid_fiscal),
    'ambiente',v_factura.ambiente,'emisor',v_factura.snapshot_emision->'organizacion_snapshot',
    'receptor',v_factura.snapshot_emision->'cliente_snapshot',
    'tasas_iva_retenido',(SELECT COALESCE(jsonb_agg(tasa ORDER BY tasa),'[]'::jsonb) FROM (
      SELECT DISTINCT (c->>'tasa_ret_iva')::numeric AS tasa FROM jsonb_array_elements(v_nota.conceptos) c
    ) tasas WHERE tasa>0),
    'datos_factura',jsonb_build_object('tipo_cambio',v_nota.tipo_cambio,'uso_cfdi','G02','metodo_pago','PUE',
      'forma_pago',COALESCE(v_nota.forma_pago,v_factura.forma_pago),'serie',v_nota.serie),
    'totales',jsonb_build_object('moneda',v_nota.moneda,'subtotal',v_totales.subtotal,'iva',v_totales.iva,
      'ret_isr',v_totales.ret_isr,'ret_iva',v_totales.ret_iva,'total',v_totales.total));

  INSERT INTO public.intentos_nota_credito_isr(nota_id,organization_id,actor_id,ambiente,esperado)
    VALUES (p_nota_id,p_organization_id,p_actor,v_factura.ambiente,v_esperado) RETURNING * INTO v_intento;
  UPDATE public.factura_notas_credito SET facturapi_id = 'PENDING:' || v_intento.id::text,
    facturapi_claim_at = v_intento.creado_at WHERE id = p_nota_id;
  RETURN jsonb_build_object('claim','PENDING:' || v_intento.id::text,'esperado',v_esperado);
END;
$fn$;
REVOKE ALL ON FUNCTION public.reservar_nota_credito_isr(uuid,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_nota_credito_isr(uuid,uuid,uuid,timestamptz) TO service_role;

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

CREATE OR REPLACE FUNCTION public.registrar_resultado_nota_credito_isr(
  p_nota_id uuid, p_organization_id uuid, p_claim text, p_estado text, p_resultado jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_nota public.factura_notas_credito;
  v_intento public.intentos_nota_credito_isr;
  v_id text := NULLIF(p_resultado->>'facturapi_id','');
  v_uuid text := upper(NULLIF(p_resultado->>'uuid',''));
  v_xml jsonb := p_resultado->'xml';
  v_estado text := p_estado;
  v_folio bigint;
  v_serie text;
  v_url text;
  v_ruta text;
  v_hora timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('pendiente','conciliacion','rechazado','confirmado')
    OR jsonb_typeof(p_resultado) IS DISTINCT FROM 'object'
    OR (v_id IS NOT NULL AND v_id !~ '^[A-Za-z0-9_-]{1,150}$') THEN
    RAISE EXCEPTION 'LC_ISR_RESULTADO_INVALIDO' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT v_nota FROM public.factura_notas_credito
  WHERE id = p_nota_id AND organization_id = p_organization_id AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO v_intento FROM public.intentos_nota_credito_isr i
  WHERE i.nota_id=p_nota_id AND i.organization_id=p_organization_id AND 'PENDING:' || i.id::text=p_claim FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514'; END IF;
  IF v_intento.estado = 'confirmado' AND p_estado = 'confirmado'
    AND v_intento.facturapi_id = v_id AND v_intento.uuid_fiscal = v_uuid THEN
    RETURN jsonb_build_object('estado','confirmado');
  END IF;
  IF v_nota.facturapi_id IS DISTINCT FROM p_claim OR v_intento.estado IN ('rechazado','confirmado')
    OR (v_id IS NOT NULL AND (v_intento.facturapi_id IS NOT NULL AND v_id <> v_intento.facturapi_id
      OR p_resultado->>'external_id' IS DISTINCT FROM p_claim
      OR p_resultado->>'ambiente' IS DISTINCT FROM v_intento.ambiente::text
      OR p_resultado->>'facturapi_org_id' IS DISTINCT FROM v_intento.esperado#>>'{emisor,facturapi_org_id}')) THEN
    RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514';
  END IF;
  IF p_estado = 'rechazado' AND (v_intento.estado <> 'reservado' OR v_id IS NOT NULL OR v_intento.facturapi_id IS NOT NULL
    OR COALESCE(p_resultado->>'http_status','') NOT IN ('400','401','403','422','429')) THEN
    RAISE EXCEPTION 'LC_ISR_RECHAZO_INCIERTO' USING ERRCODE = '23514';
  END IF;

  IF p_estado = 'confirmado' THEN
    v_ruta := p_organization_id::text || '/notas-credito/' || v_uuid || '.xml';
    IF v_id IS NULL OR COALESCE(v_uuid,'') !~ '^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$'
      OR v_xml->>'uuid' IS DISTINCT FROM v_uuid OR v_xml->>'ruta' IS DISTINCT FROM v_ruta
      OR COALESCE(v_xml->>'sha256','') !~ '^[a-f0-9]{64}$'
      OR v_xml->>'factura_uuid' IS DISTINCT FROM v_intento.esperado->>'factura_uuid'
      OR v_xml->>'emisor_rfc' IS DISTINCT FROM v_intento.esperado#>>'{emisor,rfc}'
      OR v_xml->>'emisor_regimen' IS DISTINCT FROM v_intento.esperado#>>'{emisor,regimen_fiscal}'
      OR v_xml->>'receptor_rfc' IS DISTINCT FROM v_intento.esperado#>>'{receptor,rfc}'
      OR v_xml->>'receptor_regimen' IS DISTINCT FROM v_intento.esperado#>>'{receptor,regimen_fiscal}'
      OR v_xml->>'uso_cfdi' IS DISTINCT FROM 'G02' OR v_xml->'totales' IS DISTINCT FROM v_intento.esperado->'totales'
      OR p_resultado->>'moneda' IS DISTINCT FROM v_intento.esperado#>>'{totales,moneda}'
      OR p_resultado->'total' IS DISTINCT FROM v_intento.esperado#>'{totales,total}'
      OR COALESCE(p_resultado->>'folio','') !~ '^[1-9][0-9]{0,14}$'
      OR length(COALESCE(p_resultado->>'serie','')) > 25 THEN
      v_estado := 'conciliacion';
    END IF;
  END IF;
  IF v_intento.estado = 'conciliacion' AND v_estado = 'pendiente' THEN v_estado := 'conciliacion'; END IF;
  UPDATE public.intentos_nota_credito_isr SET estado=v_estado, facturapi_id=COALESCE(v_id,facturapi_id),
    uuid_fiscal=CASE WHEN v_estado='confirmado' THEN v_uuid ELSE NULL END, actualizado_at=v_hora,
    resultado=jsonb_strip_nulls(jsonb_build_object(
      'http_status',left(p_resultado->>'http_status',3),'motivo',left(p_resultado->>'motivo',90),
      'sha256_xml',CASE WHEN v_estado='confirmado' THEN v_xml->>'sha256' END))
  WHERE id=v_intento.id RETURNING * INTO v_intento;

  IF v_estado = 'confirmado' THEN
    v_folio := (p_resultado->>'folio')::bigint;
    v_serie := COALESCE(p_resultado->>'serie','');
    v_url := 'https://www.facturapi.io/v2/invoices/' || v_id;
    UPDATE public.factura_notas_credito SET estado='Timbrada', folio=v_serie || v_folio::text, serie=v_serie,
      folio_fiscal=v_folio, uuid_fiscal=v_uuid, ambiente=v_intento.ambiente, facturapi_id=v_id, facturapi_claim_at=NULL,
      facturapi_pendiente_id = NULL, facturapi_pendiente_at = NULL, timbrado_en=v_hora, timbrado_por=v_intento.actor_id,
      pdf_url=v_url || '/pdf', xml_url=v_url || '/xml', xml_backup_path=v_ruta
    WHERE id=p_nota_id;
    INSERT INTO public.bitacora_actividad(organization_id,usuario_id,usuario_email,modulo,accion,entidad_id,entidad_nombre,detalles)
    VALUES(p_organization_id,v_intento.actor_id,COALESCE((SELECT email FROM auth.users WHERE id=v_intento.actor_id),''),
      'facturacion','facturapi_nc_emitida',p_nota_id,v_serie || v_folio::text,
      jsonb_build_object('uuid',v_uuid,'facturapi_id',v_id,'factura_id',v_nota.factura_id,'intento',p_claim,'xml',v_ruta));
  ELSIF v_estado = 'rechazado' THEN
    UPDATE public.factura_notas_credito SET facturapi_id=NULL, facturapi_claim_at=NULL,
      facturapi_pendiente_id = NULL, facturapi_pendiente_at = NULL WHERE id=p_nota_id;
  ELSE
    UPDATE public.factura_notas_credito SET facturapi_pendiente_id=v_intento.facturapi_id,
      facturapi_pendiente_at=v_hora WHERE id=p_nota_id;
  END IF;
  RETURN jsonb_build_object('estado',v_estado);
END;
$fn$;
REVOKE ALL ON FUNCTION public.registrar_resultado_nota_credito_isr(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_resultado_nota_credito_isr(uuid,uuid,text,text,jsonb) TO service_role;

CREATE TRIGGER trg_isr_nota_timbrado BEFORE INSERT OR UPDATE ON public.factura_notas_credito FOR EACH ROW EXECUTE FUNCTION public._isr_validar_nota_timbrado();
