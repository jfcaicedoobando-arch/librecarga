/**
 * Estado vacío del Top 3 de tarifas.
 *
 * P2 (2026-09-02): antes decía siempre "No hay tarifas vigentes", incluso
 * cuando la tarifa existía en borrador (pendiente de aprobación) o vencida.
 */
import { FileSearch, Clock, CalendarX } from "lucide-react";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { LoadingState } from "@/components/shared/states/LoadingState";
import type { DiagnosticoTarifas } from "@/features/costeo/services/diagnosticoTarifas";

export interface TarifasSinResultadoProps {
  diagnostico?: DiagnosticoTarifas;
  consultando: boolean;
}

export function TarifasSinResultado({ diagnostico, consultando }: TarifasSinResultadoProps) {
  if (consultando) {
    return <LoadingState label="Comprobando si hay tarifas pendientes o vencidas…" minHeight="min-h-24" />;
  }
  if (diagnostico === "pendiente") {
    return (
      <EmptyStateInline
        icon={Clock}
        message="Existe una tarifa para esta combinación, pero está pendiente de aprobación."
        hint="Pide a Operaciones que la apruebe en “Solicitudes de pricing” para poder usarla."
      />
    );
  }
  if (diagnostico === "vencida") {
    return (
      <EmptyStateInline
        icon={CalendarX}
        message="La tarifa de esta combinación está vencida."
        hint="Actualiza su vigencia o captura una nueva en “Solicitudes de pricing”."
      />
    );
  }
  return (
    <EmptyStateInline
      icon={FileSearch}
      message="No hay tarifas vigentes para esta combinación."
      hint={diagnostico === "ninguna" ? "Captura una nueva en “Solicitudes de pricing”." : undefined}
    />
  );
}
