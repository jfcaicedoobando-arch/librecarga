-- Filtros globales de Emitidas, sin cambiar el contrato histórico facturas_listado.
CREATE OR REPLACE FUNCTION public.facturas_listado_pagina(
  p_organization_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 50,
  p_cliente_nombre text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH alcance AS MATERIALIZED (
    SELECT public.org_requerida(p_organization_id) AS org_id
  ), filtered AS MATERIALIZED (
    SELECT f.id, f.numero, f.cliente_nombre, f.expediente, f.total, f.moneda,
           f.fecha_emision, f.fecha_vencimiento, f.estado, f.proforma_id,
           f.factura_pdf_url, f.factura_xml_url, f.ambiente,
           f.acuse_cancelacion_status, f.cancellation_status, f.enviada_cliente_at,
           f.created_at
    FROM public.facturas f
    JOIN alcance a ON f.organization_id = a.org_id
    WHERE f.deleted_at IS NULL
      AND (p_search IS NULL OR p_search = '' OR
           f.numero ILIKE '%' || p_search || '%' OR
           f.cliente_nombre ILIKE '%' || p_search || '%' OR
           f.expediente ILIKE '%' || p_search || '%')
      AND (p_estado IS NULL OR f.estado = p_estado::public.estado_factura)
      AND (p_fecha_desde IS NULL OR f.fecha_emision >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR f.fecha_emision <= p_fecha_hasta)
      AND (p_cliente_nombre IS NULL OR f.cliente_nombre = p_cliente_nombre)
  ), pagina AS (
    SELECT * FROM filtered
    ORDER BY created_at DESC, id DESC
    OFFSET greatest(coalesce(p_offset, 0), 0)
    LIMIT greatest(1, least(coalesce(p_limit, 50), 500))
  ), filas AS (
    SELECT p.*, CASE WHEN pf.numero IS NOT NULL THEN jsonb_build_object('numero', pf.numero) END AS proformas
    FROM pagina p
    LEFT JOIN public.proformas pf ON pf.id = p.proforma_id
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(filas) - 'created_at'
      ORDER BY created_at DESC, id DESC) FROM filas), '[]'::jsonb),
    'count', (SELECT count(*) FROM filtered)
  );
$function$;
REVOKE ALL ON FUNCTION public.facturas_listado_pagina(uuid, text, text, date, date, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.facturas_listado_pagina(uuid, text, text, date, date, integer, integer, text) TO authenticated, service_role;

-- Nombres de las facturas, incluyendo clientes históricos renombrados o dados de baja.
CREATE OR REPLACE FUNCTION public.facturas_clientes_listado(p_organization_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH alcance AS MATERIALIZED (
    SELECT public.org_requerida(p_organization_id) AS org_id
  ), clientes AS (
    SELECT DISTINCT f.cliente_nombre
    FROM public.facturas f
    JOIN alcance a ON f.organization_id = a.org_id
    WHERE f.deleted_at IS NULL AND f.cliente_nombre IS NOT NULL AND f.cliente_nombre <> ''
  )
  SELECT coalesce(jsonb_agg(cliente_nombre ORDER BY cliente_nombre), '[]'::jsonb) FROM clientes;
$function$;
REVOKE ALL ON FUNCTION public.facturas_clientes_listado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.facturas_clientes_listado(uuid) TO authenticated, service_role;
