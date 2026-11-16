-- Persistent, organization-bound issuance attempts for evaluated invoices.
CREATE TABLE public.intentos_timbrado_isr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid NOT NULL REFERENCES public.facturas(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  ambiente text NOT NULL CHECK (ambiente IN ('sandbox','live')),
  prevalidacion jsonb NOT NULL CHECK (jsonb_typeof(prevalidacion) = 'object'),
  estado text NOT NULL DEFAULT 'reservado' CHECK (estado IN ('reservado','pendiente','conciliacion','confirmado','rechazado')),
  facturapi_id text,
  uuid_fiscal text,
  resultado jsonb,
  creado_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actualizado_at timestamptz
);
CREATE UNIQUE INDEX intentos_timbrado_isr_factura_uniq ON public.intentos_timbrado_isr(factura_id) WHERE estado <> 'rechazado';
CREATE UNIQUE INDEX intentos_timbrado_isr_remoto_uniq ON public.intentos_timbrado_isr(organization_id,ambiente,facturapi_id)
  WHERE facturapi_id IS NOT NULL;
ALTER TABLE public.intentos_timbrado_isr ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intentos_timbrado_isr FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.intentos_timbrado_isr FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY intento_isr_scope ON public.intentos_timbrado_isr AS RESTRICTIVE TO authenticated
  USING (public.rls_tenant_scope_ok(organization_id)) WITH CHECK (public.rls_tenant_scope_ok(organization_id));

