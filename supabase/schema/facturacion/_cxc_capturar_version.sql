CREATE OR REPLACE FUNCTION public._cxc_capturar_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_antes jsonb;
  v_despues jsonb;
  v_org uuid;
  v_id uuid;
  v_fac uuid;
  v_desde date;
  v_fecha date;
  v_fecha_anterior date;
  v_inicio date;
  v_alta_previa boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  v_row := COALESCE(v_new,v_old);
  v_org := (v_row->>'organization_id')::uuid;
  v_id := (v_row->>'id')::uuid;
  v_fac := CASE TG_TABLE_NAME WHEN 'facturas' THEN v_id
    WHEN 'refacturaciones' THEN (v_row->>'factura_original_id')::uuid ELSE (v_row->>'factura_id')::uuid END;
  v_antes := public._cxc_dato_fuente(TG_TABLE_NAME,v_old);
  v_despues := public._cxc_dato_fuente(TG_TABLE_NAME,v_new);
  IF (v_old IS NOT NULL AND v_new IS NOT NULL) AND
    (v_old->>'organization_id') IS DISTINCT FROM (v_new->>'organization_id') THEN
    IF EXISTS (SELECT FROM public.cxc_aperturas WHERE organization_id IN
      (v_org,(v_old->>'organization_id')::uuid)) THEN
      RAISE EXCEPTION 'Registra un reverso y una nueva aplicación para mover el documento.';
    END IF;
  END IF;
  IF v_antes IS NOT DISTINCT FROM v_despues
    AND (v_old->>'factura_id') IS NOT DISTINCT FROM (v_new->>'factura_id')
    AND (v_old->>'factura_original_id') IS NOT DISTINCT FROM (v_new->>'factura_original_id')
    THEN RETURN NULL; END IF;
  IF v_antes IS NULL AND v_despues IS NULL THEN RETURN NULL; END IF;
  SELECT desde INTO v_desde FROM public.cxc_aperturas WHERE organization_id=v_org;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_fecha_anterior := GREATEST(v_desde, public._cxc_fecha_fuente(TG_TABLE_NAME,v_antes));
  v_fecha := GREATEST(v_desde, public._cxc_fecha_fuente(TG_TABLE_NAME,v_despues));
  SELECT (datos->>'reinicio')::date INTO v_inicio FROM public.cxc_versiones
    WHERE organization_id=v_org AND fuente=TG_TABLE_NAME AND fuente_id=v_id AND datos IS NOT NULL
    ORDER BY id DESC LIMIT 1;
  v_alta_previa := FOUND;

  IF v_despues IS NULL THEN
    v_fecha := GREATEST(v_fecha_anterior,v_inicio,public.fecha_negocio_mx());
  ELSIF v_antes IS NULL AND v_alta_previa THEN
    v_fecha := GREATEST(v_fecha, public.fecha_negocio_mx());
    v_inicio := v_fecha;
  ELSIF v_antes IS NOT NULL THEN
    -- Tras reactivar, el nuevo estado se aplica a partir de la reactivación.
    v_fecha := GREATEST(v_fecha,v_inicio);
    v_fecha_anterior := GREATEST(v_fecha_anterior,v_inicio);
    IF v_fecha > v_fecha_anterior THEN
      INSERT INTO public.cxc_versiones(organization_id,fuente,fuente_id,factura_id,fecha_efectiva,datos)
      VALUES(v_org,TG_TABLE_NAME,v_id,v_fac,v_fecha_anterior,NULL);
    END IF;
  END IF;

  IF v_despues IS NOT NULL AND v_inicio IS NOT NULL THEN
    v_despues := v_despues || jsonb_build_object('reinicio',v_inicio);
  END IF;
  INSERT INTO public.cxc_versiones(organization_id,fuente,fuente_id,factura_id,fecha_efectiva,datos)
  VALUES(v_org,TG_TABLE_NAME,v_id,v_fac,v_fecha,v_despues);
  RETURN NULL;
END;
$$;
