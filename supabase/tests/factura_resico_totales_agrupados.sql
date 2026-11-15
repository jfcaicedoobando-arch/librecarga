-- Local synthetic invoices; golden totals observed in Facturapi preview, no timbre.
BEGIN;
\ir rls/_helpers.sql
\ir rls/_ci_check_factura_resico_totales_acl.sql
DO $$
DECLARE fx record; cli uuid:=gen_random_uuid(); fac uuid; caso jsonb; linea jsonb;
  doc public.facturas; subtotal numeric; iva numeric; isr numeric; retiva numeric;
  bloqueado boolean; total_anterior numeric;
BEGIN
  SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('RESICO70');
  INSERT INTO public.clientes(id,organization_id,nombre,rfc,email)
    VALUES(cli,fx.org_a,'Fixture RESICO70','EKU9003173C9','resico70@qa.invalid');
  PERFORM pg_temp.as_user(fx.admin_a);
  FOR caso IN SELECT value FROM jsonb_array_elements('[
    {"n":"base10000","total":11475,"sub":10000,"iva":1600,"isr":125,"retiva":0,"lines":[[1,10000,0.16,0.0125,0]]},
    {"n":"precio_exacto","total":115.21,"sub":100.40,"iva":16.06,"isr":1.25,"retiva":0,"lines":[[1,100.3996,0.16,0.0125,0]]},
    {"n":"precio_redondeado","total":115.20,"sub":100.40,"iva":16.06,"isr":1.26,"retiva":0,"lines":[[1,100.40,0.16,0.0125,0]]},
    {"n":"cantidad_fraccionaria","total":115.21,"sub":100.40,"iva":16.06,"isr":1.25,"retiva":0,"lines":[[2.5,40.15984,0.16,0.0125,0]]},
    {"n":"dos_lineas","total":230.42,"sub":200.80,"iva":32.13,"isr":2.51,"retiva":0,"lines":[[1,100.40,0.16,0.0125,0],[1,100.40,0.16,0.0125,0]]},
    {"n":"iva_dos_tasas","total":164.26,"sub":150.12,"iva":16.02,"isr":1.88,"retiva":0,"lines":[[1,50.04,0.16,0.0125,0],[1,100.08,0.08,0.0125,0]]},
    {"n":"isr_dos_tasas","total":110.43,"sub":112.95,"iva":0,"isr":2.52,"retiva":0,"lines":[[1,100.40,0,0.0125,0],[1,12.55,0,0.10,0]]},
    {"n":"isr_y_retiva","total":222.33,"sub":200.75,"iva":32.12,"isr":2.51,"retiva":8.03,"lines":[[1,100.375,0.16,0.0125,0.04],[1,100.375,0.16,0.0125,0.04]]},
    {"n":"subtotal_exact_sum","total":197.51,"sub":200.01,"iva":0,"isr":2.50,"retiva":0,"lines":[[1,100.0049,0,0.0125,0],[1,100.0049,0,0.0125,0]]}
  ]'::jsonb) LOOP
    fac:=gen_random_uuid();
    INSERT INTO public.facturas(id,organization_id,cliente_id,cliente_nombre,numero,fecha_vencimiento)
      VALUES(fac,fx.org_a,cli,'Fixture','RESICO70-'||(caso->>'n'),CURRENT_DATE+30);
    FOR linea IN SELECT value FROM jsonb_array_elements(caso->'lines') LOOP
      INSERT INTO public.conceptos_factura(factura_id,organization_id,descripcion,cantidad,precio_unitario,total,
        tipo_iva,tasa_iva_aplicada,tasa_ret_isr,tasa_ret_iva)
      VALUES(fac,fx.org_a,'QA',(linea->>0)::numeric,(linea->>1)::numeric,
        round((linea->>0)::numeric*(linea->>1)::numeric,2),
        CASE WHEN (linea->>2)::numeric=0 THEN 'tasa_0' WHEN (linea->>2)::numeric=.08 THEN 'gravado_8' ELSE 'gravado_16' END,
        (linea->>2)::numeric,(linea->>3)::numeric,(linea->>4)::numeric);
    END LOOP;
    SELECT * INTO doc FROM public.facturas WHERE id=fac;
    PERFORM pg_temp.assert((doc.subtotal,doc.iva,doc.ret_isr,doc.ret_iva,doc.total)=
      ((caso->>'sub')::numeric,(caso->>'iva')::numeric,(caso->>'isr')::numeric,(caso->>'retiva')::numeric,(caso->>'total')::numeric),
      'Facturapi exact vector: '||(caso->>'n'));
    -- The header guard must not permit stale browser totals to persist.
    UPDATE public.facturas SET total=230.40,subtotal=1,iva=1,ret_isr=0,ret_iva=0 WHERE id=fac;
    SELECT * INTO doc FROM public.facturas WHERE id=fac;
    PERFORM pg_temp.assert(doc.total=(caso->>'total')::numeric,'header guard: '||(caso->>'n'));
    -- Independently verify recalc without relying on the header guard correcting it.
    PERFORM pg_temp.as_postgres();
    ALTER TABLE public.facturas DISABLE TRIGGER trg_facturas_totales_guard;
    PERFORM pg_temp.as_user(fx.admin_a);
    PERFORM public.recalc_factura_totales(fac);
    SELECT * INTO doc FROM public.facturas WHERE id=fac;
    PERFORM pg_temp.assert(doc.total=(caso->>'total')::numeric,'isolated recalc: '||(caso->>'n'));
    PERFORM pg_temp.as_postgres();
    ALTER TABLE public.facturas ENABLE TRIGGER trg_facturas_totales_guard;
    PERFORM pg_temp.as_user(fx.admin_a);
    IF caso->>'n'='dos_lineas' THEN
      PERFORM pg_temp.assert((SELECT sum(monto_ret_isr)=2.52 AND sum(total)=200.80 FROM public.conceptos_factura
        WHERE factura_id=fac),'line amounts/base remain unchanged; document groups round separately');
      UPDATE public.facturas SET estado='Por timbrar',facturapi_id='PENDING:local-fixture' WHERE id=fac;
      PERFORM public.recalc_factura_totales(fac);
      PERFORM pg_temp.assert((SELECT total=230.42 FROM public.facturas WHERE id=fac),'pending claim keeps same mode');
      PERFORM pg_temp.as_postgres();
      bloqueado:=false;
      BEGIN UPDATE public.facturas SET estado='Emitida',total=230.40 WHERE id=fac;
      EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
      PERFORM pg_temp.assert(bloqueado,'transition cannot freeze stale supplied total');
      -- Model a pre-migration stale draft without altering immutable SQL history.
      ALTER TABLE public.facturas DISABLE TRIGGER trg_facturas_totales_guard;
      UPDATE public.facturas SET iva=32.12,ret_isr=2.52,total=230.40 WHERE id=fac;
      ALTER TABLE public.facturas ENABLE TRIGGER trg_facturas_totales_guard;
      bloqueado:=false;
      BEGIN UPDATE public.facturas SET estado='Emitida' WHERE id=fac;
      EXCEPTION WHEN check_violation THEN bloqueado:=true; END;
      PERFORM pg_temp.assert(bloqueado,'state-only transition cannot freeze a stale header');
      UPDATE public.facturas SET total=total WHERE id=fac;
      UPDATE public.facturas SET estado='Emitida' WHERE id=fac;
      PERFORM pg_temp.assert((SELECT (snapshot_emision->>'total')::numeric=230.42 FROM public.facturas WHERE id=fac),'frozen snapshot matches grouped header');
      SELECT total INTO total_anterior FROM public.facturas WHERE id=fac;
      PERFORM public.recalc_factura_totales(fac);
      UPDATE public.facturas SET total=total WHERE id=fac;
      PERFORM pg_temp.assert((SELECT total=total_anterior AND total=230.42 FROM public.facturas WHERE id=fac),'issued header remains immutable');
      PERFORM pg_temp.as_user(fx.admin_a);
    END IF;
  END LOOP;
  PERFORM pg_temp.as_user(fx.admin_b);
  SELECT t.subtotal,t.iva,t.ret_isr,t.ret_iva INTO subtotal,iva,isr,retiva
    FROM public._totales_factura_resico_agrupados(fac) t;
  PERFORM pg_temp.assert((subtotal,iva,isr,retiva)=(0,0,0,0),'helper preserves RLS across organizations');
  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.assert(NOT has_function_privilege('anon','public._totales_factura_resico_agrupados(uuid)','EXECUTE'),'no anonymous helper');
  PERFORM pg_temp.assert(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public._totales_factura_resico_agrupados(uuid)'::regprocedure),'helper stays invoker');
END;
$$;
ROLLBACK;
