CREATE OR REPLACE FUNCTION public.broker_alta_prospecto(p_broker_id uuid, p_empresa jsonb, p_contactos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v public.crm_brokers%ROWTYPE;
  v_nombre text := btrim(coalesce(p_empresa->>'nombre', ''));
  v_kam uuid; v_kam_email text; v_etapa uuid; v_lead uuid; v_emp uuid; v_op uuid; v_cont uuid; c jsonb;
  v_notas text;
BEGIN
  v := public._broker_actual(p_broker_id);
  IF length(v_nombre) < 2 THEN RAISE EXCEPTION 'LC_BROKER_NOMBRE_REQUERIDO'; END IF;
  IF jsonb_typeof(coalesce(p_contactos, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_contactos, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'LC_BROKER_CONTACTO_REQUERIDO';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('broker_alta:' || v.organization_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.crm_empresas WHERE organization_id = v.organization_id
              AND deleted_at IS NULL AND lower(btrim(nombre)) = lower(v_nombre)) THEN
    RAISE EXCEPTION 'LC_BROKER_EMPRESA_EXISTE';
  END IF;
  SELECT id INTO v_etapa FROM public.crm_etapas_pipeline
   WHERE organization_id = v.organization_id AND nombre = 'Prospecto' AND deleted_at IS NULL ORDER BY orden LIMIT 1;
  IF v_etapa IS NULL THEN RAISE EXCEPTION 'LC_CRM_ETAPA_PROSPECTO_FALTANTE'; END IF;

  SELECT om.user_id INTO v_kam FROM public.organization_members om
   WHERE om.organization_id = v.organization_id AND om.role::text = 'vendedor'
   ORDER BY (SELECT max(op.created_at) FROM public.crm_oportunidades op
               JOIN public.crm_leads l ON l.id = op.lead_id AND l.fuente::text = 'Broker'
              WHERE op.organization_id = v.organization_id AND op.vendedor_id = om.user_id) ASC NULLS FIRST,
            om.user_id
   LIMIT 1;
  IF v_kam IS NULL THEN RAISE EXCEPTION 'LC_BROKER_SIN_KAM'; END IF;
  SELECT email INTO v_kam_email FROM auth.users WHERE id = v_kam;

  v_notas := concat_ws(E'\n', 'Prospecto externo · Broker: ' || v.nombre,
    nullif('Transporte: ' || coalesce(p_empresa->>'transporte', ''), 'Transporte: '),
    nullif('Agente aduanal/transportista propio: ' || coalesce(p_empresa->>'agente_propio', ''), 'Agente aduanal/transportista propio: '),
    nullif(btrim(coalesce(p_empresa->>'notas', '')), ''));

  INSERT INTO public.crm_leads (organization_id, empresa, estado, fuente, vendedor_id, vendedor_email, created_by,
    pais, interes_modo, volumen, rutas, rfc, sector, origen, destino, incoterm, proveedor_actual, notas)
  VALUES (v.organization_id, v_nombre, 'Prospecto', 'Broker', v_kam, coalesce(v_kam_email, ''), auth.uid(),
    coalesce(p_empresa->>'pais', ''), coalesce(p_empresa->>'transporte', ''), p_empresa->>'volumen_usd',
    p_empresa->>'rutas', upper(coalesce(p_empresa->>'rfc', '')), p_empresa->>'sector', p_empresa->>'origen',
    p_empresa->>'destino', p_empresa->>'incoterm', p_empresa->>'proveedor_actual', v_notas)
  RETURNING id INTO v_lead;

  INSERT INTO public.crm_empresas (organization_id, nombre, lead_origen_id, estado_crm, broker_id, created_by)
  VALUES (v.organization_id, v_nombre, v_lead, 'Prospecto', v.id, auth.uid()) RETURNING id INTO v_emp;

  INSERT INTO public.crm_oportunidades (organization_id, nombre, cliente_nombre, lead_id, etapa_id, vendedor_id,
    vendedor_email, created_by, origen, destino, incoterm, proveedor_actual, sector, rutas, volumen, modo, notas)
  VALUES (v.organization_id, v_nombre, v_nombre, v_lead, v_etapa, v_kam, coalesce(v_kam_email, ''), auth.uid(),
    coalesce(p_empresa->>'origen', ''), coalesce(p_empresa->>'destino', ''), p_empresa->>'incoterm',
    p_empresa->>'proveedor_actual', p_empresa->>'sector', p_empresa->>'rutas', p_empresa->>'volumen_usd',
    coalesce(p_empresa->>'transporte', ''), v_notas)
  RETURNING id INTO v_op;
  INSERT INTO public.crm_oportunidad_empresa (organization_id, oportunidad_id, empresa_id) VALUES (v.organization_id, v_op, v_emp);

  FOR c IN SELECT * FROM jsonb_array_elements(p_contactos) LOOP
    IF length(btrim(coalesce(c->>'nombre', ''))) = 0 THEN RAISE EXCEPTION 'LC_BROKER_CONTACTO_REQUERIDO'; END IF;
    INSERT INTO public.crm_contactos (organization_id, nombre, email, telefono, telefono_fijo, puesto, lead_origen_id, created_by)
    VALUES (v.organization_id, btrim(c->>'nombre'), nullif(btrim(coalesce(c->>'email', '')), ''),
      nullif(btrim(coalesce(c->>'movil', '')), ''), nullif(btrim(coalesce(c->>'fijo', '')), ''),
      nullif(btrim(coalesce(c->>'puesto', '')), ''), v_lead, auth.uid())
    RETURNING id INTO v_cont;
    INSERT INTO public.crm_empresa_contacto (organization_id, empresa_id, contacto_id) VALUES (v.organization_id, v_emp, v_cont);
  END LOOP;

  INSERT INTO public.crm_valores (organization_id, propiedad_id, registro_id, valor_texto, valor_numero)
  SELECT v.organization_id, p.id, v_emp,
         CASE WHEN p.tipo = 'numero' THEN NULL ELSE x.val END,
         CASE WHEN p.tipo = 'numero' THEN x.val::numeric END
    FROM (VALUES ('pais', p_empresa->>'pais'), ('rfc', upper(p_empresa->>'rfc')), ('sector', p_empresa->>'sector'),
                 ('origen', p_empresa->>'origen'), ('destino', p_empresa->>'destino'), ('incoterm', p_empresa->>'incoterm'),
                 ('proveedor_actual', p_empresa->>'proveedor_actual'), ('rutas_principales', p_empresa->>'rutas'),
                 ('volumen_importacion_usd', replace(p_empresa->>'volumen_usd', ',', ''))) AS x(clave, val)
    JOIN public.crm_propiedades p ON p.objeto = 'empresa' AND p.clave = x.clave AND NOT p.archivada
   WHERE nullif(btrim(coalesce(x.val, '')), '') IS NOT NULL
     AND (p.tipo <> 'numero' OR x.val ~ '^[0-9]+(\.[0-9]+)?$')
  ON CONFLICT (propiedad_id, registro_id) DO NOTHING;

  INSERT INTO public.notificaciones_internas (organization_id, usuario_id, tipo, titulo, mensaje, enlace, entidad_tipo, entidad_id)
  VALUES (v.organization_id, v_kam, 'broker_prospecto', 'Nuevo prospecto externo',
          v.nombre || ' registró la empresa ' || v_nombre || ' y te tocó por turno.', '/crm/oportunidades/' || v_op,
          'crm_oportunidad', v_op);
  RETURN jsonb_build_object('empresa_id', v_emp, 'oportunidad_id', v_op);
END $function$;

INSERT INTO public.crm_valores (organization_id, propiedad_id, registro_id, valor_texto, valor_numero)
SELECT e.organization_id, p.id, e.id,
       CASE WHEN p.tipo = 'numero' THEN NULL ELSE x.val END,
       CASE WHEN p.tipo = 'numero' THEN x.val::numeric END
  FROM public.crm_empresas e
  JOIN public.crm_leads l ON l.id = e.lead_origen_id
  CROSS JOIN LATERAL (VALUES ('pais', l.pais), ('rfc', l.rfc), ('sector', l.sector), ('origen', l.origen),
         ('destino', l.destino), ('incoterm', l.incoterm), ('proveedor_actual', l.proveedor_actual),
         ('rutas_principales', l.rutas), ('volumen_importacion_usd', replace(l.volumen, ',', ''))) AS x(clave, val)
  JOIN public.crm_propiedades p ON p.objeto = 'empresa' AND p.clave = x.clave AND NOT p.archivada
 WHERE e.broker_id IS NOT NULL AND e.deleted_at IS NULL
   AND nullif(btrim(coalesce(x.val, '')), '') IS NOT NULL
   AND (p.tipo <> 'numero' OR x.val ~ '^[0-9]+(\.[0-9]+)?$')
ON CONFLICT (propiedad_id, registro_id) DO NOTHING;