-- Called after scope/role authorization. Returns the expected PAC identity
-- and document totals for the emission reservation without revealing credentials.
CREATE OR REPLACE FUNCTION public._isr_revisar_factura_emision(p_factura_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_factura public.facturas;
  v_perfil public.perfiles_fiscales_emisor;
  v_cred public.facturapi_credenciales;
  v_cliente public.clientes;
  v_documento jsonb;
  v_lineas jsonb;
  v_ahora jsonb;
  v_evaluacion jsonb;
  v_bloque jsonb;
  v_totales record;
BEGIN
  SELECT * INTO STRICT v_factura FROM public.facturas WHERE id = p_factura_id AND deleted_at IS NULL;
  IF v_factura.evaluacion_fiscal IS NULL THEN
    IF public._isr_documento_habilitado(v_factura.organization_id) THEN
      RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;

  v_documento := v_factura.evaluacion_fiscal;
  v_bloque := v_documento#>'{bloques,0}';
  SELECT * INTO v_cred FROM public.facturapi_credenciales WHERE organization_id = v_factura.organization_id;
  SELECT * INTO v_perfil FROM public.perfiles_fiscales_emisor WHERE organization_id = v_factura.organization_id
    AND ambiente = v_cred.ambiente ORDER BY version DESC LIMIT 1;
  SELECT * INTO v_cliente FROM public.clientes WHERE organization_id = v_factura.organization_id
    AND id = v_factura.cliente_id AND deleted_at IS NULL;
  IF NOT public._isr_documento_habilitado(v_factura.organization_id)
    OR v_factura.estado <> 'Borrador' OR v_factura.facturapi_id IS NOT NULL OR v_factura.uuid_fiscal IS NOT NULL
    OR v_factura.snapshot_emision IS NOT NULL OR v_factura.facturapi_pendiente_id IS NOT NULL
    OR v_documento->>'estado' IS DISTINCT FROM 'confirmado'
    OR v_documento->>'organization_id' IS DISTINCT FROM v_factura.organization_id::text
    OR v_documento->>'cliente_id' IS DISTINCT FROM v_factura.cliente_id::text
    OR v_documento->>'ambiente' IS DISTINCT FROM v_cred.ambiente
    OR v_documento->>'perfil_id' IS DISTINCT FROM v_perfil.id::text
    OR v_documento->>'perfil_version' IS DISTINCT FROM v_perfil.version::text
    OR v_cred.facturapi_org_id IS NULL OR v_cred.facturapi_org_id IS DISTINCT FROM v_perfil.facturapi_org_id
    OR v_bloque->>'moneda' IS DISTINCT FROM v_factura.moneda::text OR v_cliente.id IS NULL
    OR v_documento#>>'{receptor,rfc}' IS DISTINCT FROM upper(btrim(v_cliente.rfc))
    OR v_documento#>>'{receptor,rfc}' IS DISTINCT FROM upper(btrim(v_factura.rfc_cliente))
    OR (v_documento->'receptor' ? 'regimen_fiscal'
      AND v_documento#>>'{receptor,regimen_fiscal}' IS DISTINCT FROM v_cliente.regimen_fiscal) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', c.id, 'cantidad', c.cantidad, 'precio_unitario', c.precio_unitario,
    'moneda', c.moneda, 'tipo_iva', c.tipo_iva, 'tasa_iva_aplicada', c.tasa_iva_aplicada, 'descripcion', c.descripcion,
    'clave_sat', c.clave_sat, 'clave_unidad', c.clave_unidad, 'embarque_id', c.embarque_id) ORDER BY c.id)
  INTO v_lineas FROM public.conceptos_factura c WHERE c.factura_id = p_factura_id AND c.deleted_at IS NULL;
  IF v_lineas IS NULL THEN RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514'; END IF;
  v_ahora := public._evaluar_documento_isr_resico(v_factura.organization_id, v_factura.cliente_id, v_lineas);
  v_evaluacion := v_ahora->'snapshot';
  IF v_evaluacion->>'estado' IS DISTINCT FROM 'confirmado'
    OR (v_evaluacion->>'regla_version',v_evaluacion->>'precision_version')
      IS DISTINCT FROM (v_documento->>'regla_version', v_documento->>'precision_version')
    OR v_ahora#>'{conceptos,0,evaluacion_fiscal,emisor}' IS DISTINCT FROM v_documento->'emisor'
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_ahora->'conceptos') l JOIN public.conceptos_factura c ON c.id = (l->>'id')::uuid
      WHERE c.organization_id <> v_factura.organization_id OR c.moneda <> v_factura.moneda
        OR c.tasa_ret_isr IS DISTINCT FROM (l->>'tasa_ret_isr')::numeric
        OR c.monto_ret_isr IS DISTINCT FROM (l->>'monto_ret_isr')::numeric
        OR ((c.origen_fiscal->'evaluacion') - ARRAY['emisor','receptor'])
           IS DISTINCT FROM ((l->'evaluacion_fiscal') - ARRAY['emisor','receptor'])
    ) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_totales FROM public._totales_factura_resico_agrupados(p_factura_id);
  IF (v_factura.subtotal, v_factura.iva, v_factura.ret_isr, v_factura.ret_iva, v_factura.total)
    IS DISTINCT FROM ((v_bloque->>'subtotal')::numeric, (v_bloque->>'iva')::numeric,
      (v_bloque->>'ret_isr')::numeric, (v_bloque->>'ret_iva')::numeric, (v_bloque->>'total')::numeric)
    OR (v_totales.subtotal, v_totales.iva, v_totales.ret_isr, v_totales.ret_iva)
      IS DISTINCT FROM (v_factura.subtotal, v_factura.iva, v_factura.ret_isr, v_factura.ret_iva) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object('factura_id', p_factura_id, 'organization_id', v_factura.organization_id,
    'factura_actualizada_at', v_factura.updated_at,
    'datos_factura', jsonb_build_object('fecha_emision', v_factura.fecha_emision, 'serie', v_factura.serie,
      'uso_cfdi', v_factura.uso_cfdi, 'metodo_pago', v_factura.metodo_pago, 'forma_pago', v_factura.forma_pago,
      'tipo_cambio', v_factura.tipo_cambio, 'embarque_id', v_factura.embarque_id, 'proforma_id', v_factura.proforma_id),
    'ambiente', v_cred.ambiente, 'credenciales_actualizadas_at', v_cred.updated_at,
    'perfil_id', v_perfil.id, 'perfil_version', v_perfil.version,
    'conceptos_fingerprint', v_documento->'conceptos_fingerprint', 'lineas_fingerprint', md5(v_lineas::text),
    'totales', v_bloque,
    'emisor', jsonb_build_object('facturapi_org_id', v_perfil.facturapi_org_id,
      'rfc', v_perfil.rfc, 'regimen_fiscal', v_perfil.regimen_fiscal, 'codigo_postal', v_perfil.codigo_postal,
      'razon_social', v_perfil.razon_social),
    'receptor', jsonb_build_object('rfc', upper(btrim(v_cliente.rfc)), 'regimen_fiscal', v_cliente.regimen_fiscal,
      'nombre', v_cliente.nombre, 'codigo_postal', v_cliente.codigo_postal, 'direccion', v_cliente.direccion,
      'ciudad', v_cliente.ciudad, 'estado', v_cliente.estado));
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_validar_estado_timbrado_factura(p_old public.facturas, p_new public.facturas)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_intento public.intentos_timbrado_isr;
  v_campos text[] := ARRAY['facturapi_id','facturapi_claim_at','facturapi_pendiente_id','facturapi_pendiente_at','updated_at'];
  v_claim text := COALESCE(p_old.facturapi_id, p_new.facturapi_id);
