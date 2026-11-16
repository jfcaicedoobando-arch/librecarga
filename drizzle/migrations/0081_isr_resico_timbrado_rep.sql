CREATE TABLE public.intentos_rep_isr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id uuid NOT NULL REFERENCES public.pagos_factura(id),
  factura_id uuid NOT NULL REFERENCES public.facturas(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  ambiente public.ambiente_facturapi NOT NULL,
  esperado jsonb NOT NULL CHECK (jsonb_typeof(esperado) = 'object'),
  estado text NOT NULL DEFAULT 'reservado' CHECK (estado IN ('reservado','pendiente','conciliacion','confirmado','rechazado')),
  id_anterior text,
  facturapi_id text,
  uuid_fiscal text,
  resultado jsonb,
  creado_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actualizado_at timestamptz
);
CREATE UNIQUE INDEX intentos_rep_isr_activo ON public.intentos_rep_isr(factura_id)
  WHERE estado IN ('reservado','pendiente','conciliacion');
CREATE UNIQUE INDEX intentos_rep_isr_remoto ON public.intentos_rep_isr(organization_id,ambiente,facturapi_id)
  WHERE facturapi_id IS NOT NULL;
CREATE INDEX intentos_rep_isr_pago ON public.intentos_rep_isr(pago_id);
ALTER TABLE public.intentos_rep_isr ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intentos_rep_isr FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.intentos_rep_isr FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY intento_rep_isr_scope ON public.intentos_rep_isr AS RESTRICTIVE TO authenticated
  USING (public.rls_tenant_scope_ok(organization_id)) WITH CHECK (public.rls_tenant_scope_ok(organization_id));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reservar_rep_isr(
  p_pago_id uuid, p_organization_id uuid, p_actor uuid, p_updated_at timestamptz, p_esperado jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_pago public.pagos_factura;
  v_factura public.facturas;
  v_intento public.intentos_rep_isr;
  v_cobro jsonb := p_esperado->'pago';
  v_documento jsonb := p_esperado->'documento';
  v_org jsonb;
  v_cliente jsonb;
  v_notas record;
  v_previos bigint;
  v_anteriores numeric;
  v_rompe_secuencia boolean;
  v_saldo numeric;
  v_equivalencia numeric;
  v_claim text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor IS NULL OR NOT public.has_any_role_in_org_exact(
    p_actor, ARRAY['admin','admin_org','contador','ejecutivo_cobranza']::public.app_role[], p_organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_pago FROM public.pagos_factura
  WHERE id=p_pago_id AND organization_id=p_organization_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_pago.updated_at IS DISTINCT FROM p_updated_at OR v_pago.estado_rep NOT IN ('Pendiente','Error','Cancelado')
    OR (v_pago.estado_rep <> 'Cancelado' AND (v_pago.facturapi_rep_id IS NOT NULL OR v_pago.uuid_rep IS NOT NULL))
    OR COALESCE(v_pago.facturapi_rep_id LIKE 'PENDING:%',false) THEN
    RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_factura FROM public.facturas
  WHERE id=v_pago.factura_id AND organization_id=p_organization_id AND deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND OR v_factura.evaluacion_fiscal IS NULL OR v_factura.uuid_fiscal IS NULL OR v_factura.ambiente IS NULL
    OR v_factura.metodo_pago IS DISTINCT FROM 'PPD' OR v_factura.snapshot_emision->'evaluacion_fiscal' IS NULL
    OR v_factura.estado='Cancelada' OR COALESCE(v_factura.facturapi_id,'') !~ '^[A-Za-z0-9_-]{1,150}$' THEN
    RAISE EXCEPTION 'LC_ISR_REP_CONTEXTO' USING ERRCODE = '23514';
  END IF;
  v_org := v_factura.snapshot_emision->'organizacion_snapshot';
  v_cliente := v_factura.snapshot_emision->'cliente_snapshot';
  IF NULLIF(v_org->>'facturapi_org_id','') IS NULL OR v_org->>'id' IS DISTINCT FROM p_organization_id::text
    OR v_cliente->>'id' IS DISTINCT FROM v_factura.cliente_id::text
    OR p_esperado->'perfil' IS DISTINCT FROM jsonb_build_object('ambiente',v_factura.ambiente,
      'emisor',jsonb_build_object('facturapiOrgId',btrim(v_org->>'facturapi_org_id'),'rfc',btrim(v_org->>'rfc'),
        'regimen',btrim(v_org->>'regimen_fiscal'),'cp',btrim(v_org->>'codigo_postal')),
      'receptor',jsonb_build_object('id',v_cliente->>'id','nombre',btrim(v_cliente->>'nombre'),'rfc',btrim(v_cliente->>'rfc'),
        'regimen_fiscal',btrim(v_cliente->>'regimen_fiscal'),'codigo_postal',btrim(v_cliente->>'codigo_postal'))) THEN
    RAISE EXCEPTION 'LC_ISR_REP_CONTEXTO' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_notas FROM public._isr_notas_credito_vigentes(v_factura,NULL);
  SELECT count(*),COALESCE(sum(p.monto_aplicado_factura),0),COALESCE(bool_or(p.estado_rep <> 'Timbrado' OR p.uuid_rep IS NULL),false)
    INTO v_previos,v_anteriores,v_rompe_secuencia
    FROM public.pagos_factura p WHERE p.factura_id=v_factura.id AND p.organization_id=p_organization_id
    AND p.deleted_at IS NULL AND NOT public.pago_rep_anulado(p.estado_rep)
    AND (p.fecha_pago,p.created_at,p.id)<(v_pago.fecha_pago,v_pago.created_at,v_pago.id);
  v_saldo := round(v_factura.total-v_notas.neto_aplicado-v_anteriores,2);
  v_equivalencia := CASE WHEN v_pago.moneda=v_factura.moneda THEN 1
    ELSE round(v_pago.monto_aplicado_factura / NULLIF(v_pago.monto,0),10) END;

  IF v_rompe_secuencia OR v_notas.neto_reservado > 0 OR v_saldo < v_pago.monto_aplicado_factura
    OR v_pago.monto <= 0 OR v_pago.monto_aplicado_factura <= 0 OR NOT (v_equivalencia > 0)
    OR round(v_pago.monto_aplicado_factura / NULLIF(v_equivalencia,0),2) <> v_pago.monto
    OR v_cobro->'fecha' IS DISTINCT FROM to_jsonb(v_pago.fecha_pago) OR v_cobro->'moneda' IS DISTINCT FROM to_jsonb(v_pago.moneda)
    OR v_cobro->'monto' IS DISTINCT FROM to_jsonb(v_pago.monto)
    OR v_cobro->'tipo_cambio' IS DISTINCT FROM to_jsonb(CASE WHEN v_pago.moneda='MXN' THEN 1::numeric ELSE v_pago.tipo_cambio END)
    OR NULLIF(v_cobro->>'referencia','') IS DISTINCT FROM NULLIF(v_pago.referencia,'')
    OR COALESCE(v_cobro->>'forma','') !~ '^[0-9]{2}$' OR v_cobro->>'forma'='99'
    OR upper(v_documento->>'uuid') IS DISTINCT FROM upper(v_factura.uuid_fiscal)
    OR v_documento->'moneda' IS DISTINCT FROM to_jsonb(v_factura.moneda)
    OR v_documento->'equivalencia' IS DISTINCT FROM to_jsonb(v_equivalencia)
    OR v_documento->'parcialidad' IS DISTINCT FROM to_jsonb(v_previos+1)
    OR v_documento->'saldo_anterior' IS DISTINCT FROM to_jsonb(v_saldo)
    OR v_documento->'importe_pagado' IS DISTINCT FROM to_jsonb(v_pago.monto_aplicado_factura)
    OR v_documento->'saldo_insoluto' IS DISTINCT FROM to_jsonb(v_saldo-v_pago.monto_aplicado_factura)
    OR COALESCE(v_documento->>'objeto_impuesto','') NOT IN ('01','02')
    OR jsonb_typeof(v_documento->'impuestos') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'LC_ISR_REP_CONTEXTO' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.intentos_rep_isr(pago_id,factura_id,organization_id,actor_id,ambiente,esperado,id_anterior)
    VALUES (p_pago_id,v_factura.id,p_organization_id,p_actor,v_factura.ambiente,p_esperado,v_pago.facturapi_rep_id)
  RETURNING * INTO v_intento;
  v_claim := 'PENDING:'||v_intento.id::text;
  UPDATE public.pagos_factura SET facturapi_rep_id=v_claim,facturapi_rep_claim_at=v_intento.creado_at,rep_error=NULL,
    rep_cancelado_facturapi_id=CASE WHEN v_pago.estado_rep='Cancelado' THEN v_pago.facturapi_rep_id ELSE rep_cancelado_facturapi_id END,
    rep_cancelado_uuid=CASE WHEN v_pago.estado_rep='Cancelado' THEN v_pago.uuid_rep ELSE rep_cancelado_uuid END
  WHERE id=p_pago_id;
  RETURN jsonb_build_object('claim',v_claim,'esperado',v_intento.esperado);
END;
$fn$;
REVOKE ALL ON FUNCTION public.reservar_rep_isr(uuid,uuid,uuid,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_rep_isr(uuid,uuid,uuid,timestamptz,jsonb) TO service_role;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.obtener_intento_rep_isr(p_pago_id uuid,p_organization_id uuid,p_claim text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE v_intento public.intentos_rep_isr;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pagos_factura p JOIN public.facturas f ON f.id=p.factura_id
    AND f.organization_id=p.organization_id WHERE p.id=p_pago_id AND p.organization_id=p_organization_id
    AND f.evaluacion_fiscal IS NOT NULL AND f.metodo_pago='PPD') THEN
    RETURN jsonb_build_object('protegido',false);
  END IF;
  SELECT i.* INTO v_intento FROM public.intentos_rep_isr i JOIN public.pagos_factura p ON p.id=i.pago_id
    AND p.organization_id=i.organization_id AND p.factura_id=i.factura_id
  WHERE i.pago_id=p_pago_id AND i.organization_id=p_organization_id AND p.deleted_at IS NULL
    AND p.facturapi_rep_id=p_claim AND 'PENDING:'||i.id::text=p_claim
    AND i.estado IN ('reservado','pendiente','conciliacion');
  RETURN jsonb_build_object('protegido',true,'esperado',v_intento.esperado,'facturapi_id',v_intento.facturapi_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.obtener_intento_rep_isr(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_intento_rep_isr(uuid,uuid,text) TO service_role;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public._isr_proyectar_retenciones_rep(p_factura public.facturas)
RETURNS TABLE(pago_id uuid, ret_isr numeric, ret_iva numeric)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
  WITH activos AS (
    SELECT p.id,p.fecha_pago,p.created_at,p.monto_aplicado_factura AS monto,p.ret_isr,p.ret_iva,
      (p.uuid_rep IS NOT NULL OR p.facturapi_rep_id IS NOT NULL OR p.estado_rep NOT IN ('Pendiente','Error')) AS fijo
    FROM public.pagos_factura p WHERE p.factura_id=p_factura.id AND p.organization_id=p_factura.organization_id
      AND p.deleted_at IS NULL AND NOT public.pago_rep_anulado(p.estado_rep)
  ), disponible AS (
    SELECT round(p_factura.total-n.neto_aplicado-f.neto,2) AS neto,
      greatest(round(p_factura.ret_isr-n.isr_aplicado-f.isr,2),0) AS isr,
      greatest(round(p_factura.ret_iva-n.iva_aplicado-f.iva,2),0) AS iva
    FROM public._isr_notas_credito_vigentes(p_factura,NULL) n
    CROSS JOIN LATERAL (SELECT COALESCE(sum(a.monto),0) AS neto,
      COALESCE(sum(a.ret_isr),0) AS isr, COALESCE(sum(a.ret_iva),0) AS iva FROM activos a WHERE a.fijo) f
  ), acumulados AS (
    SELECT a.id,a.monto,sum(a.monto) OVER (ORDER BY a.fecha_pago,a.created_at,a.id ROWS UNBOUNDED PRECEDING) AS acumulado
    FROM activos a WHERE NOT a.fijo
  )
  SELECT a.id,
    COALESCE(round(d.isr*least(a.acumulado,d.neto)/NULLIF(d.neto,0),2)
      -round(d.isr*least(a.acumulado-a.monto,d.neto)/NULLIF(d.neto,0),2),0),
    COALESCE(round(d.iva*least(a.acumulado,d.neto)/NULLIF(d.neto,0),2)
      -round(d.iva*least(a.acumulado-a.monto,d.neto)/NULLIF(d.neto,0),2),0)
  FROM acumulados a CROSS JOIN disponible d WHERE d.neto>=0;
$fn$;
REVOKE ALL ON FUNCTION public._isr_proyectar_retenciones_rep(public.facturas) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.registrar_resultado_rep_isr(
  p_pago_id uuid,p_organization_id uuid,p_claim text,p_estado text,p_resultado jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_pago public.pagos_factura;
  v_factura public.facturas;
  v_intento public.intentos_rep_isr;
  v_estado text := p_estado;
  v_id text := NULLIF(p_resultado->>'facturapi_id','');
  v_uuid text := upper(NULLIF(p_resultado->>'uuid',''));
  v_xml jsonb := p_resultado->'xml';
  v_dr jsonb;
  v_hora timestamptz := clock_timestamp();
  v_ruta text;
  v_url text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('pendiente','conciliacion','rechazado','confirmado')
    OR jsonb_typeof(p_resultado) IS DISTINCT FROM 'object' OR (v_id IS NOT NULL AND v_id !~ '^[A-Za-z0-9_-]{1,150}$') THEN
    RAISE EXCEPTION 'LC_ISR_RESULTADO_INVALIDO' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO STRICT v_pago FROM public.pagos_factura WHERE id=p_pago_id AND organization_id=p_organization_id
    AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO v_intento FROM public.intentos_rep_isr i WHERE i.pago_id=p_pago_id AND i.factura_id=v_pago.factura_id
    AND i.organization_id=p_organization_id AND 'PENDING:'||i.id::text=p_claim FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514'; END IF;
  IF v_intento.estado='confirmado' AND p_estado='confirmado' AND v_intento.facturapi_id=v_id AND v_intento.uuid_fiscal=v_uuid
    AND v_intento.resultado->>'sha256' IS NOT DISTINCT FROM v_xml->>'sha256' THEN RETURN jsonb_build_object('estado','confirmado'); END IF;
  IF v_pago.facturapi_rep_id IS DISTINCT FROM p_claim OR v_intento.estado IN ('rechazado','confirmado')
    OR (v_id IS NOT NULL AND (v_intento.facturapi_id IS NOT NULL AND v_id<>v_intento.facturapi_id
      OR p_resultado->>'external_id' IS DISTINCT FROM p_claim OR p_resultado->>'ambiente' IS DISTINCT FROM v_intento.ambiente::text
      OR p_resultado->>'facturapi_org_id' IS DISTINCT FROM v_intento.esperado#>>'{perfil,emisor,facturapiOrgId}')) THEN
    RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514';
  END IF;
  IF p_estado='rechazado' AND (v_intento.estado<>'reservado' OR v_id IS NOT NULL OR v_intento.facturapi_id IS NOT NULL
    OR COALESCE(p_resultado->>'http_status','') NOT IN ('400','401','403','422','429')) THEN
    RAISE EXCEPTION 'LC_ISR_RECHAZO_INCIERTO' USING ERRCODE = '23514';
  END IF;

  IF p_estado='confirmado' THEN
    v_dr := v_intento.esperado->'documento';
    v_ruta := p_organization_id::text || '/rep/' || v_uuid || '.xml';
    IF v_id IS NULL OR COALESCE(v_uuid,'') !~ '^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$'
      OR v_xml->>'uuid' IS DISTINCT FROM v_uuid OR v_xml->>'ruta' IS DISTINCT FROM v_ruta
      OR COALESCE(v_xml->>'sha256','') !~ '^[a-f0-9]{64}$' OR p_resultado->'total' IS DISTINCT FROM '0'::jsonb
      OR v_xml->>'factura_uuid' IS DISTINCT FROM upper(v_dr->>'uuid') OR v_xml->'moneda_factura' IS DISTINCT FROM v_dr->'moneda'
      OR v_xml->'parcialidad' IS DISTINCT FROM v_dr->'parcialidad' OR v_xml->'saldo_anterior' IS DISTINCT FROM v_dr->'saldo_anterior'
      OR v_xml->'importe_pagado' IS DISTINCT FROM v_dr->'importe_pagado' OR v_xml->'saldo_insoluto' IS DISTINCT FROM v_dr->'saldo_insoluto'
      OR v_xml->'moneda_pago' IS DISTINCT FROM v_intento.esperado#>'{pago,moneda}'
      OR v_xml->'monto_recibido' IS DISTINCT FROM v_intento.esperado#>'{pago,monto}'
      OR v_xml->>'emisor_rfc' IS DISTINCT FROM v_intento.esperado#>>'{perfil,emisor,rfc}'
      OR v_xml->>'receptor_rfc' IS DISTINCT FROM v_intento.esperado#>>'{perfil,receptor,rfc}'
      OR jsonb_typeof(v_xml->'ret_isr') IS DISTINCT FROM 'number' OR jsonb_typeof(v_xml->'ret_iva') IS DISTINCT FROM 'number'
      OR COALESCE(v_xml->>'ret_isr','') !~ '^[0-9]{1,14}(\.[0-9]{1,2})?$' OR COALESCE(v_xml->>'ret_iva','') !~ '^[0-9]{1,14}(\.[0-9]{1,2})?$'
      OR COALESCE(p_resultado->>'folio','0') !~ '^[0-9]{1,9}$' OR length(COALESCE(p_resultado->>'serie',''))>25 THEN
      v_estado := 'conciliacion';
    END IF;
    IF v_estado='confirmado' AND EXISTS (
      SELECT 1 FROM (VALUES ('ISR','ret_isr'),('IVA','ret_iva')) AS impuesto(tipo,campo)
      CROSS JOIN LATERAL (
        SELECT COALESCE(sum((j->>'base')::numeric*(j->>'rate')::numeric),0) AS monto,count(*) AS grupos
        FROM jsonb_array_elements(v_dr->'impuestos') j WHERE j->>'type'=impuesto.tipo AND j->'withholding'='true'::jsonb
      ) t WHERE abs(round(t.monto,2)-(v_xml->>impuesto.campo)::numeric)>0.01*t.grupos
    ) THEN v_estado := 'conciliacion'; END IF;
  END IF;

  IF v_intento.estado='conciliacion' AND v_estado='pendiente' THEN v_estado := 'conciliacion'; END IF;
  UPDATE public.intentos_rep_isr SET estado=v_estado,facturapi_id=COALESCE(v_id,facturapi_id),
    uuid_fiscal=CASE WHEN v_estado='confirmado' THEN v_uuid END, actualizado_at=v_hora,
    resultado=CASE WHEN v_estado='confirmado' THEN v_xml ELSE jsonb_strip_nulls(jsonb_build_object(
      'http_status',left(p_resultado->>'http_status',3),'motivo',left(p_resultado->>'motivo',90))) END
  WHERE id=v_intento.id RETURNING * INTO v_intento;

  IF v_estado='confirmado' THEN
    SELECT * INTO STRICT v_factura FROM public.facturas WHERE id=v_pago.factura_id AND organization_id=p_organization_id FOR NO KEY UPDATE;
    -- A concurrent edit on another payment can be retried by recovery of the same attempt.
    PERFORM 1 FROM public.pagos_factura p WHERE p.factura_id=v_factura.id AND p.organization_id=p_organization_id
      AND p.deleted_at IS NULL AND p.uuid_rep IS NULL AND p.facturapi_rep_id IS NULL
      AND p.estado_rep IN ('Pendiente','Error') ORDER BY p.id FOR UPDATE NOWAIT;
    v_url := 'https://www.facturapi.io/v2/invoices/' || v_id;
    UPDATE public.pagos_factura SET estado_rep='Timbrado',facturapi_rep_id=v_id,uuid_rep=v_uuid,
      folio_rep=COALESCE(p_resultado->>'folio','0')::integer,serie_rep=COALESCE(p_resultado->>'serie',''),
      ambiente=v_intento.ambiente,timbrado_rep_en=v_hora,timbrado_rep_por=v_intento.actor_id,
      rep_pdf_url=v_url||'/pdf',rep_xml_url=v_url||'/xml',rep_xml_backup_path=v_ruta,rep_error=NULL,
      facturapi_rep_claim_at=NULL,facturapi_rep_pendiente_id=NULL,facturapi_rep_pendiente_at=NULL,
      rep_cancelado_en=NULL,rep_motivo_cancel=NULL,rep_cancellation_status='none'
    WHERE id=p_pago_id;
    UPDATE public.pagos_factura p SET ret_isr=proy.ret_isr,ret_iva=proy.ret_iva
      FROM public._isr_proyectar_retenciones_rep(v_factura) proy WHERE p.id=proy.pago_id
      AND (p.ret_isr,p.ret_iva) IS DISTINCT FROM (proy.ret_isr,proy.ret_iva);
    INSERT INTO public.bitacora_actividad(organization_id,usuario_id,usuario_email,modulo,accion,entidad_id,detalles)
    VALUES(p_organization_id,v_intento.actor_id,COALESCE((SELECT email FROM auth.users WHERE id=v_intento.actor_id),''),
      'facturacion','facturapi_rep_emitido',p_pago_id,jsonb_build_object('uuid',v_uuid,'facturapi_id',v_id,
        'factura_id',v_pago.factura_id,'intento',p_claim,'ret_isr',v_xml->'ret_isr','ret_iva',v_xml->'ret_iva'));
  ELSIF v_estado='rechazado' THEN
    UPDATE public.pagos_factura SET facturapi_rep_id=v_intento.id_anterior,facturapi_rep_claim_at=NULL,
      facturapi_rep_pendiente_id=NULL,facturapi_rep_pendiente_at=NULL,rep_error=left(p_resultado->>'motivo',90) WHERE id=p_pago_id;
  ELSE
    UPDATE public.pagos_factura SET facturapi_rep_pendiente_id=v_intento.facturapi_id,facturapi_rep_pendiente_at=v_hora WHERE id=p_pago_id;
  END IF;
  RETURN jsonb_build_object('estado',v_estado);
END;
$fn$;
REVOKE ALL ON FUNCTION public.registrar_resultado_rep_isr(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_resultado_rep_isr(uuid,uuid,text,text,jsonb) TO service_role;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.calc_pago_retenciones() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_factura public.facturas;
  v_notas record;
  v_disponible numeric;
  v_fac_ret_isr numeric; v_fac_ret_iva numeric;
  v_ncs numeric; v_base numeric; v_ratio numeric; v_monto numeric;
  v_prev_isr numeric; v_prev_iva numeric; v_prev_monto numeric;
  v_proy record;
BEGIN
  SELECT * INTO v_factura FROM public.facturas WHERE id = NEW.factura_id AND organization_id = NEW.organization_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_fac_ret_isr := COALESCE(v_factura.ret_isr, 0);
  v_fac_ret_iva := COALESCE(v_factura.ret_iva, 0);
  IF v_factura.evaluacion_fiscal IS NULL AND (
    COALESCE(NEW.ret_isr, 0) > 0 OR COALESCE(NEW.ret_iva, 0) > 0 OR (v_fac_ret_isr = 0 AND v_fac_ret_iva = 0)
    OR (TG_OP = 'UPDATE' AND (OLD.factura_id, OLD.monto_aplicado_factura, OLD.ret_isr, OLD.ret_iva)
        IS NOT DISTINCT FROM (NEW.factura_id, NEW.monto_aplicado_factura, NEW.ret_isr, NEW.ret_iva))
  ) THEN
    RETURN NEW;
  END IF;

  IF v_factura.evaluacion_fiscal IS NOT NULL THEN
    IF NEW.deleted_at IS NOT NULL OR (public.pago_rep_anulado(NEW.estado_rep)
      AND NOT COALESCE(NEW.facturapi_rep_id LIKE 'PENDING:%', false)) THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL
      AND (NOT public.pago_rep_anulado(OLD.estado_rep) OR OLD.facturapi_rep_id LIKE 'PENDING:%')
      AND (OLD.factura_id, OLD.monto_aplicado_factura) IS NOT DISTINCT FROM (NEW.factura_id, NEW.monto_aplicado_factura) THEN
      IF v_factura.metodo_pago='PPD' AND auth.role()='service_role' AND OLD.uuid_rep IS NULL
        AND OLD.facturapi_rep_id IS NULL AND OLD.estado_rep IN ('Pendiente','Error')
        AND (NEW.ret_isr,NEW.ret_iva) IS DISTINCT FROM (OLD.ret_isr,OLD.ret_iva) THEN
        SELECT p.ret_isr,p.ret_iva INTO v_proy FROM public._isr_proyectar_retenciones_rep(v_factura) p WHERE p.pago_id=OLD.id;
        IF FOUND THEN
          NEW.ret_isr := v_proy.ret_isr;
          NEW.ret_iva := v_proy.ret_iva;
          RETURN NEW;
        END IF;
      END IF;
      NEW.ret_isr := OLD.ret_isr;
      NEW.ret_iva := OLD.ret_iva;
      RETURN NEW;
    END IF;
    -- Notes and payments serialize on the invoice before allocating the balance.
    SELECT * INTO STRICT v_factura FROM public.facturas WHERE id = NEW.factura_id FOR NO KEY UPDATE;
  END IF;

  SELECT COALESCE(SUM(COALESCE(p.ret_isr,0)),0),
         COALESCE(SUM(COALESCE(p.ret_iva,0)),0),
         COALESCE(SUM(COALESCE(NULLIF(p.monto_aplicado_factura,0), p.monto)),0)
    INTO v_prev_isr, v_prev_iva, v_prev_monto
    FROM public.pagos_factura p
   WHERE p.factura_id = NEW.factura_id
     AND p.deleted_at IS NULL
     AND (NOT public.pago_rep_anulado(p.estado_rep)
       OR (v_factura.evaluacion_fiscal IS NOT NULL AND p.facturapi_rep_id LIKE 'PENDING:%'))
     AND p.organization_id = v_factura.organization_id
     AND p.id IS DISTINCT FROM NEW.id;

  IF v_factura.evaluacion_fiscal IS NOT NULL THEN
    SELECT * INTO v_notas FROM public._isr_notas_credito_vigentes(v_factura, NULL);
    v_disponible := round(v_factura.total - v_notas.neto_aplicado - v_prev_monto, 2);
    v_monto := NEW.monto_aplicado_factura;
    IF v_disponible <= 0 OR round(v_monto + v_notas.neto_reservado, 2) > v_disponible THEN
      RAISE EXCEPTION 'LC_PAGO_SOBREPAGO: el pago excede el saldo disponible' USING ERRCODE = '23514';
    END IF;
    v_fac_ret_isr := greatest(round(v_factura.ret_isr - v_notas.isr_aplicado - v_prev_isr, 2), 0);
    v_fac_ret_iva := greatest(round(v_factura.ret_iva - v_notas.iva_aplicado - v_prev_iva, 2), 0);
    v_ratio := v_monto / v_disponible;
    NEW.ret_isr := round(v_fac_ret_isr * v_ratio, 2);
    NEW.ret_iva := round(v_fac_ret_iva * v_ratio, 2);
    IF round(NEW.ret_isr + v_notas.isr_reservado, 2) > v_fac_ret_isr
      OR round(NEW.ret_iva + v_notas.iva_reservado, 2) > v_fac_ret_iva THEN
      RAISE EXCEPTION 'LC_ISR_PAGO_NC_RESERVADA: una nota por timbrar tiene reservadas las retenciones' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Retained behavior for invoices issued before the evaluated workflow.
  v_ncs := COALESCE(public.nc_aplicadas_en_moneda_factura(NEW.factura_id), 0);
  v_base := COALESCE(v_factura.subtotal, 0) + COALESCE(v_factura.iva, 0) - v_fac_ret_iva - v_fac_ret_isr - v_ncs;
  v_monto := COALESCE(NULLIF(NEW.monto_aplicado_factura, 0), NEW.monto);
  IF v_base <= 0 OR COALESCE(v_monto, 0) <= 0 THEN RETURN NEW; END IF;
  IF v_prev_monto + v_monto >= v_base - 0.01 THEN
    -- Pago liquidador: absorbe el residuo de centavos del prorrateo.
    NEW.ret_isr := GREATEST(ROUND(v_fac_ret_isr - v_prev_isr, 2), 0);
    NEW.ret_iva := GREATEST(ROUND(v_fac_ret_iva - v_prev_iva, 2), 0);
  ELSE
    v_ratio := v_monto / v_base;
    NEW.ret_isr := ROUND(v_fac_ret_isr * v_ratio, 2);
    NEW.ret_iva := ROUND(v_fac_ret_iva * v_ratio, 2);
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER zzz_pagos_factura_calc_ret
BEFORE INSERT OR UPDATE OF factura_id, monto, moneda, tipo_cambio, monto_aplicado_factura,
  ret_isr, ret_iva, estado_rep, facturapi_rep_id, deleted_at
ON public.pagos_factura FOR EACH ROW EXECUTE FUNCTION public.calc_pago_retenciones();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.finalizar_evento_facturapi_webhook(
  p_evento_id uuid, p_token uuid, p_resultado text, p_motivo text DEFAULT NULL,
  p_tabla text DEFAULT NULL, p_documento_id uuid DEFAULT NULL, p_version timestamptz DEFAULT NULL,
  p_claim text DEFAULT NULL, p_patch jsonb DEFAULT NULL, p_accion text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_evento public.facturapi_webhook_eventos%ROWTYPE;
  v_momento timestamptz;
  v_estado text := p_resultado;
  v_motivo text := p_motivo;
  v_claim_actual text;
  v_version_actual timestamptz;
  v_patch jsonb := p_patch;
  v_permitidos text[];
  v_set text;
BEGIN
  SELECT * INTO v_evento FROM public.facturapi_webhook_eventos
   WHERE id = p_evento_id FOR UPDATE;
  v_momento := clock_timestamp();
  IF NOT FOUND OR v_evento.procesamiento_estado <> 'procesando'
    OR v_evento.procesamiento_token IS DISTINCT FROM p_token
    OR v_evento.procesamiento_disponible_en <= v_momento THEN
    RETURN jsonb_build_object('estado', 'reserva_perdida');
  END IF;

  IF p_resultado = 'aplicar' THEN
    IF p_tabla = 'facturas' THEN
      SELECT facturapi_id, updated_at INTO v_claim_actual, v_version_actual FROM public.facturas
       WHERE id = p_documento_id AND organization_id = v_evento.organization_id AND deleted_at IS NULL FOR UPDATE;
      v_permitidos := ARRAY['estado', 'cancellation_status', 'cancelado_en', 'cancelacion_solicitada_en',
        'cancelacion_vence_en', 'uuid_fiscal', 'uso_cfdi', 'enviada_cliente_at', 'facturapi_id',
        'facturapi_claim_at', 'facturapi_pendiente_id', 'facturapi_pendiente_at'];
    ELSIF p_tabla = 'pagos_factura' THEN
      SELECT facturapi_rep_id, updated_at INTO v_claim_actual, v_version_actual FROM public.pagos_factura
       WHERE id = p_documento_id AND organization_id = v_evento.organization_id AND deleted_at IS NULL FOR UPDATE;
      v_permitidos := ARRAY['uuid_rep', 'estado_rep', 'rep_cancelado_en', 'rep_cancellation_status',
        'timbrado_rep_en', 'facturapi_rep_id', 'facturapi_rep_claim_at', 'facturapi_rep_pendiente_id', 'facturapi_rep_pendiente_at'];
    ELSE
      RAISE EXCEPTION 'Destino de webhook inválido' USING ERRCODE = '22023';
    END IF;

    IF v_version_actual IS NULL OR v_claim_actual IS DISTINCT FROM p_claim THEN
      v_estado := 'ignorado';
      v_motivo := 'claim_cambiado';
    ELSIF v_version_actual IS DISTINCT FROM p_version THEN
      v_estado := 'reintentable';
      v_motivo := 'destino_actualizado';
    ELSE
      IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' OR p_accion IS NULL OR EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_patch) AS campo WHERE campo <> ALL (v_permitidos)
      ) THEN
        RAISE EXCEPTION 'Patch de webhook inválido' USING ERRCODE = '22023';
      END IF;

      IF p_tabla = 'facturas' AND v_patch->>'cancellation_status' = 'accepted' THEN
        PERFORM public.cerrar_cancelacion_factura_facturapi(p_documento_id);
        v_patch := v_patch - ARRAY['estado', 'cancellation_status', 'cancelado_en', 'cancelacion_solicitada_en', 'cancelacion_vence_en'];
      END IF;
      -- Actualiza únicamente las columnas presentes en el patch validado.
      SELECT string_agg(format('%1$I = (jsonb_populate_record(NULL::public.%2$I, $1)).%1$I', campo, p_tabla), ', ')
        INTO v_set FROM jsonb_object_keys(v_patch) AS campo;
      IF v_set IS NOT NULL THEN
        EXECUTE format('UPDATE public.%I SET %s WHERE id = $2', p_tabla, v_set) USING v_patch, p_documento_id;
      END IF;

      INSERT INTO public.bitacora_actividad (organization_id, usuario_id, usuario_email, modulo, accion, entidad_id, entidad_nombre, detalles)
      VALUES (v_evento.organization_id, '00000000-0000-0000-0000-000000000000', 'system@edge', 'facturacion',
        p_accion, p_documento_id, '', jsonb_build_object('event_type', v_evento.event_type, 'event_id', v_evento.event_id, 'patch', p_patch));
      v_estado := 'procesado';
    END IF;
  ELSIF p_resultado = 'conciliado_isr' THEN
    IF p_tabla IS DISTINCT FROM 'facturas' OR v_evento.event_type <> 'invoice.status_updated'
       OR NOT EXISTS (
         SELECT 1 FROM public.facturas f
         WHERE f.id = p_documento_id AND f.organization_id = v_evento.organization_id
           AND f.deleted_at IS NULL AND f.uuid_fiscal IS NOT NULL
           AND f.facturapi_id = v_evento.payload#>>'{data,object,id}'
           AND f.snapshot_emision->>'intento_timbrado_isr' = p_claim
       ) THEN
      v_estado := 'reintentable';
      v_motivo := 'timbrado_isr_pendiente';
    ELSE
      v_estado := 'procesado';
      v_motivo := 'timbrado_isr_conciliado';
      INSERT INTO public.bitacora_actividad (organization_id, usuario_id, usuario_email, modulo, accion, entidad_id, entidad_nombre, detalles)
      VALUES (v_evento.organization_id, '00000000-0000-0000-0000-000000000000', 'system@edge', 'facturacion',
        'facturapi_webhook_isr_conciliado', p_documento_id, '',
        jsonb_build_object('event_type', v_evento.event_type, 'event_id', v_evento.event_id));
    END IF;
  ELSIF p_resultado = 'conciliado_rep_isr' THEN
    IF p_tabla IS DISTINCT FROM 'pagos_factura' OR v_evento.event_type NOT IN ('receipt.status_updated','invoice.status_updated')
      OR NOT public._isr_rep_confirmado_webhook(p_documento_id,v_evento.organization_id,p_claim,
        v_evento.payload#>>'{data,object,id}',v_evento.payload->>'ambiente_firma') THEN
      v_estado := 'reintentable';
      v_motivo := 'timbrado_isr_pendiente';
    ELSE
      v_estado := 'procesado';
      v_motivo := 'timbrado_rep_isr_conciliado';
    END IF;
  ELSIF p_resultado IS NULL OR p_resultado NOT IN ('ignorado', 'reintentable') THEN
    RAISE EXCEPTION 'Resultado de webhook inválido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.facturapi_webhook_eventos SET procesamiento_estado = v_estado, procesamiento_token = NULL,
    procesamiento_motivo = v_motivo,
    procesamiento_disponible_en = CASE WHEN v_estado = 'reintentable'
      THEN v_momento + make_interval(secs => 5 * (1 << least(v_evento.procesamiento_intentos, 8))) END,
    procesamiento_finalizado_en = CASE WHEN v_estado <> 'reintentable' THEN v_momento END
   WHERE id = v_evento.id;
  RETURN jsonb_build_object('estado', v_estado, 'motivo', v_motivo, 'tabla', p_tabla);
END;
$fn$;

REVOKE ALL ON FUNCTION public.finalizar_evento_facturapi_webhook(uuid, uuid, text, text, text, uuid, timestamptz, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_evento_facturapi_webhook(uuid, uuid, text, text, text, uuid, timestamptz, text, jsonb, text) TO service_role;
