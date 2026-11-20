import { useQuery } from "@tanstack/react-query";
import { useOrgActiva } from "@/hooks/shared/useOrgActiva";
import { useMutationWithFeedback } from "@/hooks/shared";
import {
  liquidacionesPendientesBroker, liquidarBroker, recalcularComisionesBroker, pagarLiquidacionBroker, resumenComisionesBroker, setPorcentajesBroker,
} from "@/features/admin/services/brokers";

import { brokers } from "../queryKeys";

export function useResumenComisionesBroker() {
  const { organizationId } = useOrgActiva();
  return useQuery({ queryKey: brokers.comisiones(organizationId), queryFn: resumenComisionesBroker, enabled: !!organizationId });
}

export function useLiquidacionesBroker() {
  const { organizationId } = useOrgActiva();
  return useQuery({
    queryKey: brokers.liquidaciones(organizationId),
    queryFn: () => liquidacionesPendientesBroker(organizationId as string),
    enabled: !!organizationId,
  });
}

export const useSetPorcentajesBroker = () =>
  useMutationWithFeedback({
    mutationFn: (v: { id: string; broker: number; kam: number | null }) => setPorcentajesBroker(v.id, v.broker, v.kam),
    invalidate: [...brokers.all], successTitle: "Porcentajes actualizados",
    successDescription: "Aplican a cobros nuevos.", errorTitle: "No se pudieron guardar los porcentajes",
  });

export const useLiquidarBroker = () =>
  useMutationWithFeedback({
    mutationFn: (v: { brokerId: string; periodo: string }) => liquidarBroker(v.brokerId, v.periodo),
    invalidate: [...brokers.all], successTitle: "Liquidación generada", errorTitle: "No se pudo liquidar",
  });

export const usePagarLiquidacionBroker = () =>
  useMutationWithFeedback({
    mutationFn: (v: { id: string; fecha: string; referencia: string }) => pagarLiquidacionBroker(v.id, v.fecha, v.referencia),
    invalidate: [...brokers.all], successTitle: "Liquidación marcada como pagada", errorTitle: "No se pudo registrar el pago",
  });

export const useRecalcularComisionesBroker = () =>
  useMutationWithFeedback({
    mutationFn: () => recalcularComisionesBroker(),
    invalidate: [...brokers.all], successTitle: "Comisiones recalculadas",
    successDescription: "Sólo se ajustaron las que aún no estaban liquidadas.", errorTitle: "No se pudieron recalcular",
  });
