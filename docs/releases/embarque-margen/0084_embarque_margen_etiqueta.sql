-- CANDIDATA complementaria a 0083: NO aplicada ni registrada en el ledger.
-- Conserva identidad verificada al aprobar y no inventa autorizadores históricos.
ALTER TABLE public.embarque_aprobaciones_margen ADD COLUMN autorizada_email text;

CREATE FUNCTION public._embarque_identidad_autorizacion_margen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.autorizada_at IS NOT NULL AND
    (TG_OP = 'INSERT' OR NEW.autorizada_at IS DISTINCT FROM OLD.autorizada_at) THEN
    NEW.autorizada_email := NULLIF(auth.jwt()->>'email','');
  ELSIF NEW.autorizada_at IS NULL THEN NEW.autorizada_email := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._embarque_identidad_autorizacion_margen() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._embarque_identidad_autorizacion_margen() TO service_role;
CREATE TRIGGER trg_embarque_identidad_margen BEFORE INSERT OR UPDATE ON public.embarque_aprobaciones_margen
FOR EACH ROW EXECUTE FUNCTION public._embarque_identidad_autorizacion_margen();

-- Guarda el estado previo dentro de la misma transacción, antes de modificar importes.
CREATE FUNCTION public._embarque_margen_operativo_antes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids uuid[]; e public.embarques;
BEGIN
  IF TG_TABLE_NAME = 'embarques' THEN ids := ARRAY[OLD.id];
  ELSE
    ids := ARRAY[CASE WHEN TG_OP <> 'INSERT' THEN OLD.embarque_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.embarque_id END];
  END IF;
  FOR e IN SELECT * FROM public.embarques WHERE id = ANY(ids) AND deleted_at IS NULL ORDER BY id FOR UPDATE LOOP
    IF e.estado IN ('Borrador','Cotización','Cancelado') THEN CONTINUE; END IF;
    INSERT INTO public.embarque_aprobaciones_margen(embarque_id, organization_id, snapshot)
    VALUES(e.id, e.organization_id, public._embarque_snapshot_margen(e.id))
    ON CONFLICT (embarque_id) DO NOTHING;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._embarque_margen_operativo_antes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._embarque_margen_operativo_antes() TO service_role;
CREATE TRIGGER trg_margen_operativo_antes BEFORE UPDATE ON public.embarques
FOR EACH ROW EXECUTE FUNCTION public._embarque_margen_operativo_antes();
CREATE TRIGGER trg_margen_operativo_antes BEFORE INSERT OR UPDATE OR DELETE ON public.conceptos_venta
FOR EACH ROW EXECUTE FUNCTION public._embarque_margen_operativo_antes();
CREATE TRIGGER trg_margen_operativo_antes BEFORE INSERT OR UPDATE OR DELETE ON public.conceptos_costo
FOR EACH ROW EXECUTE FUNCTION public._embarque_margen_operativo_antes();

