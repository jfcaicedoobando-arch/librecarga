-- Espejo canónico de public._lock_cuenta_bancaria (tesorería).
-- Fuente histórica: supabase/migrations/20260917180259_88babe6d-6192-45f7-a8a4-bbcaa0c1493d.sql
-- Seguridad forward: drizzle/migrations/0092_auxiliares_seleccionados_acceso_protegido.sql
-- Ayudante SECURITY DEFINER: toma el candado FOR UPDATE de una cuenta bancaria
-- viva y devuelve org/moneda/activa. Existe porque los roles que sólo pueden
-- LEER cuentas (contador) no pueden bloquear la fila con FOR UPDATE directo:
-- el lock devolvía 0 filas y el pago fallaba con LC_PAGO_CUENTA_INEXISTENTE.
-- Replica las políticas SELECT antes del lock; el llamador valida actividad.
-- Ver supabase/schema/README.md para el flujo obligatorio de este directorio.

-- MNY (Sentry FEATURES_CXP_COMPONENTS_DIALOGREGISTRARPAGOPROVEEDOR_3):
-- `registrar_pago_proveedor_atomico` es SECURITY INVOKER y bloqueaba la cuenta
-- bancaria con `SELECT ... FOR UPDATE`. En `cuentas_bancarias` la política
-- RESTRICTIVE de scope se combina con políticas permisivas que, para el comando
-- UPDATE, sólo cubren admin/admin_org/super_admin y tesorero: un `contador`
-- (escritor financiero legítimo) no podía bloquear la fila, el FOR UPDATE
-- devolvía 0 filas y la RPC concluía LC_PAGO_CUENTA_INEXISTENTE sobre una
-- cuenta que sí existe y está activa.
--
-- Solución: un ayudante SECURITY DEFINER que toma el candado con privilegios
-- del propietario y devuelve org/moneda/activa. La validación de pertenencia y
-- de actividad sigue en el llamador (mismos códigos de error), así que no se
-- abre ningún dato nuevo ni se relaja RLS.
CREATE OR REPLACE FUNCTION public._lock_cuenta_bancaria(p_cuenta_id uuid)
RETURNS TABLE(org_id uuid, moneda_txt text, esta_activa boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

REVOKE ALL ON FUNCTION public._lock_cuenta_bancaria(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._lock_cuenta_bancaria(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._lock_cuenta_bancaria(uuid) TO authenticated, service_role;