BEGIN
  SELECT * INTO v_intento FROM public.intentos_timbrado_isr i WHERE i.factura_id = p_old.id
    AND i.organization_id = p_old.organization_id AND 'PENDING:' || i.id::text = v_claim;
  IF NOT FOUND OR p_old.uuid_fiscal IS NOT NULL THEN RETURN false; END IF;

  IF v_intento.estado IN ('reservado','pendiente','conciliacion') THEN
    RETURN p_new.estado = 'Borrador' AND p_new.facturapi_id = v_claim
      AND p_new.facturapi_claim_at = v_intento.creado_at
      AND p_new.facturapi_pendiente_id IS NOT DISTINCT FROM v_intento.facturapi_id
      AND p_new.facturapi_pendiente_at IS NOT DISTINCT FROM
        CASE WHEN v_intento.estado = 'reservado' THEN NULL ELSE v_intento.actualizado_at END
      AND (to_jsonb(p_new) - v_campos) IS NOT DISTINCT FROM (to_jsonb(p_old) - v_campos);
  END IF;

  IF v_intento.estado = 'rechazado' THEN
    RETURN p_old.facturapi_id = v_claim AND p_new.estado = 'Borrador'
      AND p_new.facturapi_id IS NULL AND p_new.facturapi_claim_at IS NULL
      AND p_new.facturapi_pendiente_id IS NULL AND p_new.facturapi_pendiente_at IS NULL
      AND (to_jsonb(p_new) - v_campos) IS NOT DISTINCT FROM (to_jsonb(p_old) - v_campos);
  END IF;

  v_campos := v_campos || ARRAY['estado','snapshot_emision','uuid_fiscal','folio_fiscal','serie','numero','ambiente',
    'uso_cfdi','timbrado_en','timbrado_por','factura_pdf_url','factura_xml_url','factura_xml_backup_path'];
  RETURN v_intento.estado = 'confirmado' AND p_old.facturapi_id = v_claim AND p_new.estado = 'Emitida'
    AND p_new.facturapi_id = v_intento.facturapi_id AND p_new.uuid_fiscal = v_intento.uuid_fiscal
    AND p_new.facturapi_claim_at IS NULL AND p_new.facturapi_pendiente_id IS NULL AND p_new.facturapi_pendiente_at IS NULL
    AND p_new.ambiente::text = v_intento.ambiente AND p_new.timbrado_por = v_intento.actor_id
    AND p_new.snapshot_emision IS NOT NULL
    AND (to_jsonb(p_new) - v_campos) IS NOT DISTINCT FROM (to_jsonb(p_old) - v_campos);
END;
$$;

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

