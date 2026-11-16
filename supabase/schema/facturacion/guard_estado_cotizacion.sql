CREATE OR REPLACE FUNCTION public.guard_estado_cotizacion() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old text := OLD.estado::text;
  v_new text := NEW.estado::text;
BEGIN
  IF v_old IS NULL OR v_new IS NULL OR v_old = v_new THEN
    RETURN NEW;
  END IF;
  IF v_new='Borrador' AND OLD.evaluacion_fiscal IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.cotizacion_revisiones_fiscales
      WHERE cotizacion_id=OLD.id AND transaccion=txid_current()
        AND estado_anterior=v_old AND snapshot_anterior=OLD.evaluacion_fiscal) THEN RETURN NEW; END IF;
  -- Vencida siempre puede aplicarse desde cualquier estado no terminal
  IF v_new = 'Vencida' AND v_old IN ('Solicitada','Borrador','Enviada','Aceptada') THEN
    RETURN NEW;
  END IF;
  -- Housekeeping: Vencida >90 días → Archivada (C5)
  IF v_old = 'Vencida' AND v_new = 'Archivada' THEN
    RETURN NEW;
  END IF;
  -- Reactivación manual desde estados de housekeeping (A3).
  -- RG11: 'Aceptada' fuera de la lista (requiere snapshot del flujo normal).
  IF v_old IN ('Vencida','Archivada')
     AND v_new IN ('Solicitada','Borrador','Enviada') THEN
    RETURN NEW;
  END IF;
  -- Transiciones válidas
  IF (v_old = 'Solicitada'    AND v_new IN ('Borrador','Enviada','Aceptada','Rechazada'))
  OR (v_old = 'Borrador'      AND v_new IN ('Enviada','Aceptada','Rechazada'))
  OR (v_old = 'Enviada'       AND v_new IN ('Aceptada','Rechazada'))
  OR (v_old = 'Aceptada'      AND v_new IN ('En operación'))
  THEN
    RETURN NEW;
  END IF;
  -- FIX4 N-1: la papelera de embarques (sync_cotizacion_embarque_link)
  -- revierte 'En operación' → 'Aceptada' al liberar la cotización. Es la
  -- única transición admitida bajo la GUC transaccional
  -- app.liberando_papelera; sin ella, LC_COT_TRANSICION_INVALIDA.
  IF v_old = 'En operación' AND v_new = 'Aceptada'
     AND current_setting('app.liberando_papelera', true) = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'LC_COT_TRANSICION_INVALIDA: no se puede pasar de % a %', v_old, v_new
    USING ERRCODE = 'P0001';
END;
$$;
