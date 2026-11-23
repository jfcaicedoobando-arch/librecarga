-- Sólo cuatro avisos seleccionados; no cambia importes ni permisos de los llamadores.
DO $review$ BEGIN
 IF md5(pg_get_functiondef('public._lock_cuenta_bancaria(uuid)'::regprocedure)) <> '97a8259756d5cb71efa5d5b23942567d' THEN RAISE EXCEPTION 'La definición revisada cambió: _lock_cuenta_bancaria'; END IF;
 IF md5(pg_get_functiondef('public._cxp_desvincular_por_rechazo(uuid,text)'::regprocedure)) <> '01ff07d48c12e3a20ab2cfc0457eb6be' THEN RAISE EXCEPTION 'La definición revisada cambió: _cxp_desvincular_por_rechazo'; END IF;
 IF md5(pg_get_functiondef('public.calcular_costo_demoras(uuid,uuid,integer)'::regprocedure)) <> '1472530226eea2c8dbeb5aacb7cccd4f' THEN RAISE EXCEPTION 'La definición revisada cambió: calcular_costo_demoras'; END IF;
 IF md5(pg_get_functiondef('public.resolver_producto_sat(uuid,text)'::regprocedure)) <> 'd5d2ec5c3c2d8307aaf99cd409b39a3e' THEN RAISE EXCEPTION 'La definición revisada cambió: resolver_producto_sat'; END IF;
END $review$;

CREATE OR REPLACE FUNCTION public._lock_cuenta_bancaria(p_cuenta_id uuid)
 RETURNS TABLE(org_id uuid, moneda_txt text, esta_activa boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_cuenta_id IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT cb.organization_id, cb.moneda::text, cb.activa
      FROM public.cuentas_bancarias cb
     WHERE cb.id = p_cuenta_id
       AND cb.deleted_at IS NULL
       AND (
         auth.role() = 'service_role'
         OR (
           auth.uid() IS NOT NULL
           AND (NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
                OR public.rls_tenant_scope_ok(cb.organization_id))
           AND (
             ((cb.organization_id = public.current_user_org_id()
               OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
              AND (public.has_role(auth.uid(), 'admin'::public.app_role)
                   OR public.has_role(auth.uid(), 'admin_org'::public.app_role)
                   OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
             OR (cb.organization_id = public.current_user_org_id()
                 AND (public.has_role(auth.uid(), 'tesorero'::public.app_role)
                      OR public.has_role(auth.uid(), 'contador'::public.app_role)))
           )
         )
       )
     FOR UPDATE;
END;
$function$;

ALTER FUNCTION public.calcular_costo_demoras(uuid,uuid,integer) SECURITY INVOKER;
ALTER FUNCTION public.resolver_producto_sat(uuid,text) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public._cxp_desvincular_por_rechazo(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._cxp_desvincular_por_rechazo(uuid,text) TO service_role;