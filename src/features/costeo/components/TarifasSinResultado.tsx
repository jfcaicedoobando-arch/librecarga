/**
 * Estado vacío del Top 3 de tarifas.
 *
 * P2 (2026-09-02): antes decía siempre "No hay tarifas vigentes", incluso
 * cuando la tarifa existía en borrador (pendiente de aprobación) o vencida.
 */
import { FileSearch, Clock, CalendarX } from "lucide-react";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { formatDate } from "@/lib/formatters";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { LoadingState } from "@/components/shared/states/LoadingState";
import type { DiagnosticoTarifas } from "@/features/costeo/services/diagnosticoTarifas";

export interface TarifasSinResultadoProps {
  diagnostico?: DiagnosticoTarifas;
  consultando: boolean;
  error?: boolean;
  onRetry?: () => void;
  fecha?: string;
}

export function TarifasSinResultado({ diagnostico, consultando, error, onRetry, fecha }: TarifasSinResultadoProps) {
  const fechaTexto = fecha ? `Fecha consultada: ${formatDate(fecha)}.` : "";
  if (error) {
    return (
      <div className="space-y-2">
        <EmptyStateInline icon={FileSearch} message="No hay tarifas vigentes para esta combinación." hint={fechaTexto || undefined} />
        <ErrorStateInline
          title="No pudimos comprobar si hay tarifas vencidas o pendientes"
          message="Reintenta el diagnóstico con los filtros actuales."
          onRetry={onRetry}
          retrying={consultando}
        />
      </div>
    );
  }
  if (consultando) {
    return <LoadingState label="Comprobando si hay tarifas pendientes o vencidas…" minHeight="min-h-24" />;
  }
  if (diagnostico === "pendiente") {
    return (
      <EmptyStateInline
        icon={Clock}
        message="Existe una tarifa para esta combinación, pero está pendiente de aprobación."
        hint={`${fechaTexto} Pide a Operaciones que la apruebe en “Solicitudes de pricing” para poder usarla.`.trim()}
      />
    );
  }
  if (diagnostico === "vencida") {
    return (
      <EmptyStateInline
        icon={CalendarX}
        message="La tarifa de esta combinación está vencida."
        hint={`${fechaTexto} Actualiza su vigencia o captura una nueva en “Solicitudes de pricing”.`.trim()}
      />
    );
  }
  return (
    <EmptyStateInline
      icon={FileSearch}
      message="No hay tarifas vigentes para esta combinación."
      hint={diagnostico === "ninguna" ? `${fechaTexto} Captura una nueva en “Solicitudes de pricing”.`.trim() : fechaTexto || undefined}
    />
  );
}
