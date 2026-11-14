import { useQuery } from "@tanstack/react-query";
import { useMutationWithFeedback } from "@/hooks/shared";
import type { ContactoBroker, EmpresaBroker } from "../domain/altaProspecto";
import {
  altaProspecto, buscarEmpresa, misComisiones, misOrganizaciones, misSolicitudes, solicitarEmpresa, type PeticionEmpresa,
} from "../services/brokerPortal";

import { broker } from "../queryKeys";

export const useBrokerOrganizaciones = () =>
  useQuery({ queryKey: broker.organizaciones, queryFn: misOrganizaciones });

export function useBuscarEmpresaBroker(brokerId: string | null, texto: string) {
  const q = texto.trim();
  return useQuery({
    queryKey: broker.buscar(brokerId, q),
    queryFn: () => buscarEmpresa(brokerId as string, q),
    enabled: !!brokerId && q.length >= 3,
  });
}

export const useMisSolicitudesBroker = () =>
  useQuery({ queryKey: broker.solicitudes, queryFn: misSolicitudes, refetchInterval: 60_000 });

export const useSolicitarEmpresa = (brokerId: string | null) =>
  useMutationWithFeedback({
    mutationFn: (v: { empresaId: string } & PeticionEmpresa) => solicitarEmpresa(brokerId as string, v.empresaId, v),
    invalidate: [...broker.all],
    successTitle: "Solicitud enviada",
    successDescription: "Te avisaremos cuando la autoricen o rechacen.",
    errorTitle: "No se pudo enviar la solicitud",
  });

export const useAltaProspectoBroker = (brokerId: string | null) =>
  useMutationWithFeedback({
    mutationFn: (v: { empresa: EmpresaBroker; contactos: ContactoBroker[] }) =>
      altaProspecto(brokerId as string, v.empresa, v.contactos),
    invalidate: [...broker.all],
    successTitle: "Prospecto externo registrado",
    successDescription: "Se asignó un KAM por turno y ya aparece en Mis empresas.",
    errorTitle: "No se pudo registrar la empresa",
  });

export const useMisComisionesBroker = () =>
  useQuery({ queryKey: broker.comisiones, queryFn: misComisiones, refetchInterval: 60_000 });
