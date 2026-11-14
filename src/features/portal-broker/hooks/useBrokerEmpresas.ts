import { useQuery } from "@tanstack/react-query";
import { misEmpresas } from "../services/brokerPortal";
import { broker } from "../queryKeys";

/** Empresas del broker con la etapa actual de sus oportunidades. */
export function useBrokerEmpresas() {
  return useQuery({
    queryKey: broker.empresas,
    queryFn: misEmpresas,
    refetchInterval: 60_000,
  });
}
