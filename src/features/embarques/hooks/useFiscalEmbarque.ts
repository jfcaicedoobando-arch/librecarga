import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useOrgFilter } from "@/hooks/shared/useOrgFilter";
import type { ConceptoVentaLocal } from "@/types/concepto";
import { embarques } from "../queryKeys";
import { consultarFiscalEmbarque, previsualizarFiscalEmbarque } from "../services/evaluacionFiscalEmbarque";

export function useFiscalEmbarqueGuardado(embarqueId: string, revision: string) {
  const { organizationId } = useOrgFilter();
  const { user } = useAuth();
  const disponible = Boolean(organizationId && user?.id && embarqueId);
  const query = useQuery({
    queryKey: embarques.fiscalGuardado(embarqueId, organizationId, user?.id, revision),
    enabled: disponible,
    queryFn: () => consultarFiscalEmbarque(embarqueId, organizationId!),
    staleTime: 0,
  });
  return { disponible, query };
}

export function usePreviewFiscalEmbarque({ conceptos, clienteId, embarqueId }: {
  conceptos: ConceptoVentaLocal[];
  clienteId: string;
  embarqueId?: string;
}) {
  const { organizationId } = useOrgFilter();
  const { user } = useAuth();
  const identidad = JSON.stringify([organizationId, user?.id, clienteId, embarqueId, conceptos.map((c) => [
    c.concepto, c.cantidad, c.precioUnitario, c.moneda, c.tipoIva, c.aplicaIva, c.tasaIva, c.tasaRetIva,
  ])]);
  const [solicitado, setSolicitado] = useState<string | null>(null);
  if (solicitado !== null && solicitado !== identidad) setSolicitado(null);
  const vigente = solicitado === identidad;
  const puedeConsultar = Boolean(organizationId && user?.id && clienteId && conceptos.some((c) => c.concepto.trim()));
  const query = useQuery({
    queryKey: embarques.fiscalPreview(identidad),
    enabled: vigente && puedeConsultar,
    queryFn: () => previsualizarFiscalEmbarque({ organizationId: organizationId!, clienteId, embarqueId, conceptos }),
    staleTime: 0,
  });
  const solicitar = () => {
    if (vigente) void query.refetch();
    else setSolicitado(identidad);
  };
  return { vigente, query, puedeConsultar, solicitar };
}
