CREATE OR REPLACE FUNCTION public.reservar_timbrado_isr(
  p_factura_id uuid, p_actor uuid, p_prevalidacion jsonb, p_emisor_observado jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_factura public.facturas;
  v_intento public.intentos_timbrado_isr;
  v_esperado jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_factura FROM public.facturas WHERE id = p_factura_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR p_actor IS NULL OR NOT public.has_any_role_in_org_exact(p_actor,
    ARRAY['admin','admin_org','contador']::public.app_role[], v_factura.organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF v_factura.facturapi_id IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_INTENTO_ACTIVO' USING ERRCODE = '23505';
  END IF;

  -- Re-check the previously observed profile and the complete document while
  -- coordinating concurrent emissions via the invoice row lock.
  v_esperado := public._isr_revisar_factura_emision(p_factura_id);
  IF v_esperado IS NULL OR v_esperado IS DISTINCT FROM p_prevalidacion
    OR v_esperado->'emisor' IS DISTINCT FROM p_emisor_observado THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.intentos_timbrado_isr(factura_id, organization_id, actor_id, ambiente, prevalidacion)
  VALUES(p_factura_id, v_factura.organization_id, p_actor, v_esperado->>'ambiente', v_esperado)
  RETURNING * INTO v_intento;

  UPDATE public.facturas SET facturapi_id = 'PENDING:' || v_intento.id::text,
    facturapi_claim_at = v_intento.creado_at WHERE id = p_factura_id;
  RETURN jsonb_build_object('claim', 'PENDING:' || v_intento.id::text, 'reservado_at', v_intento.creado_at);
END;
$$;
REVOKE ALL ON FUNCTION public.reservar_timbrado_isr(uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_timbrado_isr(uuid,uuid,jsonb,jsonb) TO service_role;
