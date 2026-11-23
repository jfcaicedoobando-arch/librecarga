import { useQuery } from "@tanstack/react-query";
import { crm } from "../queryKeys";
import { buscarAeropuertos } from "../services/pricing/aeropuertos";

export function useBuscarAeropuertos(termino: string, abierto: boolean) {
  return useQuery({
    queryKey: crm.buscarAeropuertos(termino),
    queryFn: () => buscarAeropuertos(termino),
    enabled: abierto && termino.length >= 2,
    staleTime: 3_600_000,
  });
}