CREATE OR REPLACE FUNCTION public._isr_guard_concepto_factura_convertida() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_propietario boolean := current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID));
  v_factura public.facturas;
  v_campos_editables text[] := ARRAY['updated_at','clave_sat','clave_unidad','deleted_at','deleted_by'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.origen_fiscal IS NOT NULL THEN RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  SELECT f.* INTO v_factura FROM public.facturas f
    WHERE f.id = NEW.factura_id AND f.organization_id = NEW.organization_id;
  IF v_factura.evaluacion_fiscal IS NULL AND NEW.origen_fiscal IS NULL
    AND (TG_OP = 'INSERT' OR OLD.origen_fiscal IS NULL) THEN RETURN NEW; END IF;
  IF v_factura.facturapi_id LIKE 'PENDING:%' THEN
    RAISE EXCEPTION 'LC_ISR_INTENTO_ACTIVO' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_propietario OR v_factura.evaluacion_fiscal IS NULL OR v_factura.deleted_at IS NOT NULL
      OR NEW.deleted_at IS NOT NULL OR NEW.proforma_id_origen IS DISTINCT FROM v_factura.proforma_id
      OR NEW.embarque_id IS DISTINCT FROM v_factura.embarque_id OR NEW.moneda IS DISTINCT FROM v_factura.moneda
      OR NEW.tasa_ret_iva <> 0 OR jsonb_typeof(NEW.origen_fiscal->'lineas') IS DISTINCT FROM 'array'
      OR jsonb_array_length(NEW.origen_fiscal->'lineas') = 0
      OR (NEW.origen_fiscal#>>'{evaluacion,base_exacta}')::numeric IS DISTINCT FROM NEW.cantidad * NEW.precio_unitario
      OR NEW.tasa_ret_isr IS DISTINCT FROM (NEW.origen_fiscal#>>'{evaluacion,tasa_ret_isr}')::numeric
      OR NEW.monto_ret_isr IS DISTINCT FROM (NEW.origen_fiscal#>>'{evaluacion,monto_ret_isr}')::numeric THEN
      RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.origen_fiscal IS NULL AND NEW.origen_fiscal IS NOT NULL AND v_propietario
    AND v_factura.origen = 'manual' AND v_factura.deleted_at IS NULL AND v_factura.evaluacion_fiscal IS NOT NULL
    AND OLD.deleted_at IS NULL AND (NEW.origen_fiscal->>'captura_id')::uuid = OLD.id
    AND NEW.tasa_ret_isr = (NEW.origen_fiscal#>>'{evaluacion,tasa_ret_isr}')::numeric
    AND NEW.monto_ret_isr = (NEW.origen_fiscal#>>'{evaluacion,monto_ret_isr}')::numeric
    AND NEW.cantidad * NEW.precio_unitario = (NEW.origen_fiscal#>>'{evaluacion,base_exacta}')::numeric
    AND NEW.total = round(NEW.cantidad * NEW.precio_unitario, 2)
    AND (to_jsonb(NEW) - ARRAY['updated_at','total','tasa_ret_isr','monto_ret_isr','origen_fiscal'])
      IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at','total','tasa_ret_isr','monto_ret_isr','origen_fiscal']) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - v_campos_editables) IS DISTINCT FROM (to_jsonb(OLD) - v_campos_editables)
    OR ((NEW.deleted_at, NEW.deleted_by) IS DISTINCT FROM (OLD.deleted_at, OLD.deleted_by)
      AND (NOT v_propietario OR OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL
        OR NEW.deleted_by IS DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.congelar_factura_al_emitir() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_conceptos jsonb;
  v_cliente jsonb;
  v_org jsonb;
  v_tasa_iva numeric;
  v_prevalidacion jsonb;
BEGIN
  -- Sólo congelar al transicionar a Emitida/Pagada y si aún no hay snapshot
  IF NEW.estado NOT IN ('Emitida', 'Pagada') THEN
    RETURN NEW;
  END IF;
  -- QA-R2 D-05: no emitir una factura sin conceptos vivos. Sólo aplica en la
  -- transición normal de captura (Borrador/Por timbrar -> Emitida); en INSERT
  -- los conceptos aún no pueden existir por la FK y otras transiciones
  -- (reapertura de canceladas) tienen su propio candado.
  IF TG_OP = 'UPDATE'
     AND NEW.estado = 'Emitida'
     AND OLD.estado IN ('Borrador', 'Por timbrar')
     AND NOT EXISTS (
       SELECT 1 FROM public.conceptos_factura cf
       WHERE cf.factura_id = NEW.id AND cf.deleted_at IS NULL
     ) THEN
    RAISE EXCEPTION 'LC_FACTURA_SIN_CONCEPTOS: no se puede emitir una factura sin conceptos'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.snapshot_emision IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(cf)), '[]'::jsonb)
    INTO v_conceptos
    FROM public.conceptos_factura cf
   WHERE cf.factura_id = NEW.id
     AND cf.deleted_at IS NULL;
  SELECT jsonb_build_object(
           'id', c.id,
           'nombre', c.nombre,
           'rfc', c.rfc,
           'direccion', c.direccion,
           'ciudad', c.ciudad,
           'estado', c.estado,
           'cp', c.cp
         )
    INTO v_cliente
    FROM public.clientes c
   WHERE c.id = NEW.cliente_id;
  SELECT jsonb_build_object(
           'id', o.id,
           'nombre', o.nombre,
           'rfc', o.rfc
         )
    INTO v_org
    FROM public.organizations o
   WHERE o.id = NEW.organization_id;
  IF NEW.evaluacion_fiscal IS NOT NULL AND TG_OP = 'UPDATE' THEN
    SELECT i.prevalidacion INTO v_prevalidacion FROM public.intentos_timbrado_isr i
    WHERE i.factura_id = NEW.id AND i.organization_id = NEW.organization_id
      AND i.estado = 'confirmado' AND 'PENDING:' || i.id::text = OLD.facturapi_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'LC_ISR_TIMBRADO_PENDIENTE' USING ERRCODE = '23514'; END IF;
    v_cliente := (v_prevalidacion->'receptor') || jsonb_build_object(
      'id', NEW.cliente_id, 'cp', v_prevalidacion#>'{receptor,codigo_postal}');
    v_org := (v_prevalidacion->'emisor') || jsonb_build_object(
      'id', NEW.organization_id, 'nombre', v_prevalidacion#>'{emisor,razon_social}');
  END IF;
  v_tasa_iva := CASE
    WHEN COALESCE(NEW.subtotal, 0) = 0 THEN 0
    ELSE round((NEW.iva / NEW.subtotal)::numeric, 4)
  END;
  NEW.snapshot_emision := jsonb_build_object(
    'version', 1,
    'congelado_at', now(),
    'estado_al_congelar', NEW.estado,
    'numero', NEW.numero,
    'moneda', NEW.moneda,
    'subtotal', NEW.subtotal,
    'iva', NEW.iva,
    'total', NEW.total,
    'tasa_iva', v_tasa_iva,
    'tipo_cambio', NEW.tipo_cambio,
    'fecha_emision', NEW.fecha_emision,
    'fecha_vencimiento', NEW.fecha_vencimiento,
    'expediente', NEW.expediente,
    'referencia_bl', NEW.referencia_bl,
    'cliente_snapshot', v_cliente,
    'organizacion_snapshot', v_org,
    'conceptos', v_conceptos
  );
  IF v_prevalidacion IS NOT NULL THEN
    NEW.snapshot_emision := NEW.snapshot_emision || jsonb_build_object(
      'ret_isr', NEW.ret_isr, 'ret_iva', NEW.ret_iva, 'evaluacion_fiscal', NEW.evaluacion_fiscal);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_clientes_propaga_nombre() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.nombre IS NOT DISTINCT FROM OLD.nombre THEN
    RETURN NEW;
  END IF;
  UPDATE public.cotizaciones
     SET cliente_nombre = NEW.nombre
   WHERE cliente_id = NEW.id
     AND cliente_nombre IS DISTINCT FROM NEW.nombre
     AND deleted_at IS NULL;
  UPDATE public.embarques
     SET cliente_nombre = NEW.nombre
   WHERE cliente_id = NEW.id
     AND cliente_nombre IS DISTINCT FROM NEW.nombre
     AND estado::text <> 'Cerrado'
     AND deleted_at IS NULL;
  UPDATE public.facturas
     SET cliente_nombre = NEW.nombre
   WHERE cliente_id = NEW.id
     AND estado = 'Borrador'
     AND (evaluacion_fiscal IS NULL OR facturapi_id IS NULL)
     AND cliente_nombre IS DISTINCT FROM NEW.nombre
     AND deleted_at IS NULL;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reservar_timbrado_isr(
  p_factura_id uuid, p_actor uuid, p_prevalidacion jsonb, p_emisor_observado jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_factura public.facturas;
  v_intento public.intentos_timbrado_isr;
  v_esperado jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_factura FROM public.facturas WHERE id = p_factura_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR p_actor IS NULL OR NOT public.has_any_role_in_org_exact(p_actor,
    ARRAY['admin','admin_org','contador']::public.app_role[], v_factura.organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF v_factura.facturapi_id IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_INTENTO_ACTIVO' USING ERRCODE = '23505';
  END IF;

  -- Re-check the previously observed profile and the complete document while
  -- coordinating concurrent emissions via the invoice row lock.
  v_esperado := public._isr_revisar_factura_emision(p_factura_id);
  IF v_esperado IS NULL OR v_esperado IS DISTINCT FROM p_prevalidacion
    OR v_esperado->'emisor' IS DISTINCT FROM p_emisor_observado THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.intentos_timbrado_isr(factura_id, organization_id, actor_id, ambiente, prevalidacion)
  VALUES(p_factura_id, v_factura.organization_id, p_actor, v_esperado->>'ambiente', v_esperado)
  RETURNING * INTO v_intento;

  UPDATE public.facturas SET facturapi_id = 'PENDING:' || v_intento.id::text,
    facturapi_claim_at = v_intento.creado_at WHERE id = p_factura_id;
  RETURN jsonb_build_object('claim', 'PENDING:' || v_intento.id::text, 'reservado_at', v_intento.creado_at);
END;
$$;
REVOKE ALL ON FUNCTION public.reservar_timbrado_isr(uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_timbrado_isr(uuid,uuid,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_resultado_timbrado_isr(
  p_factura_id uuid, p_claim text, p_estado text, p_resultado jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_factura public.facturas;
  v_intento public.intentos_timbrado_isr;
  v_estado text := p_estado;
  v_datos jsonb;
  v_id text := NULLIF(p_resultado->>'facturapi_id', '');
  v_uuid text := upper(NULLIF(p_resultado->>'uuid', ''));
  v_xml jsonb := p_resultado->'xml';
  v_ruta text;
  v_base_url text;
  v_folio bigint;
  v_serie text;
  v_uso text;
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

  SELECT * INTO STRICT v_factura FROM public.facturas WHERE id = p_factura_id AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO v_intento FROM public.intentos_timbrado_isr i WHERE i.factura_id = p_factura_id
    AND i.organization_id = v_factura.organization_id AND 'PENDING:' || i.id::text = p_claim FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514'; END IF;
  IF v_intento.estado = 'confirmado' AND v_id = v_intento.facturapi_id AND v_uuid = v_intento.uuid_fiscal THEN
    RETURN jsonb_build_object('estado', v_intento.estado, 'facturapi_id', v_intento.facturapi_id, 'uuid', v_intento.uuid_fiscal);
  END IF;
  IF v_factura.facturapi_id IS DISTINCT FROM p_claim OR v_intento.estado IN ('rechazado','confirmado')
    OR (v_intento.facturapi_id IS NOT NULL AND v_id IS NOT NULL AND v_intento.facturapi_id <> v_id)
    OR (v_intento.uuid_fiscal IS NOT NULL AND v_uuid IS NOT NULL AND v_intento.uuid_fiscal <> v_uuid) THEN
    RAISE EXCEPTION 'LC_ISR_INTENTO_NO_VIGENTE' USING ERRCODE = '23514';
  END IF;

  IF p_estado = 'rechazado' AND (
    v_intento.estado <> 'reservado' OR v_id IS NOT NULL OR v_intento.facturapi_id IS NOT NULL
    OR COALESCE(p_resultado->>'http_status','') NOT IN ('400','401','403','422','429')
  ) THEN
    RAISE EXCEPTION 'LC_ISR_RECHAZO_INCIERTO' USING ERRCODE = '23514';
  END IF;

  IF p_estado = 'confirmado' THEN
    v_ruta := v_factura.organization_id::text || '/emitidas/' || v_uuid || '.xml';
    IF v_id IS NULL OR COALESCE(v_uuid,'') !~ '^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$'
      OR p_resultado->>'external_id' IS DISTINCT FROM p_claim
      OR p_resultado->>'ambiente' IS DISTINCT FROM v_intento.ambiente
      OR p_resultado->>'facturapi_org_id' IS DISTINCT FROM v_intento.prevalidacion#>>'{emisor,facturapi_org_id}'
      OR p_resultado->>'moneda' IS DISTINCT FROM v_intento.prevalidacion#>>'{totales,moneda}'
      OR p_resultado->'total' IS DISTINCT FROM v_intento.prevalidacion#>'{totales,total}'
      OR v_xml->>'uuid' IS DISTINCT FROM v_uuid
      OR v_xml->>'emisor_rfc' IS DISTINCT FROM v_intento.prevalidacion#>>'{emisor,rfc}'
      OR v_xml->>'emisor_regimen' IS DISTINCT FROM v_intento.prevalidacion#>>'{emisor,regimen_fiscal}'
      OR v_xml->>'receptor_rfc' IS DISTINCT FROM v_intento.prevalidacion#>>'{receptor,rfc}'
      OR v_xml->>'receptor_regimen' IS DISTINCT FROM v_intento.prevalidacion#>>'{receptor,regimen_fiscal}'
      OR v_xml->'totales' IS DISTINCT FROM v_intento.prevalidacion->'totales'
      OR v_xml->>'ruta' IS DISTINCT FROM v_ruta OR COALESCE(v_xml->>'sha256','') !~ '^[a-f0-9]{64}$'
      OR COALESCE(p_resultado->>'folio','') !~ '^[1-9][0-9]{0,14}$'
      OR v_xml->>'uso_cfdi' IS NULL OR v_xml->>'uso_cfdi' !~ '^[A-Z]{1,2}[0-9]{2}$'
      OR length(COALESCE(p_resultado->>'serie','')) > 25 THEN
      v_estado := 'conciliacion';
    END IF;
  END IF;
  IF v_intento.estado = 'conciliacion' AND v_estado = 'pendiente' THEN v_estado := 'conciliacion'; END IF;

  v_datos := jsonb_strip_nulls(jsonb_build_object(
    'http_status', left(p_resultado->>'http_status', 3),
    'motivo', left(p_resultado->>'motivo', 90),
    'total_respuesta', left(p_resultado->>'total', 40),
    'sha256_xml', left(v_xml->>'sha256', 64)));
  UPDATE public.intentos_timbrado_isr
  SET estado = v_estado, facturapi_id = COALESCE(v_id, facturapi_id),
      uuid_fiscal = CASE WHEN COALESCE(v_uuid,'') ~ '^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$' THEN v_uuid ELSE uuid_fiscal END,
      resultado = v_datos, actualizado_at = v_hora
  WHERE id = v_intento.id RETURNING * INTO v_intento;

  IF v_estado = 'confirmado' THEN
    v_folio := (p_resultado->>'folio')::bigint;
    v_serie := COALESCE(p_resultado->>'serie', '');
    v_uso := v_xml->>'uso_cfdi';
    v_base_url := 'https://www.facturapi.io/v2/invoices/' || v_id;
    UPDATE public.facturas SET estado = 'Emitida', numero = v_serie || v_folio::text, folio_fiscal = v_folio,
      serie = v_serie, uso_cfdi = v_uso, uuid_fiscal = v_uuid, facturapi_id = v_id, facturapi_claim_at = NULL,
      facturapi_pendiente_id = NULL, facturapi_pendiente_at = NULL, ambiente = v_intento.ambiente::public.ambiente_facturapi,
      factura_pdf_url = v_base_url || '/pdf', factura_xml_url = v_base_url || '/xml', factura_xml_backup_path = v_ruta,
      timbrado_en = v_hora, timbrado_por = v_intento.actor_id
    WHERE id = p_factura_id;
  ELSIF v_estado = 'rechazado' THEN
    UPDATE public.facturas SET facturapi_id = NULL, facturapi_claim_at = NULL,
      facturapi_pendiente_id = NULL, facturapi_pendiente_at = NULL WHERE id = p_factura_id;
  ELSE
    UPDATE public.facturas SET facturapi_pendiente_id = v_intento.facturapi_id,
      facturapi_pendiente_at = v_hora WHERE id = p_factura_id;
  END IF;
  RETURN jsonb_build_object('estado', v_estado, 'facturapi_id', v_intento.facturapi_id, 'uuid', v_intento.uuid_fiscal);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_resultado_timbrado_isr(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_resultado_timbrado_isr(uuid,text,text,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public._isr_validar_estado_timbrado_factura(public.facturas,public.facturas)
  FROM PUBLIC,anon,authenticated,service_role;
