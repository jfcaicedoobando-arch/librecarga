CREATE OR REPLACE FUNCTION public._copiar_conceptos_factura_reemplazo(
  p_nueva_id uuid, p_original_id uuid, p_caso_id uuid
) RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_new public.facturas;
  v_old public.facturas;
  v_cliente public.clientes;
  v_caso public.refacturaciones;
  v_lineas jsonb;
  v_calculo jsonb;
  v_snapshot jsonb;
  v_bloque jsonb;
  v_origen jsonb;
  v_ret_iva numeric;
  v_habilitado boolean;
BEGIN
  SELECT * INTO STRICT v_new FROM public.facturas WHERE id=p_nueva_id AND deleted_at IS NULL;
  SELECT * INTO STRICT v_old FROM public.facturas WHERE id=p_original_id AND organization_id=v_new.organization_id
    AND deleted_at IS NULL FOR UPDATE;
  v_habilitado := public._isr_documento_habilitado(v_new.organization_id);
  IF NOT v_habilitado AND v_old.evaluacion_fiscal IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE='23514';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'concepto_original_id',c.id,
    'cantidad',c.cantidad,'precio_unitario',c.precio_unitario,'moneda',c.moneda,
    'tipo_iva',c.tipo_iva,'tasa_iva_aplicada',c.tasa_iva_aplicada) ORDER BY c.id)
  INTO v_lineas FROM public.conceptos_factura c WHERE c.factura_id=p_original_id
    AND c.organization_id=v_new.organization_id AND c.deleted_at IS NULL;

  INSERT INTO public.conceptos_factura (id,factura_id,organization_id,
    descripcion,cantidad,precio_unitario,moneda,total,clave_sat,tipo_iva,tasa_iva_aplicada,
    tasa_ret_isr,tasa_ret_iva,monto_ret_isr,monto_ret_iva,clave_unidad,embarque_id,proforma_id_origen)
  SELECT (l->>'id')::uuid,p_nueva_id,v_new.organization_id,c.descripcion,c.cantidad,c.precio_unitario,c.moneda,c.total,
    c.clave_sat,c.tipo_iva,c.tasa_iva_aplicada,c.tasa_ret_isr,c.tasa_ret_iva,c.monto_ret_isr,c.monto_ret_iva,
    c.clave_unidad,c.embarque_id,c.proforma_id_origen
  FROM jsonb_array_elements(v_lineas) l JOIN public.conceptos_factura c ON c.id=(l->>'concepto_original_id')::uuid;
  IF NOT v_habilitado THEN RETURN; END IF;

  SELECT * INTO v_cliente FROM public.clientes WHERE id=v_new.cliente_id AND organization_id=v_new.organization_id
    AND deleted_at IS NULL FOR SHARE;
  IF v_cliente.id IS NULL OR v_old.uuid_fiscal IS NULL OR v_lineas IS NULL
    OR upper(btrim(v_cliente.rfc)) IS DISTINCT FROM upper(btrim(v_new.rfc_cliente))
    OR EXISTS (SELECT 1 FROM public.conceptos_factura c WHERE c.factura_id=p_nueva_id AND
      (c.moneda<>v_new.moneda OR c.tasa_ret_iva NOT BETWEEN 0 AND 1
        OR (c.tipo_iva IN ('no_objeto','exento','tasa_0') AND c.tasa_ret_iva<>0))) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE='23514';
  END IF;

  IF p_caso_id IS NOT NULL THEN
    SELECT * INTO STRICT v_caso FROM public.refacturaciones WHERE id=p_caso_id AND organization_id=v_new.organization_id
      AND factura_original_id=p_original_id AND factura_nueva_id=p_nueva_id AND cliente_destino_id=v_new.cliente_id;
  END IF;
  IF v_new.sustituye_a IS DISTINCT FROM (CASE WHEN COALESCE(v_caso.ruta_fiscal,'01')='01' THEN p_original_id END) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE='23514';
  END IF;
  IF v_new.sustituye_a IS NOT NULL AND upper(btrim(v_new.rfc_cliente)) IS DISTINCT FROM
    upper(btrim(COALESCE(v_old.snapshot_emision#>>'{cliente_snapshot,rfc}',v_old.rfc_cliente))) THEN
    RAISE EXCEPTION 'LC_ISR_SUSTITUCION_RECEPTOR' USING ERRCODE='23514';
  END IF;

  v_calculo := public._evaluar_documento_isr_resico(v_new.organization_id,v_new.cliente_id,v_lineas);
  v_snapshot := v_calculo->'snapshot';
  v_bloque := v_snapshot#>'{bloques,0}';
  SELECT t.ret_iva INTO v_ret_iva FROM public._totales_factura_resico_agrupados(p_nueva_id) t;
  IF v_snapshot->>'estado' IS DISTINCT FROM 'confirmado' OR (v_bloque->>'total')::numeric<=v_ret_iva THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE='23514';
  END IF;
  v_bloque := v_bloque || jsonb_build_object('ret_iva',v_ret_iva,'total',(v_bloque->>'total')::numeric-v_ret_iva);
  v_origen := jsonb_build_object('factura_id',p_original_id,'uuid',upper(v_old.uuid_fiscal),'caso_id',p_caso_id,
    'ruta',COALESCE(v_caso.ruta_fiscal,'01'),'ambiente',v_old.ambiente);
  v_snapshot := v_snapshot || jsonb_build_object('factura_id',p_nueva_id,'origen_reemplazo',v_origen,
    'bloques',jsonb_build_array(v_bloque),'emisor',v_calculo#>'{conceptos,0,evaluacion_fiscal,emisor}',
    'receptor',v_calculo#>'{conceptos,0,evaluacion_fiscal,receptor}' || jsonb_build_object('regimen_fiscal',v_cliente.regimen_fiscal));
  UPDATE public.facturas SET evaluacion_fiscal=v_snapshot WHERE id=p_nueva_id;
  UPDATE public.conceptos_factura c SET tasa_ret_isr=(l->>'tasa_ret_isr')::numeric,
    total=(l#>>'{evaluacion_fiscal,base}')::numeric,
    origen_fiscal=jsonb_build_object('factura_original_id',p_original_id,'concepto_original_id',o.id,
      'origen_previo',o.origen_fiscal,'evaluacion',l->'evaluacion_fiscal')
  FROM jsonb_array_elements(v_calculo->'conceptos') l
  JOIN public.conceptos_factura o ON o.id=(l->>'concepto_original_id')::uuid
  WHERE c.id=(l->>'id')::uuid AND c.factura_id=p_nueva_id AND c.organization_id=v_new.organization_id;

  IF NOT EXISTS (SELECT 1 FROM public.facturas f WHERE f.id=p_nueva_id AND
      (f.subtotal,f.iva,f.ret_isr,f.ret_iva,f.total)=((v_bloque->>'subtotal')::numeric,(v_bloque->>'iva')::numeric,
        (v_bloque->>'ret_isr')::numeric,(v_bloque->>'ret_iva')::numeric,(v_bloque->>'total')::numeric)) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE='23514';
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public._copiar_conceptos_factura_reemplazo(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
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
    AND OLD.deleted_at IS NULL AND ((OLD.origen = 'manual' AND OLD.proforma_id IS NULL AND OLD.embarque_id IS NULL
      AND OLD.sustituye_a IS NULL AND NOT NEW.evaluacion_fiscal ? 'origen_reemplazo') OR EXISTS (
      SELECT 1 FROM public.facturas original WHERE original.id=(NEW.evaluacion_fiscal#>>'{origen_reemplazo,factura_id}')::uuid
        AND original.organization_id=OLD.organization_id AND original.deleted_at IS NULL
        AND upper(original.uuid_fiscal)=NEW.evaluacion_fiscal#>>'{origen_reemplazo,uuid}'
        AND ((OLD.sustituye_a=original.id AND original.sustituida_por=OLD.id
            AND NEW.evaluacion_fiscal#>>'{origen_reemplazo,ruta}'='01') OR EXISTS (
          SELECT 1 FROM public.refacturaciones caso WHERE caso.id=(NEW.evaluacion_fiscal#>>'{origen_reemplazo,caso_id}')::uuid
            AND caso.organization_id=OLD.organization_id AND caso.factura_nueva_id=OLD.id
            AND caso.factura_original_id=original.id AND caso.cliente_destino_id=OLD.cliente_id
            AND caso.ruta_fiscal='02' AND OLD.sustituye_a IS NULL
            AND NEW.evaluacion_fiscal#>>'{origen_reemplazo,ruta}'='02'
        ))))
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
--> statement-breakpoint
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
    AND v_factura.deleted_at IS NULL AND v_factura.evaluacion_fiscal IS NOT NULL AND OLD.deleted_at IS NULL
    AND ((v_factura.origen='manual' AND (NEW.origen_fiscal->>'captura_id')::uuid=OLD.id
        AND NOT v_factura.evaluacion_fiscal ? 'origen_reemplazo') OR EXISTS (
      SELECT 1 FROM public.conceptos_factura original WHERE original.id=(NEW.origen_fiscal->>'concepto_original_id')::uuid
        AND original.factura_id=(v_factura.evaluacion_fiscal#>>'{origen_reemplazo,factura_id}')::uuid
        AND original.factura_id=(NEW.origen_fiscal->>'factura_original_id')::uuid
        AND original.organization_id=NEW.organization_id AND original.deleted_at IS NULL
        AND (original.cantidad,original.precio_unitario,original.moneda,original.tasa_ret_iva)
          IS NOT DISTINCT FROM (NEW.cantidad,NEW.precio_unitario,NEW.moneda,NEW.tasa_ret_iva)
        AND (NEW.origen_fiscal->'origen_previo') IS NOT DISTINCT FROM COALESCE(original.origen_fiscal,'null'::jsonb)
    ))
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.duplicar_factura_para_sustitucion(p_factura_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_old public.facturas%ROWTYPE;
  v_sust_estado text;
  v_new_id uuid := gen_random_uuid();
  v_new_numero text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_old FROM public.facturas
  WHERE id = p_factura_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = v_caller
      AND organization_id = v_old.organization_id
      AND role IN ('admin_org','admin','super_admin','contador','auxiliar_contable','tesorero')
  ) THEN
    RAISE EXCEPTION 'forbidden: requiere rol admin, contador o tesorero' USING ERRCODE = '42501';
  END IF;

  IF v_old.uuid_fiscal IS NULL THEN
    RAISE EXCEPTION 'factura_sin_uuid: sólo se puede sustituir un CFDI timbrado' USING ERRCODE = 'P0001';
  END IF;

  IF v_old.sustituida_por IS NOT NULL THEN
    SELECT estado::text INTO v_sust_estado FROM public.facturas WHERE id = v_old.sustituida_por;
    IF v_sust_estado IS NOT NULL AND v_sust_estado NOT IN ('Cancelada','Sustituida') THEN
      RAISE EXCEPTION 'factura_ya_sustituida' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_old.estado = 'Cancelada' THEN
    RAISE EXCEPTION 'factura_ya_cancelada' USING ERRCODE = 'P0001';
  END IF;

  v_new_numero := v_old.numero || '-R';
  WHILE EXISTS (SELECT 1 FROM public.facturas WHERE organization_id = v_old.organization_id AND numero = v_new_numero) LOOP
    v_new_numero := v_new_numero || '1';
  END LOOP;

  INSERT INTO public.facturas (
    id, organization_id, cliente_id, cliente_nombre, expediente,
    cotizacion_id, embarque_id, proforma_id,
    numero, serie, serie_id,
    fecha_emision, fecha_vencimiento, dias_credito,
    moneda, tipo_cambio, subtotal, iva, ret_isr, ret_iva, total,
    metodo_pago, forma_pago, uso_cfdi, rfc_cliente,
    notas, referencia_bl,
    snapshot_emision,
    estado, origen,
    sustituye_a
  ) VALUES (
    v_new_id, v_old.organization_id, v_old.cliente_id, v_old.cliente_nombre, v_old.expediente,
    v_old.cotizacion_id, v_old.embarque_id, v_old.proforma_id,
    v_new_numero, v_old.serie, v_old.serie_id,
    CURRENT_DATE, CURRENT_DATE + COALESCE(v_old.dias_credito, 0), v_old.dias_credito,
    v_old.moneda, v_old.tipo_cambio, v_old.subtotal, v_old.iva, v_old.ret_isr, v_old.ret_iva, v_old.total,
    v_old.metodo_pago, v_old.forma_pago, v_old.uso_cfdi, v_old.rfc_cliente,
    COALESCE(v_old.notas, '') || E'\n[Sustituye a ' || v_old.numero || ']',
    v_old.referencia_bl,
    NULL,
    'Borrador', v_old.origen,
    v_old.id
  );

  UPDATE public.facturas SET sustituida_por = v_new_id WHERE id = v_old.id;

  PERFORM public._copiar_conceptos_factura_reemplazo(v_new_id,v_old.id,NULL);

  -- Copiar los vínculos con embarques (tabla puente) al borrador sustituto.
  -- La original queda con activa=false al cancelarse; la nueva nace activa.
  INSERT INTO public.factura_embarques (factura_id, embarque_id, organization_id, activa)
  SELECT v_new_id, embarque_id, organization_id, true
  FROM public.factura_embarques
  WHERE factura_id = v_old.id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.bitacora_actividad (
    organization_id, usuario_id, usuario_email, accion, modulo, entidad_id, entidad_nombre, detalles
  ) VALUES (
    v_old.organization_id,
    v_caller,
    COALESCE((SELECT email FROM auth.users WHERE id = v_caller), ''),
    'factura_duplicada_para_sustitucion',
    'facturacion',
    v_new_id,
    COALESCE(v_new_numero, ''),
    jsonb_build_object('factura_original_id', v_old.id, 'factura_original_uuid', v_old.uuid_fiscal, 'numero_nuevo', v_new_numero)
  );

  RETURN v_new_id;
END;
$function$;
--> statement-breakpoint
-- Fuente canónica de public.duplicar_factura_para_refacturacion.
-- v13.646.0 (BUG-08): la factura sustituta toma el TC DOF vigente a su fecha de
-- emisión en lugar de heredar el TC de la factura original.

CREATE OR REPLACE FUNCTION public.duplicar_factura_para_refacturacion(p_caso_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_c public.refacturaciones%ROWTYPE;
  v_old public.facturas%ROWTYPE;
  v_cli public.clientes%ROWTYPE;
  v_new_id uuid := gen_random_uuid();
  v_new_numero text;
  v_estado_nueva text;
  v_tc_nuevo numeric;
  v_factor numeric;
BEGIN
  -- N18: FOR UPDATE serializa la duplicación del mismo caso (doble clic).
  SELECT * INTO v_c FROM public.refacturaciones WHERE id = p_caso_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LC_REFACT_CASO_NO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public._assert_refacturador(v_c.organization_id);

  IF v_c.factura_nueva_id IS NOT NULL THEN
    SELECT estado::text INTO v_estado_nueva FROM public.facturas WHERE id = v_c.factura_nueva_id;
    IF v_estado_nueva IS NOT NULL AND v_estado_nueva <> 'Cancelada' THEN
      RETURN v_c.factura_nueva_id;
    END IF;
  END IF;

  SELECT * INTO v_old FROM public.facturas WHERE id = v_c.factura_original_id AND organization_id=v_c.organization_id
    AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LC_REFACT_FACTURA_NO_ENCONTRADA' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_cli FROM public.clientes WHERE id = v_c.cliente_destino_id AND organization_id=v_c.organization_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LC_REFACT_CLIENTE_DESTINO: el cliente destino no existe' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public._assert_receptor_fiscal_valido(v_c.cliente_destino_id);

  IF v_old.moneda <> 'MXN' AND COALESCE(v_old.tipo_cambio, 0) <= 0 THEN
    RAISE EXCEPTION 'LC_REFACT_TC_REQUERIDO: la factura original en % no tiene tipo de cambio', v_old.moneda
      USING ERRCODE = 'P0001';
  END IF;

  IF v_old.moneda::text = 'MXN' THEN
    v_tc_nuevo := v_old.tipo_cambio;
  ELSE
    SELECT CASE WHEN v_old.moneda::text = 'USD' THEN d.usd_mxn
                WHEN v_old.moneda::text = 'EUR' THEN d.eur_mxn END
      INTO v_tc_nuevo
    FROM public.tc_dof_vigente(CURRENT_DATE) d;
    IF v_tc_nuevo IS NULL OR v_tc_nuevo <= 1 THEN
      v_tc_nuevo := NULL;
    END IF;
  END IF;

  v_new_numero := v_old.numero || '-RF';
  WHILE EXISTS (
    SELECT 1 FROM public.facturas
    WHERE organization_id = v_old.organization_id AND numero = v_new_numero
  ) LOOP
    v_new_numero := v_new_numero || '1';
  END LOOP;

  INSERT INTO public.facturas (
    id, organization_id, cliente_id, cliente_nombre, expediente,
    cotizacion_id, embarque_id, proforma_id,
    numero, serie, serie_id,
    fecha_emision, fecha_vencimiento, dias_credito,
    moneda, tipo_cambio, subtotal, iva, ret_isr, ret_iva, total,
    metodo_pago, forma_pago, uso_cfdi, rfc_cliente,
    notas, referencia_bl, snapshot_emision, estado, origen, sustituye_a
  ) VALUES (
    v_new_id, v_old.organization_id, v_cli.id, v_cli.nombre, v_old.expediente,
    v_old.cotizacion_id, v_old.embarque_id, NULL,
    v_new_numero, v_old.serie, v_old.serie_id,
    CURRENT_DATE,
    CURRENT_DATE + COALESCE(v_cli.dias_credito, v_old.dias_credito, 0),
    COALESCE(v_cli.dias_credito, v_old.dias_credito, 0),
    v_old.moneda, v_tc_nuevo, v_old.subtotal, v_old.iva,
    COALESCE(v_old.ret_isr, 0), COALESCE(v_old.ret_iva, 0), v_old.total,
    COALESCE(v_cli.metodo_pago_default, v_old.metodo_pago),
    COALESCE(v_cli.forma_pago_default, v_old.forma_pago),
    COALESCE(v_cli.uso_cfdi_default, v_old.uso_cfdi),
    v_cli.rfc,
    COALESCE(v_old.notas, '') || E'\n[Refacturación de ' || v_old.numero || ' a ' || v_cli.nombre || ']',
    v_old.referencia_bl, NULL, 'Borrador', v_old.origen,
    CASE WHEN v_c.ruta_fiscal = '01' THEN v_old.id ELSE NULL END
  );

  IF v_c.ruta_fiscal = '01' THEN
    IF EXISTS (SELECT 1 FROM public.facturas s WHERE s.id=v_old.sustituida_por AND s.deleted_at IS NULL
      AND s.estado NOT IN ('Cancelada','Sustituida')) THEN
      RAISE EXCEPTION 'factura_ya_sustituida' USING ERRCODE='P0001';
    END IF;
    UPDATE public.facturas SET sustituida_por = v_new_id WHERE id = v_old.id;
  END IF;

  UPDATE public.refacturaciones
     SET factura_nueva_id = v_new_id, paso_actual = GREATEST(paso_actual, 3)
   WHERE id = p_caso_id;
  PERFORM public._copiar_conceptos_factura_reemplazo(v_new_id,v_old.id,p_caso_id);

  INSERT INTO public.factura_embarques (factura_id, embarque_id, organization_id, activa)
  SELECT v_new_id, embarque_id, organization_id, true
  FROM public.factura_embarques
  WHERE factura_id = v_old.id
  ON CONFLICT DO NOTHING;

  v_factor := CASE WHEN COALESCE(v_old.tipo_cambio, 0) > 0 AND v_tc_nuevo IS NOT NULL
                   THEN ROUND(v_tc_nuevo / v_old.tipo_cambio, 6) ELSE NULL END;

  INSERT INTO public.bitacora_actividad (
    organization_id, usuario_id, usuario_email, accion, modulo, entidad_id, entidad_nombre, detalles
  ) VALUES (
    v_old.organization_id, auth.uid(),
    COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), ''),
    'refacturacion_borrador_creado', 'facturacion', v_new_id, COALESCE(v_new_numero, ''),
    jsonb_build_object('caso_id', p_caso_id, 'factura_original_id', v_old.id,
                       'cliente_destino_id', v_cli.id, 'rfc_destino', v_cli.rfc,
                       'ruta_fiscal', v_c.ruta_fiscal, 'proforma_origen_id', v_old.proforma_id,
                       'tc_original', v_old.tipo_cambio, 'tc_nuevo_dof', v_tc_nuevo,
                       'tc_factor', v_factor)
  );

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.duplicar_factura_para_refacturacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicar_factura_para_refacturacion(uuid) TO authenticated, service_role;
--> statement-breakpoint
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
  v_original public.facturas;
  v_sustituye_uuid text;
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

  IF v_factura.sustituye_a IS NOT NULL THEN
    SELECT * INTO v_original FROM public.facturas WHERE id=v_factura.sustituye_a
      AND organization_id=v_factura.organization_id AND deleted_at IS NULL;
    IF v_original.uuid_fiscal IS NULL OR v_original.sustituida_por IS DISTINCT FROM v_factura.id
      OR v_original.estado IN ('Borrador','Cancelada','Sustituida')
      OR (v_original.ambiente IS NOT NULL AND v_original.ambiente::text IS DISTINCT FROM v_cred.ambiente)
      OR upper(btrim(COALESCE(v_original.snapshot_emision#>>'{cliente_snapshot,rfc}',v_original.rfc_cliente)))
        IS DISTINCT FROM v_documento#>>'{receptor,rfc}'
      OR (v_original.evaluacion_fiscal IS NOT NULL AND (
        v_original.snapshot_emision#>>'{organizacion_snapshot,rfc}' IS DISTINCT FROM v_perfil.rfc
        OR v_original.snapshot_emision#>>'{organizacion_snapshot,facturapi_org_id}' IS DISTINCT FROM v_perfil.facturapi_org_id))
      OR v_documento#>>'{origen_reemplazo,factura_id}' IS DISTINCT FROM v_original.id::text
      OR v_documento#>>'{origen_reemplazo,uuid}' IS DISTINCT FROM upper(v_original.uuid_fiscal) THEN
      RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
    END IF;
    v_sustituye_uuid := upper(v_original.uuid_fiscal);
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
      'ciudad', v_cliente.ciudad, 'estado', v_cliente.estado))
    || CASE WHEN v_sustituye_uuid IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('sustituye_uuid',v_sustituye_uuid) END;
END;
$$;
--> statement-breakpoint
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
      OR v_xml->>'sustituye_uuid' IS DISTINCT FROM v_intento.prevalidacion->>'sustituye_uuid'
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
    IF v_factura.sustituye_a IS NOT NULL THEN
      UPDATE public.facturas SET sustituida_por = p_factura_id
      WHERE id = v_factura.sustituye_a AND organization_id = v_factura.organization_id
        AND deleted_at IS NULL AND sustituida_por IS NULL;
    END IF;
    INSERT INTO public.bitacora_actividad (organization_id, usuario_id, usuario_email, modulo, accion, entidad_id, entidad_nombre, detalles)
    VALUES (v_factura.organization_id, v_intento.actor_id,
      COALESCE((SELECT email FROM auth.users WHERE id = v_intento.actor_id), ''), 'facturacion',
      'facturapi_emitida', p_factura_id, v_serie || v_folio::text, jsonb_build_object(
        'uuid', v_uuid, 'folio', v_folio, 'serie', v_serie, 'facturapi_id', v_id,
        'uso_cfdi_solicitado', v_intento.prevalidacion#>>'{datos_factura,uso_cfdi}', 'uso_cfdi_efectivo', v_uso,
        'fuente_uso_cfdi', 'xml', 'intento', p_claim,
        'xml_backup', jsonb_build_object('status', 'guardado', 'path', v_ruta)));
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.refacturacion_validar_consistencia(p_caso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_c public.refacturaciones%ROWTYPE;
  v_old public.facturas%ROWTYPE;
  v_new public.facturas%ROWTYPE;
  v_h jsonb := '[]'::jsonb;
  v_sum_old numeric;
  v_sum_new numeric;
  v_dif int;
  v_pago numeric;
  v_isr_destino boolean;
BEGIN
  SELECT * INTO v_c FROM public.refacturaciones WHERE id = p_caso_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LC_REFACT_CASO_NO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public._assert_refacturador(v_c.organization_id);

  SELECT * INTO v_old FROM public.facturas WHERE id = v_c.factura_original_id;

  IF v_c.factura_nueva_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'hallazgos', jsonb_build_array(jsonb_build_object(
        'codigo', 'LC_REFACT_SIN_FACTURA_NUEVA',
        'mensaje', 'Todavía no se ha generado la nueva factura.'))
    );
  END IF;

  SELECT * INTO v_new FROM public.facturas WHERE id = v_c.factura_nueva_id;
  v_isr_destino := COALESCE(v_c.ruta_fiscal='02' AND v_new.evaluacion_fiscal->>'estado'='confirmado'
    AND v_new.evaluacion_fiscal#>>'{origen_reemplazo,caso_id}'=v_c.id::text
    AND v_new.evaluacion_fiscal#>>'{origen_reemplazo,factura_id}'=v_old.id::text
    AND v_new.evaluacion_fiscal#>>'{origen_reemplazo,ruta}'='02'
    AND v_new.ret_isr=(v_new.evaluacion_fiscal#>>'{bloques,0,ret_isr}')::numeric
    AND v_new.total=(v_new.evaluacion_fiscal#>>'{bloques,0,total}')::numeric,false);

  -- Receptor
  IF NOT public._rfc_valido(v_new.rfc_cliente, false) THEN
    v_h := v_h || jsonb_build_object('codigo', 'LC_REFACT_RFC_INVALIDO',
      'mensaje', 'El RFC del receptor de la nueva factura no tiene formato válido del SAT.');
  END IF;
  IF v_new.cliente_id IS DISTINCT FROM v_c.cliente_destino_id THEN
    v_h := v_h || jsonb_build_object('codigo', 'LC_REFACT_RECEPTOR_INCOMPLETO',
      'mensaje', 'La nueva factura no está emitida al cliente destino del caso.');
  END IF;

  -- Moneda y tipo de cambio
  IF v_new.moneda <> v_old.moneda THEN
    v_h := v_h || jsonb_build_object('codigo', 'LC_REFACT_MONEDA_INCONSISTENTE',
      'mensaje', format('La factura original está en %s y la nueva en %s.', v_old.moneda, v_new.moneda));
  END IF;
  IF v_new.moneda <> 'MXN' AND COALESCE(v_new.tipo_cambio, 0) <= 0 THEN
    v_h := v_h || jsonb_build_object('codigo', 'LC_REFACT_TC_REQUERIDO',
      'mensaje', 'Falta el tipo de cambio de la nueva factura.');
  END IF;

  -- Importes
  IF ROUND(COALESCE(v_new.subtotal, 0), 2) <> ROUND(COALESCE(v_old.subtotal, 0), 2) THEN
    v_h := v_h || jsonb_build_object('codigo', 'LC_REFACT_TOTAL_INCONSISTENTE',
      'mensaje', 'El subtotal de la nueva factura no coincide con el de la original.');
  END IF;
  IF ROUND(COALESCE(v_new.total, 0) + CASE WHEN v_isr_destino THEN COALESCE(v_new.ret_isr,0) ELSE 0 END, 2)
    <> ROUND(COALESCE(v_old.total, 0) + CASE WHEN v_isr_destino THEN COALESCE(v_old.ret_isr,0) ELSE 0 END, 2) THEN
    v_h := v_h || jsonb_build_object('codigo', 'LC_REFACT_TOTAL_INCONSISTENTE',
      'mensaje', 'El total de la nueva factura no coincide con el de la original.');
  END IF;
  IF ROUND(COALESCE(v_new.iva, 0), 2) <> ROUND(COALESCE(v_old.iva, 0), 2)
     OR (NOT v_isr_destino AND ROUND(COALESCE(v_new.ret_isr, 0), 2) <> ROUND(COALESCE(v_old.ret_isr, 0), 2))
     OR ROUND(COALESCE(v_new.ret_iva, 0), 2) <> ROUND(COALESCE(v_old.ret_iva, 0), 2) THEN
    v_h := v_h || jsonb_build_object('codigo', 'LC_REFACT_IMPUESTOS_INCONSISTENTES',
      'mensaje', 'Los impuestos trasladados o las retenciones no coinciden con la factura original.');
  END IF;

  -- Conceptos: mismas claves SAT y tasas
  SELECT COALESCE(SUM(total), 0) INTO v_sum_old
  FROM public.conceptos_factura WHERE factura_id = v_old.id AND deleted_at IS NULL;
  SELECT COALESCE(SUM(total), 0) INTO v_sum_new
  FROM public.conceptos_factura WHERE factura_id = v_new.id AND deleted_at IS NULL;
  IF ROUND(v_sum_old, 2) <> ROUND(v_sum_new, 2) THEN
    v_h := v_h || jsonb_build_object('codigo', 'LC_REFACT_TOTAL_INCONSISTENTE',
      'mensaje', 'La suma de los conceptos de la nueva factura no coincide con la original.');
  END IF;

  SELECT COUNT(*) INTO v_dif FROM (
    SELECT clave_sat, tipo_iva, tasa_iva_aplicada, CASE WHEN v_isr_destino THEN 0 ELSE tasa_ret_isr END, tasa_ret_iva, COUNT(*) AS n
      FROM public.conceptos_factura WHERE factura_id = v_old.id AND deleted_at IS NULL
      GROUP BY 1,2,3,4,5
    EXCEPT
    SELECT clave_sat, tipo_iva, tasa_iva_aplicada, CASE WHEN v_isr_destino THEN 0 ELSE tasa_ret_isr END, tasa_ret_iva, COUNT(*) AS n
      FROM public.conceptos_factura WHERE factura_id = v_new.id AND deleted_at IS NULL
      GROUP BY 1,2,3,4,5
  ) d;
  IF v_dif > 0 THEN
    v_h := v_h || jsonb_build_object('codigo', 'LC_REFACT_IMPUESTOS_INCONSISTENTES',
      'mensaje', 'Las claves del SAT o las tasas de impuesto de los conceptos difieren de la factura original.');
  END IF;

  -- Ruta 01: relación de sustitución
  IF v_c.ruta_fiscal = '01' AND v_new.sustituye_a IS DISTINCT FROM v_old.id THEN
    v_h := v_h || jsonb_build_object('codigo', 'LC_REFACT_SUSTITUCION_FALTANTE',
      'mensaje', 'La ruta de sustitución requiere relacionar la nueva factura con el CFDI original.');
  END IF;

  -- Depósito
  SELECT COALESCE(SUM(monto_aplicado_factura), 0) INTO v_pago
  FROM public.pagos_factura
  WHERE factura_id = v_new.id AND deleted_at IS NULL;
  IF ROUND(v_pago, 2) > ROUND(COALESCE(v_new.total, 0), 2) + 0.01 THEN
    v_h := v_h || jsonb_build_object('codigo', 'LC_REFACT_SOBREPAGO',
      'mensaje', 'El pago aplicado excede el total de la nueva factura.');
  END IF;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_h) = 0,
    'hallazgos', v_h,
    'factura_original', jsonb_build_object('numero', v_old.numero, 'moneda', v_old.moneda,
      'subtotal', v_old.subtotal, 'iva', v_old.iva, 'ret_isr', COALESCE(v_old.ret_isr, 0),
      'ret_iva', COALESCE(v_old.ret_iva, 0), 'total', v_old.total, 'tipo_cambio', v_old.tipo_cambio),
    'factura_nueva', jsonb_build_object('numero', v_new.numero, 'moneda', v_new.moneda,
      'subtotal', v_new.subtotal, 'iva', v_new.iva, 'ret_isr', COALESCE(v_new.ret_isr, 0),
      'ret_iva', COALESCE(v_new.ret_iva, 0), 'total', v_new.total, 'tipo_cambio', v_new.tipo_cambio),
    'pago_aplicado', v_pago
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.refacturacion_validar_consistencia(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refacturacion_validar_consistencia(uuid) TO authenticated, service_role;

-- 6) Reasignar pago: ordenante obligatorio y RFC validado.
