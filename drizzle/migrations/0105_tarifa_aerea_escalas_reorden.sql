DROP POLICY IF EXISTS costeo_tarifa_tramos_tenant_restrictive ON public.costeo_tarifa_tramos;
CREATE POLICY costeo_tarifa_tramos_tenant_restrictive ON public.costeo_tarifa_tramos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id))
  WITH CHECK ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id));

ALTER TABLE public.costeo_tarifas ADD COLUMN IF NOT EXISTS escalas text[];
ALTER TABLE public.costeo_tarifas DROP CONSTRAINT IF EXISTS costeo_tarifas_escalas_aereo;
ALTER TABLE public.costeo_tarifas ADD CONSTRAINT costeo_tarifas_escalas_aereo
  CHECK (escalas IS NULL OR (modo = 'Aéreo' AND cardinality(escalas) BETWEEN 1 AND 3
    AND array_to_string(escalas, ',') ~ '^[A-Z0-9]{3}(,[A-Z0-9]{3}){0,2}$'));
COMMENT ON COLUMN public.costeo_tarifas.escalas IS 'Aeropuertos IATA de conexión (sólo Aéreo); NULL = vuelo directo.';

CREATE OR REPLACE FUNCTION public.crear_tarifa_con_recargos_rpc(p_organization_id uuid, p_tarifa jsonb, p_recargos jsonb)
 RETURNS costeo_tarifas
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.costeo_tarifas;
  v_modo text := COALESCE(NULLIF(p_tarifa->>'modo', ''), 'Marítimo');
  v_moneda text := upper(COALESCE(NULLIF(btrim(p_tarifa->>'moneda'), ''), 'USD'));
  v_escalas text[];
BEGIN
  IF v_modo = 'Marítimo' THEN
    v_moneda := 'USD';
  ELSIF v_moneda NOT IN ('USD', 'MXN') THEN
    RAISE EXCEPTION 'Moneda no soportada para tarifa %: %', v_modo, v_moneda USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_tarifa->'escalas') = 'array' THEN
    SELECT array_agg(upper(btrim(e)) ORDER BY o) INTO v_escalas
    FROM jsonb_array_elements_text(p_tarifa->'escalas') WITH ORDINALITY AS x(e, o)
    WHERE btrim(e) <> '';
  END IF;

  INSERT INTO public.costeo_tarifas (
    organization_id, agente_id, naviera_id, ruta_id, tipo_contenedor_id,
    flete_base, dias_libres_demoras, vigente_desde, vigente_hasta,
    transit_time_dias, notas, moneda, estado,
    solicitud_pricing_id, carta_garantia, unidad_flete,
    modo, aeropuerto_origen, aeropuerto_destino, aerolinea,
    origen_cp, destino_cp, origen_ciudad, destino_ciudad, submodalidad, tipo_unidad, minimo, escalas
  ) VALUES (
    p_organization_id,
    NULLIF(p_tarifa->>'agente_id', '')::uuid,
    NULLIF(p_tarifa->>'naviera_id', '')::uuid,
    NULLIF(p_tarifa->>'ruta_id', '')::uuid,
    NULLIF(p_tarifa->>'tipo_contenedor_id', '')::uuid,
    NULLIF(p_tarifa->>'flete_base', '')::numeric,
    COALESCE(NULLIF(p_tarifa->>'dias_libres_demoras', '')::integer, 0),
    NULLIF(p_tarifa->>'vigente_desde', '')::date,
    NULLIF(p_tarifa->>'vigente_hasta', '')::date,
    NULLIF(p_tarifa->>'transit_time_dias', '')::integer,
    NULLIF(p_tarifa->>'notas', ''),
    v_moneda,
    'vigente',
    NULLIF(p_tarifa->>'solicitud_pricing_id', '')::uuid,
    NULLIF(p_tarifa->>'carta_garantia', '')::boolean,
    NULLIF(btrim(COALESCE(p_tarifa->>'unidad_flete', '')), ''),
    v_modo,
    NULLIF(upper(btrim(COALESCE(p_tarifa->>'aeropuerto_origen', ''))), ''),
    NULLIF(upper(btrim(COALESCE(p_tarifa->>'aeropuerto_destino', ''))), ''),
    NULLIF(btrim(COALESCE(p_tarifa->>'aerolinea', '')), ''),
    NULLIF(btrim(COALESCE(p_tarifa->>'origen_cp', '')), ''),
    NULLIF(btrim(COALESCE(p_tarifa->>'destino_cp', '')), ''),
    NULLIF(btrim(COALESCE(p_tarifa->>'origen_ciudad', '')), ''),
    NULLIF(btrim(COALESCE(p_tarifa->>'destino_ciudad', '')), ''),
    NULLIF(p_tarifa->>'submodalidad', ''),
    NULLIF(btrim(COALESCE(p_tarifa->>'tipo_unidad', '')), ''),
    NULLIF(p_tarifa->>'minimo', '')::numeric,
    v_escalas
  )
  RETURNING * INTO v_row;

  INSERT INTO public.costeo_tarifa_recargos (
    tarifa_id, organization_id, concepto, lado, monto, moneda, base, incluido_en_total
  )
  SELECT
    v_row.id, v_row.organization_id, btrim(r->>'concepto'),
    COALESCE(NULLIF(r->>'lado', ''), 'origen'),
    (r->>'monto')::numeric, v_moneda,
    CASE WHEN NULLIF(r->>'base', '') = 'por_embarque' THEN 'por_embarque' ELSE 'por_unidad' END,
    COALESCE((r->>'incluido_en_total')::boolean, true)
  FROM jsonb_array_elements(COALESCE(p_recargos, '[]'::jsonb)) AS r
  WHERE NULLIF(btrim(COALESCE(r->>'concepto', '')), '') IS NOT NULL
    AND COALESCE((r->>'monto')::numeric, 0) > 0;

  INSERT INTO public.costeo_tarifa_tramos (tarifa_id, organization_id, desde_kg, precio)
  SELECT v_row.id, v_row.organization_id, (t->>'desde_kg')::numeric, (t->>'precio')::numeric
  FROM jsonb_array_elements(COALESCE(p_tarifa->'tramos', '[]'::jsonb)) AS t
  WHERE NULLIF(t->>'desde_kg', '') IS NOT NULL AND NULLIF(t->>'precio', '') IS NOT NULL;

  RETURN v_row;
END;
$function$;