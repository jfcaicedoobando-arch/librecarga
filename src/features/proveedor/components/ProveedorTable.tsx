import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { useProveedoresPaginados } from "@/features/proveedor/hooks";
import { useDebounce, useListPageState } from "@/hooks/shared";
import { toTitleCase } from "@/lib/formatters";
import type { Enums } from "@/types/db";
import { proveedorColumns } from "./proveedorTableColumns";
import EmptyState from "@/components/empty/EmptyState";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Truck } from "lucide-react";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";

type TipoProveedor = Enums<"tipo_proveedor">;

interface Props {
  tipo?: TipoProveedor | null;
  search: string;
  origen?: "Nacional" | "Extranjero" | "todos";
  onTotalChange?: (total: number) => void;
  onLimpiarFiltros: () => void;
  canCreate?: boolean;
  onCreateNew?: () => void;
}

export function ProveedorTable({ tipo, search, origen, onTotalChange, onLimpiarFiltros, canCreate, onCreateNew }: Props) {
  const { page, setPage, pageSize, setPageSize, resetPage } = useListPageState({}, 100, [50, 100, 200, 500]);
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    resetPage();
  }, [debouncedSearch, origen, tipo, resetPage]);

  const { data: resultado, isLoading, isError, isFetching, refetch } = useProveedoresPaginados({
    tipo,
    search: debouncedSearch,
    page,
    pageSize,
    origen,
  });

  const proveedores = resultado?.data ?? [];
  const totalCount = resultado?.count ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const hayFiltros = [search.trim(), tipo, origen === "todos" ? null : origen].some(Boolean);

  useEffect(() => {
    if (!isError) onTotalChange?.(totalCount);
  }, [isError, totalCount, onTotalChange]);

  if (isError) {
    return (
      <Card>
        <ErrorStateInline
          title="No se pudo cargar el directorio de proveedores"
          message="Reintenta para consultar los proveedores con los filtros actuales."
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ResponsiveDataTable
          columns={proveedorColumns}
          data={proveedores}
          isLoading={isLoading && proveedores.length === 0}
          emptyMessage={hayFiltros ? "Sin proveedores con estos filtros" : "Sin proveedores registrados"}
          emptyState={
            <EmptyState
              icon={Truck}
              title={hayFiltros ? "Sin proveedores con estos filtros" : "Aún no hay proveedores"}
              description={hayFiltros
                ? "Ajusta la búsqueda o limpia los filtros para volver al directorio."
                : "Registra tu primer proveedor para llevar el control de compras y gastos."}
              primaryAction={!hayFiltros && canCreate && onCreateNew ? { label: "Crear proveedor", onClick: onCreateNew } : undefined}
              secondaryAction={hayFiltros ? { label: "Limpiar filtros", onClick: onLimpiarFiltros } : undefined}
            />
          }
          getRowHref={(p) => `/proveedores/${p.id}`}
          rowKey={(p) => p.id}
          density={TABLE_DENSITY.listado}
          className="pb-24 sm:pb-0"
          mobileCard={(p) => (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-body truncate">{toTitleCase(p.nombre)}</div>
                <div className="text-body-sm text-muted-foreground truncate mt-0.5">{p.rfc || "—"}</div>
                <div className="text-label text-muted-foreground truncate mt-0.5">{p.contacto ? toTitleCase(p.contacto) : ""}</div>
              </div>
              {p.origen_proveedor && (
                <Badge variant="outline" className="text-label whitespace-nowrap">{p.origen_proveedor}</Badge>
              )}
            </div>
          )}
          pagination={{
            page,
            totalPages,
            onPageChange: setPage,
            pageSize,
            onPageSizeChange: (s: number) => { setPageSize(s); setPage(0); },
            pageSizeOptions: [50, 100, 200, 500],
            pageSizeLabels: { 500: "500" },
            total: totalCount,
          }}
        />
      </CardContent>
    </Card>
  );
}