CREATE FUNCTION public._embarque_registrar_margen_operativo(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.embarques; a public.embarque_aprobaciones_margen; s jsonb; requiere boolean;
BEGIN
  SELECT * INTO e FROM public.embarques WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR e.estado IN ('Borrador','Cotización','Cancelado') THEN RETURN; END IF;
  SELECT * INTO a FROM public.embarque_aprobaciones_margen WHERE embarque_id=p_id;
  s := public._embarque_snapshot_margen(p_id);
  IF a.embarque_id IS NULL OR a.snapshot = s THEN RETURN; END IF;
  requiere := (s->>'requiere_aprobacion')::boolean;
  IF requiere AND (NOT (s->>'calculable')::boolean OR e.organization_id IS DISTINCT FROM public.org_scope()
    OR NOT public.has_any_role_in_org_exact(auth.uid(), ARRAY['admin','admin_org','gerente_comercial']::public.app_role[], e.organization_id)) THEN
    RAISE EXCEPTION 'LC_EMBARQUE_MARGEN_PENDIENTE: el cambio operativo requiere autorización comercial'
      USING ERRCODE='P0001';
  END IF;
  INSERT INTO public.bitacora_actividad(organization_id,usuario_id,usuario_email,modulo,accion,entidad_id,detalles)
  VALUES(e.organization_id,auth.uid(),auth.jwt()->>'email','Embarques',
    CASE WHEN requiere THEN 'Autorizó cambio de margen operativo' ELSE 'Actualizó margen operativo' END,p_id,
    jsonb_build_object('anterior',a.snapshot,'nuevo',s,'autorizada_por',a.autorizada_por,
      'autorizada_at',a.autorizada_at,'autorizada_email',a.autorizada_email,'revision',a.revision+1));
  UPDATE public.embarque_aprobaciones_margen SET snapshot=s, revision=revision+1,
    autorizada_por=CASE WHEN requiere THEN auth.uid() END,
    autorizada_at=CASE WHEN requiere THEN clock_timestamp() END,
    snapshot_autorizado=CASE WHEN requiere THEN s END,
    motivo=CASE WHEN requiere THEN 'Cambio operativo autorizado al guardar' END
  WHERE embarque_id=p_id;
END $$;
REVOKE ALL ON FUNCTION public._embarque_registrar_margen_operativo(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._embarque_registrar_margen_operativo(uuid) TO service_role;

CREATE FUNCTION public._embarque_margen_operativo_despues()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME='embarques' THEN PERFORM public._embarque_registrar_margen_operativo(NEW.id);
  ELSE
    IF TG_OP <> 'INSERT' THEN PERFORM public._embarque_registrar_margen_operativo(OLD.embarque_id); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM public._embarque_registrar_margen_operativo(NEW.embarque_id); END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._embarque_margen_operativo_despues() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._embarque_margen_operativo_despues() TO service_role;
CREATE CONSTRAINT TRIGGER trg_operativo_margen_despues AFTER UPDATE ON public.embarques
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public._embarque_margen_operativo_despues();
CREATE CONSTRAINT TRIGGER trg_operativo_margen_despues AFTER INSERT OR UPDATE OR DELETE ON public.conceptos_venta
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public._embarque_margen_operativo_despues();
CREATE CONSTRAINT TRIGGER trg_operativo_margen_despues AFTER INSERT OR UPDATE OR DELETE ON public.conceptos_costo
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public._embarque_margen_operativo_despues();

-- Etiquetas por página: no devuelve costos ni carga una consulta por renglón.
CREATE FUNCTION public.consultar_etiquetas_margen_embarques(p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid := public.org_scope();
BEGIN
  IF cardinality(p_ids) > 100 THEN RAISE EXCEPTION 'Máximo 100 embarques por consulta' USING ERRCODE='22023'; END IF;
  IF NOT public.has_any_role_in_org_exact(auth.uid(),ARRAY['admin','admin_org','gerente_visor','gerente_comercial',
    'gerente_operaciones','coordinador_logistico','ejecutivo_pricing','vendedor','operador',
    'contador','tesorero','auxiliar_contable','ejecutivo_cobranza']::public.app_role[],org) THEN
    RAISE EXCEPTION 'LC_EMBARQUE_MARGEN_SIN_PERMISO' USING ERRCODE='42501'; END IF;
  RETURN COALESCE((SELECT jsonb_object_agg(a.embarque_id,jsonb_build_object(
    'autorizada_por',a.autorizada_por,'autorizada_email',a.autorizada_email,'autorizada_at',a.autorizada_at,
    'vigente',a.autorizada_at IS NOT NULL AND a.snapshot_autorizado=public._embarque_snapshot_margen(e.id)))
    FROM public.embarque_aprobaciones_margen a JOIN public.embarques e ON e.id=a.embarque_id
    WHERE e.id=ANY(p_ids) AND e.organization_id=org AND a.organization_id=org AND e.deleted_at IS NULL
      AND (a.solicitada_at IS NOT NULL OR a.autorizada_at IS NOT NULL)
      AND (public._embarque_snapshot_margen(e.id)->>'calculable')::boolean
      AND (public._embarque_snapshot_margen(e.id)->>'requiere_aprobacion')::boolean),'{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.consultar_etiquetas_margen_embarques(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consultar_etiquetas_margen_embarques(uuid[]) TO authenticated,service_role;