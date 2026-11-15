-- Ejecutar tras el replay y ANTES de _ci_post_migrate.sql: sus GRANT amplios
-- no deben ocultar un permiso faltante en la migración de producto 0066.
BEGIN READ ONLY;
DO $check$
DECLARE
  firma text;
  fn pg_proc%ROWTYPE;
BEGIN
  FOREACH firma IN ARRAY ARRAY[
    'public.facturas_listado_pagina(uuid,text,text,date,date,integer,integer,text)',
    'public.facturas_clientes_listado(uuid)'
  ] LOOP
    SELECT * INTO STRICT fn FROM pg_proc WHERE oid = firma::regprocedure;
    IF fn.prosecdef OR fn.provolatile <> 's'
       OR NOT coalesce(fn.proconfig @> ARRAY['search_path=public'], false) THEN
      RAISE EXCEPTION 'Contrato INVOKER/STABLE/search_path incorrecto: %', firma;
    END IF;
    IF has_function_privilege('anon', fn.oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner)))
         WHERE grantee = 0 AND privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION 'Función accesible a anon/PUBLIC: %', firma;
    END IF;
    IF NOT has_function_privilege('authenticated', fn.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Falta permiso explícito para consumidor de producto: %', firma;
    END IF;
  END LOOP;
END;
$check$;
ROLLBACK;
