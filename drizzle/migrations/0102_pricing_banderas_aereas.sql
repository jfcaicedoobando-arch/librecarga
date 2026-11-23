ALTER TABLE public.crm_solicitudes_pricing
  ADD COLUMN baterias_litio boolean,
  ADD COLUMN known_shipper boolean,
  ADD COLUMN tipo_aeronave text CHECK (tipo_aeronave IS NULL OR tipo_aeronave IN ('PAX','CAO'));