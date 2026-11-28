CREATE OR REPLACE FUNCTION public._fecha_entrega_efectiva(p_embarque uuid, p_org uuid)
RETURNS date LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT fecha_propuesta FROM public.embarque_fechas_entrega
  WHERE embarque_id=p_embarque AND organization_id=p_org AND estado='aprobada'
  ORDER BY resuelto_en DESC, id DESC LIMIT 1;
$$;
