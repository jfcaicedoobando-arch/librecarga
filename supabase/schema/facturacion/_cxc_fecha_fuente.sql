CREATE OR REPLACE FUNCTION public._cxc_fecha_fuente(p_fuente text,p_dato jsonb)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT (CASE WHEN p_fuente='facturas' THEN p_dato->>'emision' ELSE p_dato->>'fecha' END)::date;
$$;
