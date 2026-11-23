import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/states/ErrorState";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { CosteoTarifasTable } from "@/features/costeo/components/CosteoTarifasTable";
import { TarifasEmptyState } from "@/features/costeo/components/TarifasEmptyState";
import { TarifasGroupedView } from "@/features/costeo/components/TarifasGroupedView";
import type { useCosteoTarifasPageState } from "../useCosteoTarifasPageState";

type EstadoResultados = Pick<ReturnType<typeof useCosteoTarifasPageState>,
  "isError" | "isLoading" | "refetch" | "tarifasFiltradas" | "viewMode" | "hasActiveFilters" |
  "rutaIdFromUrl" | "clearAll" | "nuevo" | "editar" | "duplicar" | "setAEliminar">;

export function CosteoTarifasResultados({ estado, rutaLabel }: { estado: EstadoResultados; rutaLabel: string }) {
  if (estado.isError) return <ErrorState onRetry={() => void estado.refetch()} />;
  if (estado.tarifasFiltradas.length === 0) {
    return estado.isLoading ? (
      <div role="status"><EmptyStateInline loading message="Cargando tarifas…" /></div>
    ) : (
      <Card>
        <TarifasEmptyState
          hasActiveFilters={estado.hasActiveFilters}
          rutaLabel={estado.rutaIdFromUrl ? rutaLabel : undefined}
          onClearFilters={estado.clearAll}
          onNueva={estado.nuevo}
        />
      </Card>
    );
  }

  const acciones = { onEditar: estado.editar, onDuplicar: estado.duplicar, onEliminar: estado.setAEliminar };
  return estado.viewMode === "agrupada" ? (
    <TarifasGroupedView tarifas={estado.tarifasFiltradas} {...acciones} />
  ) : (
    <CosteoTarifasTable tarifas={estado.tarifasFiltradas} isLoading={estado.isLoading} {...acciones} />
  );
}
