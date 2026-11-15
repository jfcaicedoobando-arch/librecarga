BEGIN;
\i supabase/tests/rls/_helpers.sql
DO $fixture$
DECLARE
  fx record;
  cli_a uuid := gen_random_uuid();
  cli_b uuid := gen_random_uuid();
  sin_membresia uuid := gen_random_uuid();
  resultado jsonb;
BEGIN
  SELECT * INTO STRICT fx FROM pg_temp.seed_org_pair('FACTURAS-FILTROS');
  INSERT INTO public.clientes(id, organization_id, nombre, email) VALUES
    (cli_a, fx.org_a, 'Cliente actual A', 'filtros-a@example.invalid'),
    (cli_b, fx.org_b, 'Cliente B', 'filtros-b@example.invalid');
  INSERT INTO public.facturas(organization_id, cliente_id, cliente_nombre, numero,
    fecha_emision, fecha_vencimiento, moneda, tipo_cambio, subtotal, iva, total, estado, created_at)
  SELECT fx.org_a, cli_a, 'Reciente', 'F-NUEVA-' || n, DATE '2026-11-01', DATE '2026-12-01',
    'MXN', 1, 100, 0, 100, 'Borrador', '2026-11-01'::timestamptz + n * INTERVAL '1 second'
  FROM generate_series(1, 105) n;
  INSERT INTO public.facturas(organization_id, cliente_id, cliente_nombre, numero,
    fecha_emision, fecha_vencimiento, moneda, tipo_cambio, subtotal, iva, total, estado, created_at)
  VALUES
    (fx.org_a, cli_a, 'Histórico', 'F-ANTIGUA', '2026-10-01', '2026-11-01', 'MXN', 1, 100, 0, 100, 'Borrador', '2026-10-01'),
    (fx.org_a, cli_a, 'Histórico ampliado', 'F-OTRA', '2026-10-01', '2026-11-01', 'MXN', 1, 100, 0, 100, 'Borrador', '2026-10-01'),
    (fx.org_b, cli_b, 'Ajeno', 'F-OTRA-ORG', '2026-10-01', '2026-11-01', 'MXN', 1, 100, 0, 100, 'Borrador', '2026-10-01');
  -- Insertar la baja como fixture evita ejercitar el flujo de eliminación:
  -- aquí se verifica exclusivamente la lectura con todos los triggers activos.
  INSERT INTO public.facturas(organization_id, cliente_id, cliente_nombre, numero,
    fecha_emision, fecha_vencimiento, moneda, tipo_cambio, subtotal, iva, total, estado, deleted_at)
  VALUES (fx.org_a, cli_a, 'Sólo eliminada', 'F-ELIMINADA', '2026-10-01', '2026-11-01',
    'MXN', 1, 100, 0, 100, 'Borrador', now());
  PERFORM pg_temp.as_user(fx.admin_a);
  PERFORM pg_temp.assert((SELECT count(*) = 2 AND bool_and((NOT prosecdef AND provolatile = 's'
    AND proconfig @> ARRAY['search_path=public']) IS TRUE) FROM pg_proc WHERE oid IN (
      'public.facturas_listado_pagina(uuid,text,text,date,date,integer,integer,text)'::regprocedure,
      'public.facturas_clientes_listado(uuid)'::regprocedure)) IS TRUE,
    'Ambas lecturas conservan SECURITY INVOKER, STABLE y search_path fijo');
  resultado := public.facturas_listado_pagina(p_fecha_desde => '2026-10-01', p_fecha_hasta => '2026-10-01', p_cliente_nombre => 'Histórico', p_search => 'ANTIGUA', p_estado => 'Borrador');
  PERFORM pg_temp.assert(((resultado->>'count')::int = 1 AND resultado->'rows'->0->>'numero' = 'F-ANTIGUA') IS TRUE, 'Cliente exacto y fechas inclusivas encuentran la factura fuera de primera página');
  resultado := public.facturas_listado_pagina(p_cliente_nombre => 'Histórico', p_search => 'NUEVA');
  PERFORM pg_temp.assert(((resultado->>'count')::int = 0) IS TRUE, 'Cliente y búsqueda se combinan con AND');
  resultado := public.facturas_listado_pagina(p_cliente_nombre => 'Histórico', p_estado => 'Emitida');
  PERFORM pg_temp.assert(((resultado->>'count')::int = 0) IS TRUE, 'Estado conserva su filtro');
  resultado := public.facturas_listado_pagina(p_search => 'NUEVA', p_offset => 100, p_limit => 3);
  PERFORM pg_temp.assert(((resultado->>'count')::int = 105 AND jsonb_array_length(resultado->'rows') = 3
    AND resultado->'rows'->0->>'numero' = 'F-NUEVA-5'
    AND resultado->'rows'->2->>'numero' = 'F-NUEVA-3') IS TRUE,
    'Orden descendente y count se conservan en una página posterior a cien filas');
  resultado := public.facturas_listado_pagina(p_offset => -1, p_limit => 0);
  PERFORM pg_temp.assert((jsonb_array_length(resultado->'rows') = 1
    AND resultado->'rows'->0->>'numero' = 'F-NUEVA-105') IS TRUE,
    'Offset y limit inválidos se acotan sin alterar el orden');
  resultado := public.facturas_listado_pagina(p_search => 'ELIMINADA');
  PERFORM pg_temp.assert(((resultado->>'count')::int = 0 AND resultado->'rows' = '[]'::jsonb) IS TRUE,
    'La baja lógica se excluye del conteo y las filas');
  resultado := public.facturas_listado_pagina(p_offset => 999);
  PERFORM pg_temp.assert(((resultado->>'count')::int = 107 AND resultado->'rows' = '[]'::jsonb) IS TRUE, 'Página fuera de rango conserva count global');
  PERFORM pg_temp.assert((public.facturas_clientes_listado() = '["Histórico", "Histórico ampliado", "Reciente"]'::jsonb) IS TRUE, 'Catálogo histórico no depende del cliente actual ni de la página y excluye bajas');
  resultado := public.facturas_listado_pagina(p_organization_id => fx.org_b);
  PERFORM pg_temp.assert(((resultado->>'count')::int = 0) IS TRUE, 'RLS impide leer otra organización mediante parámetro');
  PERFORM pg_temp.assert((public.facturas_clientes_listado(fx.org_b) = '[]'::jsonb) IS TRUE, 'Catálogo tampoco expone otra organización');
  PERFORM pg_temp.assert(NOT has_function_privilege('anon', 'public.facturas_listado_pagina(uuid,text,text,date,date,integer,integer,text)', 'EXECUTE'), 'anon no ejecuta listado');
  PERFORM pg_temp.assert(NOT has_function_privilege('anon', 'public.facturas_clientes_listado(uuid)', 'EXECUTE'), 'anon no ejecuta catálogo');
  PERFORM pg_temp.as_user(fx.admin_b);
  PERFORM pg_temp.assert(((public.facturas_listado_pagina()->>'count')::int = 1) IS TRUE, 'Org B sólo ve su factura');
  PERFORM pg_temp.as_user(sin_membresia);
  PERFORM pg_temp.assert(((public.facturas_listado_pagina(p_organization_id => fx.org_a)->>'count')::int = 0) IS TRUE,
    'Autenticado sin membresía no obtiene filas aunque indique la organización');
  PERFORM pg_temp.assert((public.facturas_clientes_listado(fx.org_a) = '[]'::jsonb) IS TRUE,
    'Autenticado sin membresía tampoco obtiene el catálogo');
END;
$fixture$;
ROLLBACK;
