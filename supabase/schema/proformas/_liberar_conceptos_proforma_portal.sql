-- Called only after a portal responder has authorized and recorded a rejection.
CREATE OR REPLACE FUNCTION public._liberar_conceptos_proforma_portal(p_proforma_id uuid, p_org_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_liberados integer;
  v_bypass_prev text := COALESCE(current_setting('app.bypass_cierre', true), '');
BEGIN
  INSERT INTO public.proforma_liberaciones_portal (proforma_id, organization_id, transaccion)
    VALUES (p_proforma_id, p_org_id, txid_current());
  PERFORM set_config('app.bypass_cierre', 'on', true);
  v_liberados := public.liberar_conceptos_de_proforma(p_proforma_id);
  PERFORM set_config('app.bypass_cierre', v_bypass_prev, true);
  DELETE FROM public.proforma_liberaciones_portal WHERE proforma_id = p_proforma_id AND transaccion = txid_current();
  RETURN v_liberados;
END;
$$;
