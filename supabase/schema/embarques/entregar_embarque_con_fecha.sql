CREATE OR REPLACE FUNCTION public.entregar_embarque_con_fecha(
  p_embarque uuid, p_fecha date, p_tipo_evento text, p_descripcion_evento text, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := public.org_scope();
  v_uid uuid := auth.uid();
  v_emb public.embarques;
  v_res jsonb;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona una organización activa.' USING ERRCODE='42501';
  END IF;
  PERFORM public._assert_writer(v_org);
  SELECT * INTO STRICT v_emb FROM public.embarques
    WHERE id=p_embarque AND organization_id=v_org AND deleted_at IS NULL FOR UPDATE;
  IF EXISTS (SELECT FROM public.embarque_fechas_entrega WHERE id=p_request_id AND embarque_id=p_embarque
    AND organization_id=v_org AND solicitado_por=v_uid AND documento_id IS NULL AND fecha_propuesta=p_fecha) THEN
    RETURN jsonb_build_object('id',p_embarque,'estado','Entregado','expediente',v_emb.expediente,'replay',true);
  END IF;
  PERFORM public._validar_fecha_entrega(p_fecha,v_emb.fecha_llegada_real);
  IF v_emb.estado IN ('Entregado','EIR','Por liquidar','Cerrado') OR
     public._fecha_entrega_efectiva(p_embarque,v_org) IS NOT NULL THEN
    RAISE EXCEPTION 'La entrega ya tiene fecha. Usa la solicitud de corrección.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cierre-contable:' || v_org::text,0));
  IF p_fecha <= public.cierre_periodo_fecha(v_org) THEN
    RAISE EXCEPTION 'Contabilidad debe reabrir el periodo de la fecha efectiva.';
  END IF;
  v_res := public.avanzar_estado_embarque(p_embarque,'Entregado','',p_tipo_evento,p_descripcion_evento,p_request_id);
  IF NOT (v_res ? '__idempotency_pending') AND NOT COALESCE((v_res->>'replay')::boolean,false) THEN
    INSERT INTO public.embarque_fechas_entrega
      (id,organization_id,embarque_id,fecha_propuesta,motivo,solicitado_por,estado,resuelto_por,resuelto_en)
      VALUES (p_request_id,v_org,p_embarque,p_fecha,'Confirmación de entrega',v_uid,'aprobada',v_uid,now());
  END IF;
  RETURN v_res;
END;
$$;
