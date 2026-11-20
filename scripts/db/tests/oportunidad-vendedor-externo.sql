-- Prueba focalizada en una base vacía aislada; no ejecutar en producción.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','admin_org','gerente_comercial','operador','viewer','vendedor');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION public.current_user_org_id() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.org',true),'')::uuid $$;
CREATE FUNCTION public.rls_tenant_scope_ok(p_org uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT p_org=public.current_user_org_id() $$;
CREATE FUNCTION public.has_role(p_uid uuid,p_role public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT p_uid=auth.uid() AND p_role::text=current_setting('test.role',true) $$;
CREATE TABLE public.crm_oportunidades(id uuid,organization_id uuid,vendedor_id uuid,lead_id uuid,deleted_at timestamptz);
CREATE TABLE public.crm_empresas(id uuid,organization_id uuid,broker_id uuid,lead_origen_id uuid,deleted_at timestamptz);
CREATE TABLE public.crm_brokers(id uuid,organization_id uuid,nombre text);
CREATE TABLE public.crm_oportunidad_empresa(oportunidad_id uuid,empresa_id uuid);
\ir ../../../drizzle/migrations/0088_oportunidad_vendedor_externo_guard_null.sql
SELECT set_config('test.uid','00000000-0000-0000-0000-000000000001',false);
SELECT set_config('test.org','00000000-0000-0000-0000-000000000002',false);
SELECT set_config('test.role','vendedor',false);
INSERT INTO public.crm_oportunidades VALUES
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006',null);
INSERT INTO public.crm_brokers VALUES ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','Broker de prueba');
INSERT INTO public.crm_empresas VALUES ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000006',null);
DO $$ BEGIN
 IF public.crm_oportunidad_vendedor_externo('00000000-0000-0000-0000-000000000003') IS DISTINCT FROM 'Broker de prueba' THEN RAISE EXCEPTION 'Debe resolver broker desde lead de origen'; END IF;
END $$;
UPDATE public.crm_oportunidades SET lead_id=null;
INSERT INTO public.crm_oportunidad_empresa VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000005');
DO $$ BEGIN
 IF public.crm_oportunidad_vendedor_externo('00000000-0000-0000-0000-000000000003') IS DISTINCT FROM 'Broker de prueba' THEN RAISE EXCEPTION 'Debe resolver broker desde vínculo'; END IF;
END $$;
UPDATE public.crm_empresas SET broker_id=null;
DO $$ BEGIN
 IF public.crm_oportunidad_vendedor_externo('00000000-0000-0000-0000-000000000003') IS NOT NULL THEN RAISE EXCEPTION 'Sin broker debe quedar vacío'; END IF;
END $$;
UPDATE public.crm_oportunidades SET vendedor_id=null;
DO $$ BEGIN
 BEGIN
  PERFORM public.crm_oportunidad_vendedor_externo('00000000-0000-0000-0000-000000000003');
  RAISE EXCEPTION 'Debe rechazar vendedor sin asignación';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE public.crm_oportunidades SET vendedor_id='00000000-0000-0000-0000-000000000009';
DO $$ BEGIN
 BEGIN
  PERFORM public.crm_oportunidad_vendedor_externo('00000000-0000-0000-0000-000000000003');
  RAISE EXCEPTION 'Debe rechazar oportunidad de otro vendedor';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('test.role','admin_org',false);
SELECT set_config('test.org','00000000-0000-0000-0000-000000000009',false);
DO $$ BEGIN
 BEGIN
  PERFORM public.crm_oportunidad_vendedor_externo('00000000-0000-0000-0000-000000000003');
  RAISE EXCEPTION 'Debe rechazar empresa ajena';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
DO $$ BEGIN
 IF has_function_privilege('anon','public.crm_oportunidad_vendedor_externo(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anon no debe consultar'; END IF;
END $$;