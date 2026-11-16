CREATE OR REPLACE FUNCTION public._isr_documento_habilitado(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.configuracion WHERE organization_id=p_org_id
    AND categoria='facturacion' AND clave='isr_resico_automatico' AND valor='true'::jsonb);
$$;
