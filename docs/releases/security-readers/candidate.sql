-- CANDIDATA NO APLICADA. Revisar review.md y la huella de Pricing antes de registrar.
DO $$ BEGIN RAISE EXCEPTION 'Candidata bloqueada: requiere revisión de Pricing y autorización de aplicación'; END $$;

CREATE OR REPLACE FUNCTION public.get_user_org_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;

ALTER FUNCTION public.libro_pagos(date,date,uuid) SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.calcular_demoras_embarque(p_embarque_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;

REVOKE EXECUTE ON FUNCTION public.get_user_org_ids(uuid), public.libro_pagos(date,date,uuid), public.calcular_demoras_embarque(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids(uuid), public.libro_pagos(date,date,uuid), public.calcular_demoras_embarque(uuid) TO authenticated, service_role;
