import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { findProveedorByRfcEnOrg } from "@/features/proveedor/services";
import { proveedores as proveedoresKeys } from "@/features/proveedor/queryKeys";

export function useDuplicadoProveedor(rfc: string, organizationId: string | null) {
  const normalizado = rfc.trim();
  const debouncedRfc = useDebouncedValue(normalizado, 300);
  const consulta = useQuery({
    queryKey: proveedoresKeys.rfcCheck(debouncedRfc, organizationId),
    queryFn: () => organizationId ? findProveedorByRfcEnOrg(debouncedRfc, organizationId) : Promise.resolve(null),
    enabled: !!debouncedRfc && !!organizationId,
    staleTime: 30_000,
    retry: false,
  });

  const vigente = normalizado === debouncedRfc;
  return {
    rfcDuplicado: vigente ? consulta.data ?? null : null,
    comprobandoDuplicado: Boolean(normalizado && organizationId && (!vigente || consulta.isFetching)),
    errorComprobandoDuplicado: vigente && !!normalizado && consulta.isError,
  };
}
