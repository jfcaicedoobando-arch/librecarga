-- Canonical schema para public.portal_obtener_proforma_por_token
-- Sincronizado en FIX4 tanda 4 (N-2 · multimoneda dual).
--
-- Historial de fixes:
--   · antes se exponía una columna inexistente (`importe`) de la vista
--     `proforma_conceptos_consolidados`, que publica `total`. Se conserva el
--     nombre `importe` como clave de salida en el JSON del portal público
--     para no romper el contrato con el front.
--   · FIX3 (drift ronda 2): rate limit de BD restaurado (30 lecturas/min por
--     IP+identidad), mismo patrón que las demás RPCs de la whitelist anon.
--     check_ratelimit escribe en ratelimit_buckets → la función debe ser
--     VOLATILE.
--   · FIX4 N-2: la tabla proformas ya no tiene moneda/subtotal/iva/total
--     singulares (son *_mxn / *_usd). La RPC devuelve ambos juegos duales y
--     conserva las claves legacy singulares derivadas (MXN si
--     subtotal_mxn > 0 o ambos cero; si no, USD) para no romper el contrato
--     del front publicado.
CREATE OR REPLACE FUNCTION public.portal_obtener_proforma_por_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_proforma public.proformas%ROWTYPE;
  v_conceptos jsonb;
  v_estado_link text;
  v_rl jsonb;
  v_moneda_legacy text;
  v_bloques jsonb;
  v_mxn jsonb;
  v_usd jsonb;
