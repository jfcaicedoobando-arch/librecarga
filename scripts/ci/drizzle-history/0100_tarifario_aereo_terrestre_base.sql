CREATE TABLE public.aeropuertos (
  iata text PRIMARY KEY CHECK (iata ~ '^[A-Z0-9]{3}$'),
  icao text, nombre text NOT NULL, ciudad text, region text, pais text,
  codigo_pais text, hub_carga boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.aeropuertos TO authenticated;
GRANT ALL ON public.aeropuertos TO service_role;
ALTER TABLE public.aeropuertos ENABLE ROW LEVEL SECURITY;
CREATE POLICY aeropuertos_select_auth ON public.aeropuertos FOR SELECT TO authenticated USING (true);

ALTER TABLE public.costeo_tarifas
  ADD COLUMN modo text NOT NULL DEFAULT 'Marítimo' CHECK (modo IN ('Marítimo','Aéreo','Terrestre')),
  ADD COLUMN aeropuerto_origen text REFERENCES public.aeropuertos(iata),
  ADD COLUMN aeropuerto_destino text REFERENCES public.aeropuertos(iata),
  ADD COLUMN aerolinea text,
  ADD COLUMN origen_cp text CHECK (origen_cp IS NULL OR origen_cp ~ '^[0-9]{5}$'),
  ADD COLUMN destino_cp text CHECK (destino_cp IS NULL OR destino_cp ~ '^[0-9]{5}$'),
  ADD COLUMN origen_ciudad text,
  ADD COLUMN destino_ciudad text,
  ADD COLUMN submodalidad text CHECK (submodalidad IS NULL OR submodalidad IN ('FTL','LTL','Arrastre')),
  ADD COLUMN tipo_unidad text,
  ADD COLUMN minimo numeric(14,2) CHECK (minimo IS NULL OR minimo >= 0);

ALTER TABLE public.costeo_tarifas ALTER COLUMN naviera_id DROP NOT NULL;
ALTER TABLE public.costeo_tarifas ALTER COLUMN ruta_id DROP NOT NULL;
ALTER TABLE public.costeo_tarifas ALTER COLUMN tipo_contenedor_id DROP NOT NULL;

ALTER TABLE public.costeo_tarifas ADD CONSTRAINT costeo_tarifas_campos_por_modo CHECK (
  (modo = 'Marítimo' AND naviera_id IS NOT NULL AND ruta_id IS NOT NULL AND tipo_contenedor_id IS NOT NULL)
  OR (modo = 'Aéreo' AND aeropuerto_origen IS NOT NULL AND aeropuerto_destino IS NOT NULL AND aeropuerto_origen <> aeropuerto_destino)
  OR (modo = 'Terrestre' AND submodalidad IS NOT NULL
      AND (origen_cp IS NOT NULL OR NULLIF(btrim(origen_ciudad),'') IS NOT NULL)
      AND (destino_cp IS NOT NULL OR NULLIF(btrim(destino_ciudad),'') IS NOT NULL))
);

CREATE TABLE public.costeo_tarifa_tramos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarifa_id uuid NOT NULL REFERENCES public.costeo_tarifas(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  desde_kg numeric(12,2) NOT NULL CHECK (desde_kg >= 0),
  precio numeric(14,4) NOT NULL CHECK (precio >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tarifa_id, desde_kg)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.costeo_tarifa_tramos TO authenticated;
GRANT ALL ON public.costeo_tarifa_tramos TO service_role;
ALTER TABLE public.costeo_tarifa_tramos ENABLE ROW LEVEL SECURITY;
CREATE POLICY costeo_tramos_select_org ON public.costeo_tarifa_tramos FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.costeo_tarifas t JOIN public.organization_members m ON m.organization_id = t.organization_id
          WHERE t.id = costeo_tarifa_tramos.tarifa_id AND t.organization_id = costeo_tarifa_tramos.organization_id AND m.user_id = (SELECT auth.uid()))
  AND ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::app_role))) OR public.rls_tenant_scope_ok(organization_id)));
CREATE POLICY costeo_tramos_write_org ON public.costeo_tarifa_tramos FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.costeo_tarifas t JOIN public.organization_members m ON m.organization_id = t.organization_id
          WHERE t.id = costeo_tarifa_tramos.tarifa_id AND t.organization_id = costeo_tarifa_tramos.organization_id AND m.user_id = (SELECT auth.uid())
            AND m.role::text = ANY (ARRAY['admin','admin_org','gerente_operaciones','ejecutivo_pricing','operador','coordinador_logistico']))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.costeo_tarifas t JOIN public.organization_members m ON m.organization_id = t.organization_id
          WHERE t.id = costeo_tarifa_tramos.tarifa_id AND t.organization_id = costeo_tarifa_tramos.organization_id AND m.user_id = (SELECT auth.uid())
            AND m.role::text = ANY (ARRAY['admin','admin_org','gerente_operaciones','ejecutivo_pricing','operador','coordinador_logistico']))
);
CREATE INDEX costeo_tarifa_tramos_tarifa_idx ON public.costeo_tarifa_tramos(tarifa_id);

CREATE OR REPLACE FUNCTION public.crear_tarifa_con_recargos_rpc(p_organization_id uuid, p_tarifa jsonb, p_recargos jsonb)
 RETURNS costeo_tarifas
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.costeo_tarifas;
BEGIN
  INSERT INTO public.costeo_tarifas (
    organization_id, agente_id, naviera_id, ruta_id, tipo_contenedor_id,
    flete_base, dias_libres_demoras, vigente_desde, vigente_hasta,
    transit_time_dias, notas, moneda, estado,
    solicitud_pricing_id, carta_garantia, unidad_flete,
    modo, aeropuerto_origen, aeropuerto_destino, aerolinea,
    origen_cp, destino_cp, origen_ciudad, destino_ciudad, submodalidad, tipo_unidad, minimo
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
    'USD',
    'vigente',
    NULLIF(p_tarifa->>'solicitud_pricing_id', '')::uuid,
    NULLIF(p_tarifa->>'carta_garantia', '')::boolean,
    NULLIF(btrim(COALESCE(p_tarifa->>'unidad_flete', '')), ''),
    COALESCE(NULLIF(p_tarifa->>'modo', ''), 'Marítimo'),
    NULLIF(upper(btrim(COALESCE(p_tarifa->>'aeropuerto_origen', ''))), ''),
    NULLIF(upper(btrim(COALESCE(p_tarifa->>'aeropuerto_destino', ''))), ''),
    NULLIF(btrim(COALESCE(p_tarifa->>'aerolinea', '')), ''),
    NULLIF(btrim(COALESCE(p_tarifa->>'origen_cp', '')), ''),
    NULLIF(btrim(COALESCE(p_tarifa->>'destino_cp', '')), ''),
    NULLIF(btrim(COALESCE(p_tarifa->>'origen_ciudad', '')), ''),
    NULLIF(btrim(COALESCE(p_tarifa->>'destino_ciudad', '')), ''),
    NULLIF(p_tarifa->>'submodalidad', ''),
    NULLIF(btrim(COALESCE(p_tarifa->>'tipo_unidad', '')), ''),
    NULLIF(p_tarifa->>'minimo', '')::numeric
  )
  RETURNING * INTO v_row;

  INSERT INTO public.costeo_tarifa_recargos (
    tarifa_id, organization_id, concepto, lado, monto, moneda, base, incluido_en_total
  )
  SELECT
    v_row.id, v_row.organization_id, btrim(r->>'concepto'),
    COALESCE(NULLIF(r->>'lado', ''), 'origen'),
    (r->>'monto')::numeric, 'USD',
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