CREATE OR REPLACE FUNCTION public.trg_clientes_propaga_nombre() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.nombre IS NOT DISTINCT FROM OLD.nombre THEN
    RETURN NEW;
  END IF;
  UPDATE public.cotizaciones
     SET cliente_nombre = NEW.nombre
   WHERE cliente_id = NEW.id
     AND cliente_nombre IS DISTINCT FROM NEW.nombre
     AND deleted_at IS NULL;
  UPDATE public.embarques
     SET cliente_nombre = NEW.nombre
   WHERE cliente_id = NEW.id
     AND cliente_nombre IS DISTINCT FROM NEW.nombre
     AND estado::text <> 'Cerrado'
     AND deleted_at IS NULL;
  UPDATE public.facturas
     SET cliente_nombre = NEW.nombre
   WHERE cliente_id = NEW.id
     AND estado = 'Borrador'
     AND (evaluacion_fiscal IS NULL OR facturapi_id IS NULL)
     AND cliente_nombre IS DISTINCT FROM NEW.nombre
     AND deleted_at IS NULL;
  RETURN NEW;
END;
$$;