BEGIN
  v_rl := public.check_ratelimit(
    'rpc:portal_obtener_proforma_por_token:'
      || COALESCE(NULLIF(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''), 'sin-ip')
      || ':' || COALESCE(auth.uid()::text, 'anon'),
    60, 30
  );
  IF (v_rl->>'ok') = 'false' THEN
    RAISE EXCEPTION 'Demasiadas solicitudes. Intenta de nuevo en % segundos.', COALESCE(v_rl->>'retry_after', '60')
      USING ERRCODE = 'P0001';
  END IF;

  IF p_token IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_proforma FROM public.proformas WHERE token_publico = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','token_invalido'); END IF;

  IF v_proforma.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error','token_invalido');
  END IF;

  IF v_proforma.estado_proforma = 'cancelada' THEN
    v_estado_link := 'cancelada';
  ELSIF v_proforma.token_expira_at IS NOT NULL AND v_proforma.token_expira_at < now() THEN
    v_estado_link := 'expirado';
  ELSIF v_proforma.estado_cliente <> 'pendiente' THEN
    v_estado_link := 'respondida';
  ELSE
    v_estado_link := 'activo';
  END IF;

  -- BL-11: link no vigente → no exponer montos, conceptos ni datos del cliente.
  IF v_estado_link <> 'activo' THEN
    RETURN jsonb_build_object(
      'estado_link', v_estado_link,
      'proforma', jsonb_build_object(
        'id', v_proforma.id,
        'numero', v_proforma.numero
      ),
      'conceptos', '[]'::jsonb
    );
  END IF;

  IF v_proforma.evaluacion_fiscal IS NOT NULL THEN
    -- Proyección pública de los importes y renglones guardados, sin perfil ni linaje interno.
    SELECT jsonb_agg(jsonb_build_object('moneda', b->'moneda', 'subtotal', b->'subtotal', 'iva', b->'iva',
      'ret_isr', b->'ret_isr', 'ret_iva', b->'ret_iva', 'total', b->'total') ORDER BY b->>'moneda')
      INTO v_bloques FROM jsonb_array_elements(v_proforma.evaluacion_fiscal->'bloques') b;
    SELECT b INTO v_mxn FROM jsonb_array_elements(v_bloques) b WHERE b->>'moneda' = 'MXN';
    SELECT b INTO v_usd FROM jsonb_array_elements(v_bloques) b WHERE b->>'moneda' = 'USD';
    SELECT jsonb_agg(jsonb_build_object('id', c->'id', 'descripcion', c->'descripcion', 'cantidad', c->'cantidad',
      'precio_unitario', c->'precio_unitario', 'importe', c->'total', 'moneda', c->'moneda',
      'tipo_iva', c->'tipo_iva', 'tasa_iva_aplicada', c->'tasa_iva_aplicada', 'aplica_iva', c->'aplica_iva') ORDER BY ord)
      INTO v_conceptos FROM jsonb_array_elements(v_proforma.conceptos_fiscales) WITH ORDINALITY AS l(c, ord);
    v_moneda_legacy := CASE WHEN v_mxn IS NOT NULL THEN 'MXN' ELSE 'USD' END;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pcc.id,
    'descripcion', pcc.descripcion,
    'cantidad', pcc.cantidad,
    'precio_unitario', pcc.precio_unitario,
    'importe', pcc.total,
    'moneda', pcc.moneda,
    'tipo_iva', pcc.tipo_iva,
    'tasa_iva_aplicada', pcc.tasa_iva_aplicada,
    'aplica_iva', pcc.aplica_iva
  ) ORDER BY pcc.created_at), '[]'::jsonb)
    INTO v_conceptos
    FROM public.proforma_conceptos_consolidados pcc
   WHERE pcc.proforma_id = v_proforma.id;

  -- FIX4 N-2: las columnas singulares ya no existen (multimoneda dual). Las
  -- claves legacy se derivan: MXN si hay subtotal_mxn o si ambos son cero
  -- (default histórico); si no, USD. El front nuevo usa los juegos duales.
    v_moneda_legacy := CASE
      WHEN v_proforma.subtotal_mxn > 0
        OR (v_proforma.subtotal_mxn = 0 AND v_proforma.subtotal_usd = 0)
      THEN 'MXN' ELSE 'USD' END;
    v_mxn := jsonb_build_object('subtotal', v_proforma.subtotal_mxn, 'iva', v_proforma.iva_mxn, 'total', v_proforma.total_mxn);
    v_usd := jsonb_build_object('subtotal', v_proforma.subtotal_usd, 'iva', v_proforma.iva_usd, 'total', v_proforma.total_usd);
  END IF;

  RETURN jsonb_build_object(
    'estado_link', v_estado_link,
    'proforma', jsonb_build_object(
      'id', v_proforma.id,
      'numero', v_proforma.numero,
      'cliente_nombre', v_proforma.cliente_nombre,
      'expediente', v_proforma.expediente,
      -- Juegos duales (fuente de verdad multimoneda)
      'subtotal_mxn', v_mxn->'subtotal',
      'iva_mxn', v_mxn->'iva',
      'total_mxn', v_mxn->'total',
      'subtotal_usd', v_usd->'subtotal',
      'iva_usd', v_usd->'iva',
      'total_usd', v_usd->'total',
      'totales_fiscales', v_bloques,
      -- Claves legacy singulares derivadas (compat con el front publicado)
      'moneda', v_moneda_legacy,
      'subtotal', CASE WHEN v_moneda_legacy = 'MXN' THEN v_mxn->'subtotal' ELSE v_usd->'subtotal' END,
      'iva', CASE WHEN v_moneda_legacy = 'MXN' THEN v_mxn->'iva' ELSE v_usd->'iva' END,
      'total', CASE WHEN v_moneda_legacy = 'MXN' THEN v_mxn->'total' ELSE v_usd->'total' END,
      'estado_cliente', v_proforma.estado_cliente,
      'aceptada_at', v_proforma.aceptada_at,
      'rechazada_at', v_proforma.rechazada_at,
      'motivo_rechazo', v_proforma.motivo_rechazo,
      'created_at', v_proforma.created_at,
      'token_expira_at', v_proforma.token_expira_at
    ),
    'conceptos', v_conceptos
  );
END $function$;

REVOKE ALL ON FUNCTION public.portal_obtener_proforma_por_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_obtener_proforma_por_token(uuid) TO anon, authenticated;
