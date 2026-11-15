-- Local CI only: real tables, synthetic organizations, all changes rolled back.
BEGIN;
\i supabase/tests/rls/_helpers.sql
DO $test$
DECLARE
  fx record; tenant uuid; table_name text; n integer; changed integer;
  broker_user uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  super_id uuid := gen_random_uuid(); broker_id uuid; empresa_id uuid;
  cliente_id uuid; factura_id uuid; pago_id uuid; comision_id uuid;
  expected_using text; expected_check text;
  tables text[] := ARRAY['crm_brokers','crm_broker_solicitudes','comisiones_broker','liquidaciones_broker'];
BEGIN
  SELECT pg_get_expr(polqual,polrelid), pg_get_expr(polwithcheck,polrelid)
    INTO STRICT expected_using, expected_check FROM pg_policy
    WHERE polrelid='public.comisiones_recuperaciones'::regclass
      AND polname='Scope tenant activo super admin';
  FOREACH table_name IN ARRAY tables LOOP
    SELECT count(*) INTO n FROM pg_policy
      WHERE polrelid=format('public.%I',table_name)::regclass
        AND polname=table_name || '_tenant_restrictive' AND NOT polpermissive
        AND polcmd='*' AND polroles=ARRAY['authenticated'::regrole::oid]
        AND pg_get_expr(polqual,polrelid)=expected_using
        AND pg_get_expr(polwithcheck,polrelid)=expected_check;
    PERFORM pg_temp.assert(n=1, table_name || ': exact Ola16 restriction missing');
    SELECT count(*) INTO n FROM pg_policy
      WHERE polrelid=format('public.%I',table_name)::regclass AND polpermissive
        AND polcmd='r' AND polname=table_name || '_select';
    PERFORM pg_temp.assert(n=1, table_name || ': original read policy missing');
    SELECT count(*) INTO n FROM pg_policy
      WHERE polrelid=format('public.%I',table_name)::regclass AND polpermissive AND polcmd<>'r';
    PERFORM pg_temp.assert(n=0, table_name || ': direct write policy introduced');
  END LOOP;

  SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('BROKER-SCOPE');
  INSERT INTO auth.users(id,email) VALUES
    (broker_user,'scope-broker@test.local'), (outsider,'scope-outsider@test.local'),
    (super_id,'scope-super@test.local');
  INSERT INTO public.user_roles(user_id,role) VALUES (broker_user,'broker'),(super_id,'super_admin');
  FOREACH tenant IN ARRAY ARRAY[fx.org_a,fx.org_b] LOOP
    INSERT INTO public.crm_brokers(organization_id,user_id,nombre,email,comision_pct)
      VALUES(tenant,broker_user,'Scope broker','scope@test.local',5) RETURNING id INTO broker_id;
    INSERT INTO public.crm_empresas(organization_id,nombre)
      VALUES(tenant,'Scope empresa') RETURNING id INTO empresa_id;
    INSERT INTO public.crm_broker_solicitudes(organization_id,broker_id,empresa_id,rol_contacto,relacion,tiempo_cierre)
      VALUES(tenant,broker_id,empresa_id,'Director','Contacto','Un mes');
    INSERT INTO public.liquidaciones_broker(organization_id,broker_id,periodo,total_mxn)
      VALUES(tenant,broker_id,'2026-11',10);
    INSERT INTO public.clientes(organization_id,nombre,email)
      VALUES(tenant,'Scope cliente','scope@test.local') RETURNING id INTO cliente_id;
    INSERT INTO public.facturas(organization_id,cliente_id,cliente_nombre,numero,fecha_emision,
      fecha_vencimiento,moneda,tipo_cambio,subtotal,iva,total,estado)
      VALUES(tenant,cliente_id,'Scope cliente','SCOPE-1',CURRENT_DATE,CURRENT_DATE+30,'MXN',1,100,0,100,'Emitida')
      RETURNING id INTO factura_id;
    INSERT INTO public.pagos_factura(organization_id,factura_id,fecha_pago,monto,moneda,tipo_cambio,
      monto_aplicado_factura,forma_pago,referencia)
      VALUES(tenant,factura_id,CURRENT_DATE,10,'MXN',1,10,'Transferencia','SCOPE') RETURNING id INTO pago_id;
    -- Keep any commission created by the payment trigger; otherwise create a
    -- cancelled row with no seller. Do not disable triggers or foreign keys.
    SELECT id INTO comision_id FROM public.comisiones_devengadas WHERE pago_factura_id=pago_id;
    IF comision_id IS NULL THEN
      INSERT INTO public.comisiones_devengadas(organization_id,pago_factura_id,factura_id,estado)
        VALUES(tenant,pago_id,factura_id,'Cancelada') RETURNING id INTO comision_id;
    END IF;
    INSERT INTO public.comisiones_broker(organization_id,comision_devengada_id,pago_factura_id,factura_id,broker_id)
      VALUES(tenant,comision_id,pago_id,factura_id,broker_id);
  END LOOP;
  -- A foreign broker must never appear in the own-organizations RPC.
  INSERT INTO public.crm_brokers(organization_id,user_id,nombre,email,comision_pct)
    VALUES(fx.org_b,outsider,'Foreign broker','foreign@test.local',5);

  PERFORM pg_temp.as_user(broker_user);
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IN ($1,$2)',table_name)
      INTO n USING fx.org_a,fx.org_b;
    PERFORM pg_temp.assert(n=2, table_name || ': broker lost own cross-org rows or saw foreign rows');
  END LOOP;
  PERFORM pg_temp.assert((SELECT count(*)=2 FROM public.broker_mis_organizaciones()),'own broker organizations RPC changed');
  PERFORM pg_temp.assert((SELECT count(*)=2 FROM public.broker_mis_solicitudes()),'own broker requests RPC changed');
  PERFORM pg_temp.assert((SELECT count(*)=2 FROM public.broker_mis_comisiones()),'own broker commissions RPC changed');
  PERFORM pg_temp.as_user(fx.admin_a);
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IN ($1,$2)',table_name)
      INTO n USING fx.org_a,fx.org_b;
    PERFORM pg_temp.assert(n=1, table_name || ': internal A reader scope changed');
  END LOOP;

  -- Deliberately broad, transaction-only permissive policy isolates the
  -- restrictive boundary even if a future permissive policy expands access.
  PERFORM pg_temp.as_postgres();
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('GRANT UPDATE ON public.%I TO authenticated',table_name);
    EXECUTE format('CREATE POLICY fixture_super_admin ON public.%I AS PERMISSIVE FOR ALL TO authenticated USING (public.has_role(auth.uid(),''super_admin''::public.app_role)) WITH CHECK (public.has_role(auth.uid(),''super_admin''::public.app_role))',table_name);
  END LOOP;
  PERFORM pg_temp.as_user(super_id);
  PERFORM public.set_super_admin_org(NULL);
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IN ($1,$2)',table_name)
      INTO n USING fx.org_a,fx.org_b;
    PERFORM pg_temp.assert(n=0, table_name || ': super admin without active tenant saw rows');
  END LOOP;
  FOREACH tenant IN ARRAY ARRAY[fx.org_a,fx.org_b] LOOP
    PERFORM public.set_super_admin_org(tenant);
    FOREACH table_name IN ARRAY tables LOOP
      EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id=$1',table_name) INTO n USING tenant;
      PERFORM pg_temp.assert(n=CASE WHEN table_name='crm_brokers' AND tenant=fx.org_b THEN 2 ELSE 1 END,
        table_name || ': active tenant positive read control failed');
      EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id<>$1',table_name) INTO n USING tenant;
      PERFORM pg_temp.assert(n=0, table_name || ': super admin saw inactive tenant');
      EXECUTE format('UPDATE public.%I SET organization_id=organization_id WHERE organization_id=$1',table_name) USING tenant;
      GET DIAGNOSTICS changed=ROW_COUNT;
      PERFORM pg_temp.assert(changed=CASE WHEN table_name='crm_brokers' AND tenant=fx.org_b THEN 2 ELSE 1 END,
        table_name || ': active tenant positive update control failed');
      EXECUTE format('UPDATE public.%I SET organization_id=organization_id WHERE organization_id<>$1',table_name) USING tenant;
      GET DIAGNOSTICS changed=ROW_COUNT;
      PERFORM pg_temp.assert(changed=0, table_name || ': updated inactive tenant');
      BEGIN
        EXECUTE format('UPDATE public.%I SET organization_id=$1 WHERE organization_id=$2',table_name)
          USING CASE WHEN tenant=fx.org_a THEN fx.org_b ELSE fx.org_a END,tenant;
        RAISE EXCEPTION 'Inactive tenant move was allowed: %',table_name;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
    END LOOP;
  END LOOP;
  PERFORM pg_temp.as_postgres();
END $test$;
ROLLBACK;
