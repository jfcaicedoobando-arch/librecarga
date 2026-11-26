ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS motivo_reapertura text
  CHECK (motivo_reapertura IS NULL);
ALTER TABLE public.crm_historial_etapas ADD COLUMN IF NOT EXISTS motivo_reapertura text;
ALTER TABLE public.crm_historial_etapas ADD COLUMN IF NOT EXISTS motivo_perdida_anterior_id uuid;

CREATE OR REPLACE FUNCTION public._crm_registrar_cambio_etapa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_origen text;
  v_destino text;
  v_motivo text := nullif(btrim(NEW.motivo_reapertura), '');
  v_motivo_perdida uuid;
BEGIN
  NEW.motivo_reapertura := NULL;
  NEW.ultimo_movimiento_at := now();
  IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    SELECT tipo INTO v_origen FROM public.crm_etapas_pipeline
      WHERE id = OLD.etapa_id AND organization_id = OLD.organization_id;
    SELECT tipo INTO v_destino FROM public.crm_etapas_pipeline
      WHERE id = NEW.etapa_id AND organization_id = NEW.organization_id;
    IF v_origen = 'perdida' AND v_destino = 'abierta' THEN
      IF v_motivo IS NULL OR char_length(v_motivo) > 500 THEN
        RAISE EXCEPTION 'Escribe un motivo de reapertura de hasta 500 caracteres.'
          USING ERRCODE = '22023';
      END IF;
      v_motivo_perdida := OLD.motivo_perdida_id;
      NEW.motivo_perdida_id := NULL;
    ELSE
      v_motivo := NULL;
    END IF;
    INSERT INTO public.crm_historial_etapas (
      organization_id, oportunidad_id, etapa_origen_id, etapa_destino_id,
      dias_en_etapa, usuario_id, usuario_email, motivo_reapertura, motivo_perdida_anterior_id
    ) VALUES (
      NEW.organization_id, NEW.id, OLD.etapa_id, NEW.etapa_id,
      ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(OLD.etapa_desde_at, OLD.created_at, now()))) / 86400.0, 2),
      auth.uid(), NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'email',
      v_motivo, v_motivo_perdida
    );
    NEW.etapa_desde_at := now();
  END IF;
  RETURN NEW;
END;
$$;
