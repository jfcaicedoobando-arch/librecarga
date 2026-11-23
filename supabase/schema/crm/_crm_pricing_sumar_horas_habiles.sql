CREATE OR REPLACE FUNCTION public._crm_pricing_sumar_horas_habiles(p_inicio timestamptz, p_horas integer)
 RETURNS timestamptz
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
-- Horario hábil de Pricing (America/Mexico_City): L-V 09:00-18:00, sábado 09:00-14:00, domingo cerrado.
DECLARE v_local timestamp; v_rest numeric; v_dow int; v_ab timestamp; v_ci timestamp; v_disp numeric; i int;
BEGIN
  IF p_inicio IS NULL OR p_horas IS NULL THEN RETURN NULL; END IF;
  v_local := p_inicio AT TIME ZONE 'America/Mexico_City';
  v_rest := p_horas * 60;
  FOR i IN 1..500 LOOP
    v_dow := extract(isodow FROM v_local)::int;
    v_ab := date_trunc('day', v_local) + interval '9 hours';
    v_ci := date_trunc('day', v_local) + CASE WHEN v_dow = 6 THEN interval '14 hours' ELSE interval '18 hours' END;
    IF v_dow <> 7 AND v_local < v_ci THEN
      IF v_local < v_ab THEN v_local := v_ab; END IF;
      v_disp := extract(epoch FROM v_ci - v_local) / 60;
      IF v_rest <= v_disp THEN
        RETURN (v_local + make_interval(mins => v_rest::int)) AT TIME ZONE 'America/Mexico_City';
      END IF;
      v_rest := v_rest - v_disp;
    END IF;
    v_local := date_trunc('day', v_local) + interval '1 day';
  END LOOP;
  RAISE EXCEPTION 'LC_PRICING_PLAZO_FUERA_DE_RANGO' USING ERRCODE = 'P0001';
END $function$;
REVOKE ALL ON FUNCTION public._crm_pricing_sumar_horas_habiles(timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._crm_pricing_sumar_horas_habiles(timestamptz, integer) TO authenticated, service_role;
