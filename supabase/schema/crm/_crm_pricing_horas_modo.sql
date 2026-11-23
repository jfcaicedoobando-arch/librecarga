CREATE OR REPLACE FUNCTION public._crm_pricing_horas_modo(p_complejidad text, p_servicio text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  -- baja = estándar sin contador; las submodalidades heredan el plazo de su modo.
  SELECT CASE
    WHEN p_complejidad = 'baja' THEN NULL
    WHEN p_servicio = 'Aéreo' THEN CASE WHEN p_complejidad = 'alta' THEN 24 ELSE 12 END
    WHEN p_servicio = 'Terrestre' THEN CASE WHEN p_complejidad = 'alta' THEN 48 ELSE 24 END
    ELSE CASE WHEN p_complejidad = 'alta' THEN 48 ELSE 36 END
  END
$$;
REVOKE ALL ON FUNCTION public._crm_pricing_horas_modo(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._crm_pricing_horas_modo(text, text) TO authenticated, service_role;
