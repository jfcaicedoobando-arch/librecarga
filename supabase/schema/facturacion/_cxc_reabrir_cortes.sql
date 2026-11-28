CREATE OR REPLACE FUNCTION public._cxc_reabrir_cortes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := OLD.organization_id;
  v_fecha date;
BEGIN
  IF OLD.categoria<>'contabilidad' OR OLD.clave<>'cierre_periodo_fecha' THEN RETURN NULL; END IF;
  IF TG_OP='UPDATE' AND NEW.categoria='contabilidad' AND NEW.clave='cierre_periodo_fecha' THEN
    v_fecha := (NEW.valor #>> '{}')::date;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cierre-contable:' || v_org::text,0));
  UPDATE public.cxc_cortes SET reabierto_en=now()
    WHERE organization_id=v_org AND reabierto_en IS NULL AND (v_fecha IS NULL OR fecha>v_fecha);
  RETURN NULL;
END;
$$;
