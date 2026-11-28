CREATE OR REPLACE FUNCTION public.historial_fecha_entrega(p_embarque uuid)
RETURNS TABLE(id uuid,fecha_anterior date,fecha_propuesta date,motivo text,documento_nombre text,
  estado text,solicitante text,solicitado_en timestamptz,responsable text,resuelto_en timestamptz,motivo_resolucion text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org uuid := public.org_scope();
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT FROM public.embarques e WHERE e.id=p_embarque AND e.organization_id=v_org AND e.deleted_at IS NULL
  ) OR NOT (public.has_role(auth.uid(),'super_admin') OR EXISTS (
    SELECT FROM public.organization_members m WHERE m.organization_id=v_org AND m.user_id=auth.uid()
      AND m.role IN ('coordinador_logistico','gerente_operaciones','admin','admin_org','contador','gerente_visor')
  )) THEN
    RAISE EXCEPTION 'Historial de entrega no disponible.' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT h.id,h.fecha_anterior,h.fecha_propuesta,h.motivo,h.documento_nombre,h.estado,
    COALESCE(s.email,h.solicitado_por::text)::text,h.solicitado_en,
    COALESCE(r.email,h.resuelto_por::text)::text,h.resuelto_en,h.motivo_resolucion
    FROM public.embarque_fechas_entrega h
    LEFT JOIN auth.users s ON s.id=h.solicitado_por
    LEFT JOIN auth.users r ON r.id=h.resuelto_por
    WHERE h.organization_id=v_org AND h.embarque_id=p_embarque ORDER BY h.solicitado_en DESC,h.id DESC;
END;
$$;
