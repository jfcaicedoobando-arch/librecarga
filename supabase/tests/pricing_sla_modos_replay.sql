-- Verifica la definición efectiva tras aplicar 0095–0098 en el replay aislado.
BEGIN READ ONLY;

DO $$
DECLARE
  firma regprocedure;
  catalogo record;
BEGIN
  FOR catalogo IN
    SELECT * FROM (VALUES
      ('public._crm_pricing_sumar_horas_habiles(timestamptz,integer)', false, 's', true),
      ('public._crm_pricing_horas_modo(text,text)', false, 'i', true),
      ('public.crm_enviar_solicitud_pricing(uuid)', true, 'v', true),
      ('public.crm_pricing_ampliar_plazo(uuid,integer,text)', true, 'v', false),
      ('public.crm_pricing_cambiar_complejidad(uuid,text,text)', true, 'v', false)
    ) AS esperado(firma, definer, volatilidad, servicio_explicito)
  LOOP
    firma := to_regprocedure(catalogo.firma);
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = firma
        AND p.prosecdef = catalogo.definer AND p.provolatile::text = catalogo.volatilidad
        AND p.proconfig = ARRAY['search_path=public']
        AND NOT EXISTS (
          SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
        )
    ) OR has_function_privilege('anon', firma, 'EXECUTE')
      OR NOT has_function_privilege('authenticated', firma, 'EXECUTE')
      OR (catalogo.servicio_explicito AND NOT has_function_privilege('service_role', firma, 'EXECUTE')) THEN
      RAISE EXCEPTION 'Firma, autoridad o ACL de Pricing incorrecta: %', catalogo.firma;
    END IF;
  END LOOP;

  IF public._crm_pricing_sumar_horas_habiles('2026-11-20 17:00 America/Mexico_City'::timestamptz, 3)
       IS DISTINCT FROM '2026-11-21 11:00 America/Mexico_City'::timestamptz
    OR public._crm_pricing_horas_modo('media', 'Aéreo') IS DISTINCT FROM 12
    OR public._crm_pricing_horas_modo('alta', 'Terrestre') IS DISTINCT FROM 48
    OR public._crm_pricing_horas_modo('media', 'Marítimo') IS DISTINCT FROM 36
    OR public._crm_pricing_horas_modo('baja', 'Marítimo') IS NOT NULL THEN
    RAISE EXCEPTION 'El replay de Pricing no conserva las horas hábiles y plazos por modo';
  END IF;

  IF (SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.crm_solicitudes_pricing'::regclass AND contype = 'c' AND convalidated
      AND conname IN (
        'crm_solicitudes_pricing_submodalidad_chk', 'crm_solicitudes_pricing_incoterm_check',
        'crm_solicitudes_pricing_volumen_cbm_check', 'crm_solicitudes_pricing_imo_clase_check',
        'crm_solicitudes_pricing_imo_un_check', 'crm_solicitudes_pricing_modalidad_negocio_check'
      )) <> 6 THEN
    RAISE EXCEPTION 'Faltan restricciones validadas de la solicitud de Pricing';
  END IF;
END $$;

ROLLBACK;
