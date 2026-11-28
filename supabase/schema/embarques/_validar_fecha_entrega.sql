CREATE OR REPLACE FUNCTION public._validar_fecha_entrega(p_fecha date, p_llegada date)
RETURNS void LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
BEGIN
  IF p_fecha IS NULL OR p_fecha > public.fecha_negocio_mx()
     OR p_fecha < p_llegada OR NOT isfinite(p_fecha) THEN
    RAISE EXCEPTION 'Captura una fecha efectiva válida, entre la llegada real y el día de negocio.';
  END IF;
END;
$$;
