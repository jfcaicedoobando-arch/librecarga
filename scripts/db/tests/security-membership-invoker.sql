-- Ejecutar en base aislada. Verifica la consulta real bajo permisos del usuario.
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE public.organization_members(organization_id uuid,user_id uuid);
GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
GRANT SELECT ON public.organization_members TO authenticated,service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_membership ON public.organization_members FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE OR REPLACE FUNCTION public.get_user_org_ids(_user_id uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO public AS $$ SELECT organization_id FROM public.organization_members WHERE user_id=_user_id; $$;
REVOKE ALL ON FUNCTION public.get_user_org_ids(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids(uuid) TO authenticated,service_role;
INSERT INTO public.organization_members VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');
SELECT set_config('test.uid','00000000-0000-0000-0000-000000000002',false);
SET ROLE authenticated;
DO $$ BEGIN
 IF (SELECT array_agg(x) FROM public.get_user_org_ids('00000000-0000-0000-0000-000000000002') x) IS DISTINCT FROM ARRAY['00000000-0000-0000-0000-000000000001'::uuid] THEN RAISE EXCEPTION 'Debe conservar membresía propia'; END IF;
 IF EXISTS(SELECT 1 FROM public.get_user_org_ids('00000000-0000-0000-0000-000000000004')) THEN RAISE EXCEPTION 'No puede consultar membresía ajena'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.get_user_org_ids(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anon no debe consultar'; END IF;
END $$;
SELECT '3 casos de membresías correctos' AS resultado;