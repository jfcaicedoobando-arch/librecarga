CREATE OR REPLACE FUNCTION public._cxc_serializar_escritura() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org uuid := CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
BEGIN
  IF EXISTS (SELECT FROM public.cxc_aperturas WHERE organization_id=v_org) THEN
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('cierre-contable:' || v_org::text,0));
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
