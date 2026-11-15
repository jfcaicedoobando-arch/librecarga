-- Ejecutar exclusivamente en PostgreSQL aislado. Incluye controles negativos de permisos.
BEGIN;
\ir _helpers.sql
\ir _ci_check_perfil_fiscal_acl.sql

DO $$
DECLARE
  org_a uuid := gen_random_uuid(); org_b uuid := gen_random_uuid();
  admin_a uuid := gen_random_uuid(); admin_b uuid := gen_random_uuid(); operador uuid := gen_random_uuid();
  empleado_a uuid := gen_random_uuid(); super_admin uuid := gen_random_uuid();
  stamp_b timestamptz; perfil_b uuid;
  perfil uuid; perfil_nuevo uuid; stamp timestamptz; resultado jsonb; permitido boolean;
  datos jsonb := '{"facturapi_org_id":"org-fiscal-a","rfc":"GODE561231GR8","razon_social":"Emisor QA","regimen_fiscal":"626","codigo_postal":"01000"}';
BEGIN
  ALTER TABLE auth.users DISABLE TRIGGER USER;
  INSERT INTO auth.users(id, email) VALUES (admin_a, 'perfil-a@qa.invalid'), (admin_b, 'perfil-b@qa.invalid'), (operador, 'perfil-op@qa.invalid'), (empleado_a, 'perfil-empleado@qa.invalid'), (super_admin, 'perfil-super@qa.invalid');
  ALTER TABLE auth.users ENABLE TRIGGER USER;
  INSERT INTO public.organizations(id, nombre) VALUES (org_a, 'Perfil fiscal QA A'), (org_b, 'Perfil fiscal QA B');
  INSERT INTO public.organization_members(organization_id, user_id, role)
    VALUES (org_a, admin_a, 'contador'), (org_b, admin_b, 'admin_org'), (org_a, operador, 'coordinador_logistico'), (org_a, empleado_a, 'admin_org');
  INSERT INTO public.user_roles(user_id, role) VALUES (admin_a, 'contador'), (admin_b, 'admin_org'), (operador, 'coordinador_logistico'), (empleado_a, 'admin_org'), (super_admin, 'super_admin')
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.configuracion(organization_id, categoria, clave, valor) VALUES (org_a, 'empresa', 'rfc', '"GODE561231GR8"')
    ON CONFLICT (organization_id, categoria, clave) DO UPDATE SET valor = EXCLUDED.valor;
  INSERT INTO public.facturapi_credenciales(organization_id, ambiente, facturapi_org_id, updated_at)
    VALUES (org_a, 'sandbox', 'org-fiscal-a', clock_timestamp())
    ON CONFLICT (organization_id) DO UPDATE SET facturapi_org_id = EXCLUDED.facturapi_org_id, updated_at = EXCLUDED.updated_at;
  SELECT updated_at INTO stamp FROM public.facturapi_credenciales WHERE organization_id = org_a;

  PERFORM pg_temp.assert(NOT has_function_privilege('anon', 'public.obtener_perfil_fiscal_emisor(uuid,text)', 'EXECUTE'), 'anon sin consulta fiscal');
  PERFORM pg_temp.assert(NOT has_function_privilege('authenticated', 'public.registrar_perfil_fiscal_emisor(uuid,text,uuid,timestamptz,integer,jsonb)', 'EXECUTE'), 'importación reservada al servidor');
  PERFORM pg_temp.assert(NOT has_table_privilege('authenticated', 'public.perfiles_fiscales_emisor', 'UPDATE'), 'sin edición directa del perfil');

  PERFORM pg_temp.as_user_rpc_interna(admin_a);
  perfil := public.registrar_perfil_fiscal_emisor(org_a, 'sandbox', admin_a, stamp, 0, datos);
  PERFORM pg_temp.as_user(admin_a);
  resultado := public.obtener_perfil_fiscal_emisor(org_a, 'sandbox');
  PERFORM pg_temp.assert(resultado->>'estado' = 'sin_confirmar', 'sincronizar no confirma');
  PERFORM pg_temp.assert(resultado#>>'{perfil,tipo_persona}' = 'fisica', 'tipo de persona desde RFC válido');
  PERFORM pg_temp.assert(resultado#>>'{perfil,regimen_fiscal}' = '626', 'régimen importado');
  PERFORM pg_temp.assert(NOT (resultado->'perfil' ? 'credenciales_actualizadas_at'), 'no expone metadata de conexión');
  PERFORM pg_temp.assert(public.obtener_perfil_fiscal_emisor(org_a, 'live')->>'estado' = 'sin_sincronizar', 'sandbox no configura producción');

  resultado := public.confirmar_perfil_fiscal_emisor(org_a, 'sandbox', perfil, '2026-01-01');
  PERFORM pg_temp.assert(resultado->>'estado' = 'confirmado', 'confirmación explícita');
  PERFORM pg_temp.assert(resultado#>>'{perfil,confirmado_por}' = admin_a::text, 'atribución de confirmación');

  PERFORM pg_temp.as_user(empleado_a);
  resultado := public.obtener_perfil_fiscal_emisor(org_a, 'sandbox');
  PERFORM pg_temp.assert(resultado#>>'{perfil,id}' = perfil::text, 'empleados autorizados comparten el perfil de su organización');
  PERFORM pg_temp.assert(resultado->>'estado' = 'confirmado', 'confirmación compartida por organización');

  PERFORM pg_temp.as_user(admin_b);
  PERFORM pg_temp.assert((SELECT count(*) FROM public.perfiles_fiscales_emisor WHERE organization_id = org_a) = 0, 'RLS oculta la otra org');
  permitido := false;
  BEGIN PERFORM public.obtener_perfil_fiscal_emisor(org_a, 'sandbox'); permitido := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.assert(NOT permitido, 'RPC bloquea consulta cruzada');
  permitido := false;
  BEGIN PERFORM public.confirmar_perfil_fiscal_emisor(org_a, 'sandbox', perfil); permitido := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.assert(NOT permitido, 'RPC bloquea confirmación cruzada');

  PERFORM pg_temp.as_user(operador);
  permitido := false;
  BEGIN PERFORM public.obtener_perfil_fiscal_emisor(org_a, 'sandbox'); permitido := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.assert(NOT permitido, 'operador no administra perfil');

  PERFORM pg_temp.as_user_rpc_interna(admin_a);
  permitido := false;
  BEGIN PERFORM public.registrar_perfil_fiscal_emisor(org_a, 'sandbox', operador, stamp, 1, datos); permitido := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.assert(NOT permitido, 'servidor revalida al actor');
  permitido := false;
  BEGIN PERFORM public.registrar_perfil_fiscal_emisor(org_a, 'sandbox', admin_a, stamp, 0, datos); permitido := true;
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  PERFORM pg_temp.assert(NOT permitido, 'respuesta antigua no pisa una versión nueva');
  permitido := false;
  BEGIN PERFORM public.registrar_perfil_fiscal_emisor(org_a, 'sandbox', admin_a, stamp - interval '1 second', 1, datos); permitido := true;
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  PERFORM pg_temp.assert(NOT permitido, 'rotación concurrente de credenciales bloqueada');

  perfil_nuevo := public.registrar_perfil_fiscal_emisor(org_a, 'sandbox', admin_a, stamp, 1, datos || '{"regimen_fiscal":"612"}');
  PERFORM pg_temp.as_user(admin_a);
  PERFORM pg_temp.assert(public.obtener_perfil_fiscal_emisor(org_a, 'sandbox')->>'estado' = 'sin_confirmar', 'nuevo perfil requiere confirmación');
  PERFORM pg_temp.assert((SELECT regimen_fiscal FROM public.perfiles_fiscales_emisor WHERE id = perfil) = '626', 'historial inalterado');
  permitido := false;
  BEGIN PERFORM public.confirmar_perfil_fiscal_emisor(org_a, 'sandbox', perfil); permitido := true;
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  PERFORM pg_temp.assert(NOT permitido, 'no confirma versión anterior');

  PERFORM pg_temp.as_postgres();
  UPDATE public.configuracion SET valor = '"EKU9003173C9"' WHERE organization_id = org_a AND categoria = 'empresa' AND clave = 'rfc';
  PERFORM pg_temp.as_user(admin_a);
  resultado := public.obtener_perfil_fiscal_emisor(org_a, 'sandbox');
  PERFORM pg_temp.assert(resultado->'problemas' ? 'rfc_empresa_discordante', 'RFC se revalida al consultar');
  permitido := false;
  BEGIN PERFORM public.confirmar_perfil_fiscal_emisor(org_a, 'sandbox', perfil_nuevo); permitido := true;
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM pg_temp.assert(NOT permitido, 'discordancia impide confirmación');

  PERFORM pg_temp.as_user_rpc_interna(admin_a);
  PERFORM public.registrar_perfil_fiscal_emisor(org_a, 'live', admin_a, stamp, 0,
    '{"facturapi_org_id":"org-distinta","rfc":"XAXX010101000"}');
  PERFORM pg_temp.as_user(admin_a);
  resultado := public.obtener_perfil_fiscal_emisor(org_a, 'live');
  PERFORM pg_temp.assert(resultado->'problemas' ? 'organizacion_discordante', 'no sustituye ID vinculado');
  PERFORM pg_temp.assert(resultado->'problemas' ? 'rfc_invalido', 'RFC genérico no se clasifica como PF');
  PERFORM pg_temp.assert(resultado->'problemas' ? 'regimen_invalido', 'no infiere régimen faltante');
  PERFORM pg_temp.as_postgres();

  INSERT INTO public.configuracion(organization_id, categoria, clave, valor)
    VALUES (org_b, 'empresa', 'rfc', '"EKU9003173C9"')
    ON CONFLICT (organization_id, categoria, clave) DO UPDATE SET valor = EXCLUDED.valor;
  INSERT INTO public.facturapi_credenciales(organization_id, ambiente, facturapi_org_id)
    VALUES (org_b, 'sandbox', 'org-fiscal-b')
    ON CONFLICT (organization_id) DO UPDATE SET facturapi_org_id = EXCLUDED.facturapi_org_id
    RETURNING updated_at INTO stamp_b;
  PERFORM pg_temp.as_user_rpc_interna(admin_b);
  perfil_b := public.registrar_perfil_fiscal_emisor(org_b, 'sandbox', admin_b, stamp_b, 0,
    datos || '{"facturapi_org_id":"org-fiscal-b","rfc":"EKU9003173C9","regimen_fiscal":"601"}');
  PERFORM pg_temp.as_user(admin_b);
  resultado := public.confirmar_perfil_fiscal_emisor(org_b, 'sandbox', perfil_b);
  PERFORM pg_temp.assert(resultado->>'estado' = 'confirmado', 'segunda organización confirma su emisor independiente');
  PERFORM pg_temp.assert(resultado#>>'{perfil,tipo_persona}' = 'moral', 'persona moral independiente');

  PERFORM pg_temp.as_user(super_admin);
  PERFORM pg_temp.assert((SELECT count(*) FROM public.perfiles_fiscales_emisor) = 0,
    'superadmin sin tenant activo no lee perfiles');
  permitido := false;
  BEGIN PERFORM public.obtener_perfil_fiscal_emisor(org_b, 'sandbox'); permitido := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.assert(NOT permitido, 'superadmin sin tenant no consulta RPC');
  PERFORM public.set_super_admin_org(org_a);
  PERFORM pg_temp.assert((SELECT count(*) FROM public.perfiles_fiscales_emisor WHERE organization_id = org_a) > 0,
    'superadmin lee sólo tenant activo A');
  PERFORM pg_temp.assert((SELECT count(*) FROM public.perfiles_fiscales_emisor WHERE organization_id = org_b) = 0,
    'superadmin no lee tenant B');
  permitido := false;
  BEGIN PERFORM public.confirmar_perfil_fiscal_emisor(org_b, 'sandbox', perfil_b); permitido := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.assert(NOT permitido, 'superadmin no confirma tenant distinto');
  PERFORM public.set_super_admin_org(org_b);
  resultado := public.obtener_perfil_fiscal_emisor(org_b, 'sandbox');
  PERFORM pg_temp.assert(resultado#>>'{perfil,id}' = perfil_b::text, 'cambiar tenant selecciona otro emisor');
  PERFORM pg_temp.assert((SELECT count(*) FROM public.perfiles_fiscales_emisor WHERE organization_id = org_a) = 0,
    'tenant anterior queda oculto');

  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert((SELECT count(*) FROM public.perfiles_fiscales_emisor) = 0, 'JWT sin identidad no lee perfiles');
  permitido := false;
  BEGIN PERFORM public.obtener_perfil_fiscal_emisor(org_a, 'sandbox'); permitido := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.assert(NOT permitido, 'JWT sin identidad no consulta RPC');
  PERFORM pg_temp.as_postgres();
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('role', 'anon', true);
  permitido := false;
  BEGIN PERFORM 1 FROM public.perfiles_fiscales_emisor; permitido := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.assert(NOT permitido, 'anon no tiene SELECT de perfiles');
  permitido := false;
  BEGIN PERFORM public.obtener_perfil_fiscal_emisor(org_a, 'sandbox'); permitido := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.assert(NOT permitido, 'anon no ejecuta consulta fiscal');
  PERFORM pg_temp.as_postgres();
END;
$$;
ROLLBACK;
