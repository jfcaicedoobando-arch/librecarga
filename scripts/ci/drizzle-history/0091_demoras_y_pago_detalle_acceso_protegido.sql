ALTER FUNCTION public.pago_detalle(text,uuid) SECURITY INVOKER;
DO $reviewed$
DECLARE
 v_definition text;
 v_old constant text := '  SELECT * INTO v_embarque FROM public.embarques WHERE id = p_embarque_id;';
 v_new constant text := $guard$  -- Same SELECT audience and restrictive tenant rule as public.embarques RLS.
  -- Filter before reading the shipment or touching generated financial concepts.
  SELECT * INTO v_embarque FROM public.embarques e
  WHERE e.id = p_embarque_id AND auth.uid() IS NOT NULL
    AND (NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
         OR public.rls_tenant_scope_ok(e.organization_id))
    AND (
      ((e.organization_id = public.current_user_org_id()
        OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
       AND public.has_any_role(auth.uid(), ARRAY['viewer']::public.app_role[]))
      OR (e.deleted_at IS NULL AND public.has_role(auth.uid(), 'cliente'::public.app_role)
          AND e.cliente_id IN (SELECT public.current_user_client_ids()))
      OR (public.has_role(auth.uid(), 'agente_carga'::public.app_role)
          AND e.organization_id = public.current_agente_org()
          AND e.agente_id IS NOT NULL AND e.agente_id = public.current_agente_id())
    );$guard$;
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.calcular_demoras_embarque(uuid)'::regprocedure) IS DISTINCT FROM '100b7f480be4fccb8410fed2d7e2a18e' THEN
   RAISE EXCEPTION 'El cálculo de demoras cambió; requiere nueva revisión';
 END IF;
 v_definition := pg_get_functiondef('public.calcular_demoras_embarque(uuid)'::regprocedure);
 IF strpos(v_definition,v_old)=0 OR (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
   RAISE EXCEPTION 'La lectura de demoras cambió; requiere nueva revisión';
 END IF;
 EXECUTE replace(v_definition,v_old,v_new);
END $reviewed$;
REVOKE EXECUTE ON FUNCTION public.calcular_demoras_embarque(uuid),public.pago_detalle(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.calcular_demoras_embarque(uuid),public.pago_detalle(text,uuid) TO authenticated,service_role;