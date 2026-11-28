CREATE OR REPLACE FUNCTION public.certificar_corte_cxc(p_org uuid,p_fecha date,p_fingerprint text,p_evidencia text,p_request_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := public._cxc_org_contador(p_org);
  v_datos jsonb;
  v_previo public.cxc_cortes;
  v_revision integer;
  v_cierre date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('cierre-contable:' || v_org::text,0));
  SELECT * INTO v_previo FROM public.cxc_cortes WHERE id=p_request_id AND organization_id=v_org;
  IF FOUND AND v_previo.fecha=p_fecha AND v_previo.fingerprint=p_fingerprint
    AND v_previo.conciliado_por=auth.uid() THEN RETURN v_previo.id; END IF;
  IF p_request_id IS NULL OR length(btrim(COALESCE(p_evidencia,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Registra la evidencia de conciliación del cierre.';
  END IF;
  IF EXISTS (SELECT FROM public.cxc_cortes WHERE organization_id=v_org AND fecha=p_fecha AND reabierto_en IS NULL) THEN
    RAISE EXCEPTION 'El corte ya está certificado. Reabre el periodo para emitir otra revisión.';
  END IF;
  v_datos := public._cxc_calcular_corte(v_org,p_fecha);
  IF encode(sha256(convert_to(v_datos::text,'UTF8')),'hex') IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'La cartera cambió desde la vista previa. Vuelve a revisarla.' USING ERRCODE='PT409';
  END IF;
  v_cierre := public.cierre_periodo_fecha(v_org);
  IF v_cierre IS NULL OR p_fecha > v_cierre THEN
    PERFORM public.actualizar_cierre_periodo(v_org,p_fecha,NULL);
  END IF;
  SELECT COALESCE(max(revision),0)+1 INTO v_revision FROM public.cxc_cortes
    WHERE organization_id=v_org AND fecha=p_fecha;
  INSERT INTO public.cxc_cortes (id,organization_id,fecha,revision,conciliado_por,evidencia,fingerprint,datos)
    VALUES(p_request_id,v_org,p_fecha,v_revision,auth.uid(),btrim(p_evidencia),p_fingerprint,v_datos);
  PERFORM public.registrar_bitacora('configuracion','certificar_corte_cxc',p_request_id,'Cartera por cobrar',
    jsonb_build_object('fecha',p_fecha,'revision',v_revision),v_org,auth.uid());
  RETURN p_request_id;
END;
$$;
