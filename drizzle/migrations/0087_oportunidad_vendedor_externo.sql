CREATE OR REPLACE FUNCTION public.crm_oportunidad_vendedor_externo(p_oportunidad_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_op public.crm_oportunidades%ROWTYPE; v_nombre text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_op FROM public.crm_oportunidades WHERE id=p_oportunidad_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Match existing opportunity SELECT policies and the company active-tenant scope.
  IF v_op.organization_id IS DISTINCT FROM public.current_user_org_id()
     OR NOT public.rls_tenant_scope_ok(v_op.organization_id)
     OR NOT (
       public.has_role(auth.uid(),'super_admin'::public.app_role)
       OR public.has_role(auth.uid(),'admin'::public.app_role)
       OR public.has_role(auth.uid(),'admin_org'::public.app_role)
       OR public.has_role(auth.uid(),'gerente_comercial'::public.app_role)
       OR public.has_role(auth.uid(),'operador'::public.app_role)
       OR public.has_role(auth.uid(),'viewer'::public.app_role)
       OR (public.has_role(auth.uid(),'vendedor'::public.app_role) AND v_op.vendedor_id=auth.uid())
     ) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  SELECT string_agg(n.nombre, ', ' ORDER BY n.nombre) INTO v_nombre
  FROM (
    SELECT DISTINCT b.nombre
    FROM public.crm_empresas e
    JOIN public.crm_brokers b ON b.id=e.broker_id AND b.organization_id=e.organization_id
    WHERE e.organization_id=v_op.organization_id AND e.deleted_at IS NULL
      AND (
        EXISTS (SELECT 1 FROM public.crm_oportunidad_empresa oe WHERE oe.oportunidad_id=v_op.id AND oe.empresa_id=e.id)
        OR (v_op.lead_id IS NOT NULL AND e.lead_origen_id=v_op.lead_id)
      )
  ) n;
  RETURN v_nombre;
END;
$function$;
REVOKE ALL ON FUNCTION public.crm_oportunidad_vendedor_externo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_oportunidad_vendedor_externo(uuid) TO authenticated, service_role;