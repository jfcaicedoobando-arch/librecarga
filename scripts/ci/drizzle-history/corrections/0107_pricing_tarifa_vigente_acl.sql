-- Privilegios efectivos observados en producción para el auxiliar de Pricing.
-- Sólo para la reconstrucción aislada a partir del historial vigente.
REVOKE ALL ON FUNCTION public._crm_pricing_hay_tarifa_vigente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._crm_pricing_hay_tarifa_vigente(uuid) TO service_role;
