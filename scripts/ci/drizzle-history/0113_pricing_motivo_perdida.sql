ALTER TABLE public.crm_solicitudes_pricing
  ADD COLUMN IF NOT EXISTS motivo_perdida_id uuid REFERENCES public.crm_motivos_perdida(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS perdida_nota text,
  ADD COLUMN IF NOT EXISTS perdida_at timestamptz,
  ADD COLUMN IF NOT EXISTS perdida_por uuid;

CREATE OR REPLACE FUNCTION public._crm_pricing_perdida_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.motivo_perdida_id := NULL; NEW.perdida_nota := NULL; NEW.perdida_at := NULL; NEW.perdida_por := NULL;
  ELSIF coalesce(current_setting('lc.pricing_rpc', true), '') <> '1'
    AND (NEW.motivo_perdida_id IS DISTINCT FROM OLD.motivo_perdida_id OR NEW.perdida_nota IS DISTINCT FROM OLD.perdida_nota
      OR NEW.perdida_at IS DISTINCT FROM OLD.perdida_at OR NEW.perdida_por IS DISTINCT FROM OLD.perdida_por) THEN
    RAISE EXCEPTION 'LC_PRICING_ESTADO_SOLO_RPC' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._crm_pricing_perdida_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_crm_pricing_perdida_guard ON public.crm_solicitudes_pricing;
CREATE TRIGGER trg_crm_pricing_perdida_guard BEFORE INSERT OR UPDATE ON public.crm_solicitudes_pricing
  FOR EACH ROW EXECUTE FUNCTION public._crm_pricing_perdida_guard();

CREATE OR REPLACE FUNCTION public.crm_pricing_marcar_perdida(p_id uuid, p_motivo_id uuid, p_nota text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; v_motivo text; v_nota text := nullif(trim(coalesce(p_nota, '')), '');
BEGIN
  SELECT * INTO v FROM crm_solicitudes_pricing WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF v.id IS NULL OR v.organization_id IS DISTINCT FROM org_scope() THEN
    RAISE EXCEPTION 'LC_PRICING_NO_ENCONTRADA' USING ERRCODE = 'P0001';
  END IF;
  IF NOT _crm_es_pricing(v.organization_id) THEN RAISE EXCEPTION 'LC_PRICING_SIN_PERMISO' USING ERRCODE = '42501'; END IF;
  IF v.estado <> 'respondida' OR v.perdida_at IS NOT NULL THEN
    RAISE EXCEPTION 'LC_PRICING_ESTADO_INVALIDO' USING ERRCODE = 'P0001';
  END IF;
  SELECT nombre INTO v_motivo FROM crm_motivos_perdida
   WHERE id = p_motivo_id AND organization_id = v.organization_id AND activa AND deleted_at IS NULL;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'LC_PRICING_MOTIVO_REQUERIDO' USING ERRCODE = 'P0001'; END IF;
  IF length(coalesce(v_nota, '')) > 500 THEN RAISE EXCEPTION 'LC_PRICING_MOTIVO_REQUERIDO' USING ERRCODE = 'P0001'; END IF;

  PERFORM set_config('lc.pricing_rpc', '1', true);
  UPDATE crm_solicitudes_pricing SET motivo_perdida_id = p_motivo_id, perdida_nota = v_nota,
    perdida_at = now(), perdida_por = auth.uid() WHERE id = p_id;
  PERFORM set_config('lc.pricing_rpc', '', true);
  PERFORM _crm_pricing_avisar_cambio(v.organization_id, v.id, v.solicitante_id, 'Pricing perdida ' || v.folio,
    'Motivo: ' || v_motivo || coalesce(' — ' || v_nota, ''));
  RETURN jsonb_build_object('id', v.id, 'motivo', v_motivo);
END $$;
REVOKE ALL ON FUNCTION public.crm_pricing_marcar_perdida(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_pricing_marcar_perdida(uuid, uuid, text) TO authenticated;