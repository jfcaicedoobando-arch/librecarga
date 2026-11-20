CREATE OR REPLACE FUNCTION public._comision_kam_broker() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_motivo constant text := '[broker] Comisión exclusiva del broker; KAM sin comisión';
BEGIN
  IF NEW.estado <> 'Devengada' OR NEW.liquidacion_id IS NOT NULL
     OR NEW.deleted_at IS NOT NULL OR NEW.estado_previo_liquidacion = 'Por recuperar' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pagos_factura p
    JOIN public.facturas f ON f.id = p.factura_id AND f.organization_id = p.organization_id
    JOIN public.crm_empresas e ON e.cliente_id = f.cliente_id AND e.organization_id = f.organization_id
    JOIN public.crm_brokers b ON b.id = e.broker_id AND b.organization_id = e.organization_id
    WHERE p.id = NEW.pago_factura_id AND f.id = NEW.factura_id
      AND p.organization_id = NEW.organization_id AND e.deleted_at IS NULL
  ) THEN
    NEW.porcentaje_aplicado := 0;
    NEW.comision_mxn := 0;
    IF strpos(coalesce(NEW.nota, ''), v_motivo) = 0 THEN
      NEW.nota := concat_ws(' ', nullif(btrim(NEW.nota), ''), v_motivo);
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._comision_kam_broker() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON COLUMN public.crm_brokers.comision_kam_pct IS 'DEPRECATED: las cuentas del broker generan exclusivamente comisión del broker; el KAM conserva su asignación sin comisión. Históricos liquidados intactos.';