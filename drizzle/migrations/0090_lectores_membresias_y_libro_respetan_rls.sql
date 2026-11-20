ALTER FUNCTION public.get_user_org_ids(uuid) SECURITY INVOKER;
ALTER FUNCTION public.libro_pagos(date,date,uuid) SECURITY INVOKER;
DO $reviewed$
DECLARE v_def text; v_old constant text := '{"config":["search_path=public"],"signature":"get_user_org_ids(uuid)","source_md5":"a14933dceef9739a9e351dbdfcf4ea7c","volatility":"s","security_definer":true}';
 v_new constant text := '{"config":["search_path=public"],"signature":"get_user_org_ids(uuid)","source_md5":"a14933dceef9739a9e351dbdfcf4ea7c","volatility":"s","security_definer":false}';
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.get_user_org_ids(uuid)'::regprocedure) IS DISTINCT FROM 'a14933dceef9739a9e351dbdfcf4ea7c' THEN
   RAISE EXCEPTION 'El auxiliar de organizaciones cambió; requiere nueva revisión';
 END IF;
 v_def := pg_get_functiondef('public.crm_vincular_cotizacion_cliente_pricing(uuid,uuid,uuid,uuid)'::regprocedure);
 IF strpos(v_def,v_old)=0 OR (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 THEN
   RAISE EXCEPTION 'La huella de Pricing cambió; requiere nueva revisión';
 END IF;
 EXECUTE replace(v_def,v_old,v_new);
END $reviewed$;
REVOKE EXECUTE ON FUNCTION public.get_user_org_ids(uuid),public.libro_pagos(date,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids(uuid),public.libro_pagos(date,date,uuid) TO authenticated,service_role;