ALTER TABLE public.comisiones_broker ADD COLUMN desglose jsonb;
COMMENT ON COLUMN public.comisiones_broker.desglose IS 'Desglose del tabulador de brokers (servicio, retención, base, %, mínimo) y proporción cobrada.';
COMMENT ON COLUMN public.crm_brokers.comision_pct IS 'DEPRECATED: la comisión del broker usa el tabulador por servicio (_broker_tabulador).';

CREATE FUNCTION public._broker_tabulador(p_servicio text)
RETURNS TABLE (pct numeric, minimo_usd numeric) LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT v.pct, v.minimo FROM (VALUES
    ('maritimo_fcl', 15.0, 0.0), ('maritimo_lcl', 15.0, 25.0), ('aereo', 15.0, 25.0),
    ('despacho_aduanal', 15.0, 25.0), ('terrestre_ftl', 10.0, 20.0), ('terrestre_ltl', 10.0, 20.0)
  ) AS v(servicio, pct, minimo) WHERE v.servicio = p_servicio
$$;
REVOKE ALL ON FUNCTION public._broker_tabulador(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public._broker_es_despacho(p_texto text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT coalesce(p_texto, '') ~* '(despacho|aduan|pedimento)' $$;
REVOKE ALL ON FUNCTION public._broker_es_despacho(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public._broker_comision_embarque(p_embarque_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE e record; v_tc numeric; v_flete text; v_unid int; v_cont int;
  v_venta_mxn numeric := 0; v_total_usd numeric := 0; v_serv jsonb := '[]'::jsonb;
  r record; t record; v_gan numeric; v_ret numeric; v_base numeric; v_com numeric;
BEGIN
  SELECT id, modo::text AS modo, tipo_servicio::text AS ts, tipo_cambio_usd, tipo_cambio_eur
    INTO e FROM public.embarques WHERE id = p_embarque_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_tc := NULLIF(e.tipo_cambio_usd, 0);
  IF v_tc IS NULL THEN RETURN jsonb_build_object('error', 'sin_tc_usd'); END IF;
  SELECT count(*) INTO v_cont FROM public.embarque_contenedores WHERE embarque_id = p_embarque_id AND deleted_at IS NULL;
  v_flete := CASE
    WHEN e.modo = 'Aéreo' THEN 'aereo'
    WHEN e.modo = 'Terrestre' THEN CASE WHEN e.ts = 'LCL' THEN 'terrestre_ltl' ELSE 'terrestre_ftl' END
    WHEN e.ts = 'LCL' OR (e.ts IS NULL AND v_cont = 0) THEN 'maritimo_lcl'
    ELSE 'maritimo_fcl' END;
  SELECT coalesce(sum(public.convertir_a_mxn(total, moneda::text, v_tc, NULLIF(e.tipo_cambio_eur, 0))), 0)
    INTO v_venta_mxn FROM public.conceptos_venta WHERE embarque_id = p_embarque_id AND deleted_at IS NULL;
  FOR r IN
    WITH m AS (
      SELECT CASE WHEN public._broker_es_despacho(descripcion) THEN 'despacho_aduanal' ELSE v_flete END s,
             public.convertir_a_mxn(total, moneda::text, v_tc, NULLIF(e.tipo_cambio_eur, 0)) v
        FROM public.conceptos_venta WHERE embarque_id = p_embarque_id AND deleted_at IS NULL
      UNION ALL
      SELECT CASE WHEN public._broker_es_despacho(concepto) THEN 'despacho_aduanal' ELSE v_flete END,
             -public.convertir_a_mxn(monto, moneda::text, v_tc, NULLIF(e.tipo_cambio_eur, 0))
        FROM public.conceptos_costo WHERE embarque_id = p_embarque_id AND deleted_at IS NULL)
    SELECT s, sum(v) / v_tc AS gan FROM m GROUP BY s ORDER BY s
  LOOP
    SELECT * INTO t FROM public._broker_tabulador(r.s);
    v_unid := CASE WHEN r.s IN ('maritimo_fcl','terrestre_ftl') THEN GREATEST(v_cont, 1) ELSE 1 END;
    v_gan := round(r.gan, 2);
    v_ret := 150 * v_unid;
    v_base := GREATEST(v_gan - v_ret, 0);
    v_com := round(GREATEST(v_base * t.pct / 100.0, t.minimo_usd * v_unid), 2);
    v_total_usd := v_total_usd + v_com;
    v_serv := v_serv || jsonb_build_object('servicio', r.s, 'unidades', v_unid, 'ganancia_usd', v_gan,
      'retencion_usd', v_ret, 'base_usd', v_base, 'pct', t.pct, 'minimo_usd', t.minimo_usd * v_unid,
      'minimo_aplicado', v_base * t.pct / 100.0 < t.minimo_usd * v_unid, 'comision_usd', v_com);
  END LOOP;
  RETURN jsonb_build_object('tc_usd', v_tc, 'venta_mxn', round(v_venta_mxn, 2),
    'comision_usd', v_total_usd, 'comision_mxn', round(v_total_usd * v_tc, 2), 'servicios', v_serv);
END $$;
REVOKE ALL ON FUNCTION public._broker_comision_embarque(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public._broker_monto_renglon(p_embarque_id uuid, p_cobrado_mxn numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE d jsonb; v_prop numeric;
BEGIN
  IF p_embarque_id IS NULL THEN RETURN jsonb_build_object('monto', 0, 'desglose', NULL); END IF;
  d := public._broker_comision_embarque(p_embarque_id);
  IF d IS NULL OR d ? 'error' OR coalesce((d->>'venta_mxn')::numeric, 0) <= 0 THEN
    RETURN jsonb_build_object('monto', 0, 'desglose', d);
  END IF;
  v_prop := LEAST(GREATEST(coalesce(p_cobrado_mxn, 0), 0) / (d->>'venta_mxn')::numeric, 1);
  RETURN jsonb_build_object('monto', round((d->>'comision_mxn')::numeric * v_prop, 2),
    'desglose', d || jsonb_build_object('proporcion_cobrada', round(v_prop, 6)));
END $$;
REVOKE ALL ON FUNCTION public._broker_monto_renglon(uuid, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._comision_broker_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE b public.crm_brokers%ROWTYPE; cur public.comisiones_broker%ROWTYPE; v_activa boolean; x jsonb;
BEGIN
  SELECT * INTO cur FROM public.comisiones_broker WHERE comision_devengada_id = NEW.id FOR UPDATE;
  v_activa := NEW.estado = 'Devengada';
  IF FOUND THEN
    IF cur.estado = 'Liquidada' THEN
      IF NEW.estado IN ('Cancelada','Por recuperar') THEN
        UPDATE public.comisiones_broker SET estado = 'Por recuperar', updated_at = now() WHERE id = cur.id;
      END IF;
      RETURN NEW;
    END IF;
    IF cur.estado = 'Por recuperar' THEN RETURN NEW; END IF;
    x := CASE WHEN v_activa THEN public._broker_monto_renglon(NEW.embarque_id, NEW.monto_cobrado_mxn) END;
    UPDATE public.comisiones_broker
       SET utilidad_prorrateada_mxn = NEW.utilidad_prorrateada_mxn,
           comision_mxn = coalesce((x->>'monto')::numeric, 0), desglose = x->'desglose', porcentaje_aplicado = 0,
           embarque_id = NEW.embarque_id,
           estado = CASE WHEN v_activa THEN 'Devengada'::public.estado_comision ELSE 'Cancelada'::public.estado_comision END,
           updated_at = now()
     WHERE id = cur.id;
    RETURN NEW;
  END IF;
  IF NOT v_activa THEN RETURN NEW; END IF;
  b := public._broker_de_pago(NEW.organization_id, NEW.pago_factura_id, NEW.factura_id);
  IF b.id IS NULL THEN RETURN NEW; END IF;
  x := public._broker_monto_renglon(NEW.embarque_id, NEW.monto_cobrado_mxn);
  INSERT INTO public.comisiones_broker (organization_id, comision_devengada_id, pago_factura_id, factura_id, embarque_id,
    broker_id, utilidad_prorrateada_mxn, porcentaje_aplicado, comision_mxn, desglose)
  VALUES (NEW.organization_id, NEW.id, NEW.pago_factura_id, NEW.factura_id, NEW.embarque_id, b.id,
    NEW.utilidad_prorrateada_mxn, 0, coalesce((x->>'monto')::numeric, 0), x->'desglose');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._comision_broker_sync() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.crm_brokers_recalcular_comisiones()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_org uuid := public.org_scope(); r record; x jsonb; n integer := 0;
BEGIN
  IF NOT public.has_any_role_in_org(auth.uid(), ARRAY['admin_org','contador']::public.app_role[], v_org) THEN
    RAISE EXCEPTION 'LC_BROKER_LIQUIDAR_NO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  FOR r IN SELECT c.id, c.embarque_id, d.monto_cobrado_mxn FROM public.comisiones_broker c
             JOIN public.comisiones_devengadas d ON d.id = c.comision_devengada_id
            WHERE c.organization_id = v_org AND c.estado = 'Devengada' AND c.liquidacion_id IS NULL
            FOR UPDATE OF c LOOP
    x := public._broker_monto_renglon(r.embarque_id, r.monto_cobrado_mxn);
    UPDATE public.comisiones_broker SET comision_mxn = coalesce((x->>'monto')::numeric, 0),
           desglose = x->'desglose', porcentaje_aplicado = 0, updated_at = now() WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.crm_brokers_recalcular_comisiones() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_brokers_recalcular_comisiones() TO authenticated;

DROP FUNCTION public.broker_mis_comisiones();
CREATE FUNCTION public.broker_mis_comisiones()
RETURNS TABLE (id uuid, organizacion text, empresa text, factura text, fecha timestamptz,
               utilidad_mxn numeric, porcentaje numeric, comision_mxn numeric, estado text, pagada boolean, desglose jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.id, o.nombre, coalesce(cl.nombre, ''), coalesce(nullif(concat(f.serie, f.numero), ''), ''),
         c.created_at, c.utilidad_prorrateada_mxn, c.porcentaje_aplicado, c.comision_mxn, c.estado::text,
         coalesce(l.estado = 'Pagado', false), c.desglose
    FROM public.comisiones_broker c
    JOIN public.crm_brokers b ON b.id = c.broker_id AND b.user_id = auth.uid()
    JOIN public.organizations o ON o.id = c.organization_id
    JOIN public.facturas f ON f.id = c.factura_id
    LEFT JOIN public.clientes cl ON cl.id = f.cliente_id
    LEFT JOIN public.liquidaciones_broker l ON l.id = c.liquidacion_id
   ORDER BY c.created_at DESC LIMIT 500
$$;
REVOKE ALL ON FUNCTION public.broker_mis_comisiones() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broker_mis_comisiones() TO authenticated;