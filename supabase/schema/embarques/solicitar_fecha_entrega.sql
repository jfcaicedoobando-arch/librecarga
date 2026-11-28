CREATE OR REPLACE FUNCTION public.solicitar_fecha_entrega(
  p_embarque uuid, p_fecha date, p_motivo text, p_documento uuid, p_request_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := public.org_scope();
  v_uid uuid := auth.uid();
  v_emb public.embarques;
  v_doc text;
  v_archivo text;
  v_fecha date;
BEGIN
  IF NOT public.has_org_role(v_uid,v_org,'coordinador_logistico') THEN
    RAISE EXCEPTION 'Solo Coordinación Logística puede solicitar la corrección.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT v_emb FROM public.embarques
    WHERE id=p_embarque AND organization_id=v_org AND deleted_at IS NULL FOR UPDATE;
  IF EXISTS (SELECT FROM public.embarque_fechas_entrega WHERE id=p_request_id AND organization_id=v_org
      AND embarque_id=p_embarque AND solicitado_por=v_uid AND fecha_propuesta=p_fecha
      AND documento_id=p_documento AND motivo=btrim(p_motivo)) THEN RETURN p_request_id; END IF;
  IF v_emb.estado NOT IN ('Entregado','EIR','Por liquidar','Cerrado') THEN
    RAISE EXCEPTION 'Primero registra la entrega del embarque.';
  END IF;
  PERFORM public._validar_fecha_entrega(p_fecha,v_emb.fecha_llegada_real);
  v_fecha := public._fecha_entrega_efectiva(p_embarque,v_org);
  IF p_fecha IS NOT DISTINCT FROM v_fecha OR length(btrim(COALESCE(p_motivo,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Propón una fecha distinta y escribe un motivo de 10 a 1000 caracteres.';
  END IF;
  SELECT nombre,archivo INTO v_doc,v_archivo FROM public.documentos_embarque WHERE id=p_documento
    AND organization_id=v_org AND embarque_id=p_embarque AND deleted_at IS NULL
    AND NULLIF(btrim(archivo),'') IS NOT NULL;
  IF v_doc IS NULL THEN RAISE EXCEPTION 'Selecciona un documento adjunto del expediente.'; END IF;
  IF EXISTS (SELECT FROM public.embarque_fechas_entrega WHERE embarque_id=p_embarque AND estado='pendiente') THEN
    RAISE EXCEPTION 'El embarque ya tiene una solicitud pendiente.';
  END IF;
  INSERT INTO public.embarque_fechas_entrega
    (id,organization_id,embarque_id,fecha_anterior,fecha_propuesta,motivo,documento_id,documento_nombre,documento_archivo,solicitado_por,estado)
    VALUES (p_request_id,v_org,p_embarque,v_fecha,p_fecha,btrim(p_motivo),p_documento,v_doc,v_archivo,v_uid,'pendiente');
  RETURN p_request_id;
END;
$$;
