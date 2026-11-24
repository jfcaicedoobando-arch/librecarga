-- Remove only the blanket grants added by _ci_post_migrate.sql.
REVOKE EXECUTE ON FUNCTION public._crm_pricing_version_guard() FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._crm_pricing_perdida_guard() FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.crm_pricing_marcar_perdida(uuid,uuid,text) FROM service_role;
REVOKE INSERT, UPDATE, DELETE ON public.crm_pricing_opciones_versiones FROM authenticated;

\ir _ci_check_pricing_fase6_acl.sql
