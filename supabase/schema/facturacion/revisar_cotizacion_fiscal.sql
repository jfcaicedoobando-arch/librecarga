CREATE OR REPLACE FUNCTION public.revisar_cotizacion_fiscal(p_cotizacion_id uuid,p_expected_fingerprint text,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cot public.cotizaciones; v_resultado jsonb;
BEGIN
  SELECT * INTO v_cot FROM public.cotizaciones WHERE id=p_cotizacion_id AND deleted_at IS NULL FOR UPDATE;
  IF v_cot.id IS NULL OR v_cot.organization_id IS DISTINCT FROM public.org_scope() OR NOT public.has_any_role_in_org_exact(auth.uid(),
    ARRAY['admin','admin_org','gerente_comercial']::public.app_role[],v_cot.organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE='42501';
  END IF;
  IF length(btrim(COALESCE(p_motivo,'')))<10 OR v_cot.evaluacion_fiscal IS NULL
    OR p_expected_fingerprint IS DISTINCT FROM v_cot.evaluacion_fiscal->>'conceptos_fingerprint' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  IF v_cot.embarque_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.embarques WHERE cotizacion_id=v_cot.id AND deleted_at IS NULL AND estado::text<>'Cancelado') THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.cotizacion_revisiones_fiscales(organization_id,cotizacion_id,snapshot_anterior,conceptos_anteriores,estado_anterior,motivo,actor_id,transaccion)
    VALUES(v_cot.organization_id,v_cot.id,v_cot.evaluacion_fiscal,v_cot.conceptos_venta,v_cot.estado::text,btrim(p_motivo),auth.uid(),txid_current());
  PERFORM set_config('lc.cot_autorizacion','1',true);
  UPDATE public.cotizaciones SET estado='Borrador',autorizada_at=NULL,autorizada_por=NULL,margen_autorizado_pct=NULL,
    autorizacion_motivo=NULL,autorizacion_solicitada_at=NULL WHERE id=v_cot.id RETURNING evaluacion_fiscal INTO v_resultado;
  PERFORM set_config('lc.cot_autorizacion','',true);
  RETURN v_resultado;
END;
$$;
