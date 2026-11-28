CREATE OR REPLACE FUNCTION public.resolver_fecha_entrega(p_solicitud uuid,p_aprobar boolean,p_motivo text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := public.org_scope();
  v_uid uuid := auth.uid();
  v_row public.embarque_fechas_entrega;
  v_emb public.embarques;
  v_cierre date;
BEGIN
  IF NOT public.has_org_role(v_uid,v_org,'gerente_operaciones') THEN
    RAISE EXCEPTION 'Solo Gerencia de Operaciones puede resolver la corrección.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT v_row FROM public.embarque_fechas_entrega
    WHERE id=p_solicitud AND organization_id=v_org AND documento_id IS NOT NULL;
  SELECT * INTO STRICT v_emb FROM public.embarques
    WHERE id=v_row.embarque_id AND organization_id=v_org AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO STRICT v_row FROM public.embarque_fechas_entrega WHERE id=p_solicitud FOR UPDATE;
  IF v_row.estado <> 'pendiente' THEN RETURN v_row.estado; END IF;
  IF v_uid = v_row.solicitado_por OR p_aprobar IS NULL OR length(btrim(COALESCE(p_motivo,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'La resolución requiere otro responsable y un motivo de 10 a 1000 caracteres.';
  END IF;
  IF p_aprobar THEN
    IF v_emb.estado NOT IN ('Entregado','EIR','Por liquidar','Cerrado') OR
      public._fecha_entrega_efectiva(v_emb.id,v_org) IS DISTINCT FROM v_row.fecha_anterior THEN
      RAISE EXCEPTION 'La entrega cambió. Rechaza esta solicitud y pide una nueva revisión.';
    END IF;
    PERFORM public._validar_fecha_entrega(v_row.fecha_propuesta,v_emb.fecha_llegada_real);
    IF NOT EXISTS (SELECT FROM public.documentos_embarque WHERE id=v_row.documento_id
      AND embarque_id=v_emb.id AND organization_id=v_org AND deleted_at IS NULL
      AND archivo=v_row.documento_archivo) THEN RAISE EXCEPTION 'La evidencia cambió. Rechaza esta solicitud y pide una nueva revisión.'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('cierre-contable:' || v_org::text,0));
    v_cierre := public.cierre_periodo_fecha(v_org);
    IF v_row.fecha_propuesta <= v_cierre OR v_row.fecha_anterior <= v_cierre THEN
      RAISE EXCEPTION 'Contabilidad debe reabrir los periodos afectados antes de aprobar.';
    END IF;
  END IF;
  UPDATE public.embarque_fechas_entrega SET estado=CASE WHEN p_aprobar THEN 'aprobada' ELSE 'rechazada' END,
    resuelto_por=v_uid,resuelto_en=clock_timestamp(),motivo_resolucion=btrim(p_motivo)
    WHERE id=p_solicitud RETURNING estado INTO v_row.estado;
  RETURN v_row.estado;
END;
$$;
