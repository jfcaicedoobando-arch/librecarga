import type { ColumnDef } from "@/components/shared/DataTable";
import { useTableInstance } from "@/components/shared/dataTable/useTableInstance";
import { useIsMobile } from "@/hooks/shared";

export function useOrdenTarifarioMovil<T extends object>(filas: T[], columns: ColumnDef<T, unknown>[]) {
  const movil = useIsMobile();
  const tabla = useTableInstance({
    data: filas,
    columns,
    sortMode: "client",
    enableSorting: movil,
  });
  const data = movil && tabla.state.sorting.length > 0
    ? tabla.getRowModel().rows.map((row) => row.original)
    : filas;
  return { movil, tabla, data };
}
