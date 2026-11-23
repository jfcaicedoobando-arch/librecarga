/**
 * Estados vacíos del listado de proformas. Extraído de `TabProformas.tsx`
 * para mantener la complejidad del componente bajo el límite del linter
 * (Power of 10) sin cambiar el copy ni el comportamiento.
 */
import { FileSpreadsheet } from "lucide-react";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { usePermissions } from "@/hooks/shared";
import { hasRouteAccess } from "@/lib/access/roleRouteMatrix";
import EmptyState from "@/components/empty/EmptyState";


export function ProformasEmptyState({
  search,
  filtroEstado,
  hayFiltrosAdicionales = false,
  onLimpiarBusqueda,
  onLimpiarFiltros,
}: {
  search: string;
  filtroEstado: string;
  hayFiltrosAdicionales?: boolean;
  onLimpiarBusqueda: () => void;
  onLimpiarFiltros: () => void;
}) {
  const { role } = usePermissions();
  const q = search.trim();
  if (q) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title={`Sin resultados para «${q}»`}
        description="Ajusta la búsqueda o límpiala para ver todas las proformas."
        primaryAction={{ label: "Limpiar búsqueda", onClick: onLimpiarBusqueda }}
      />
    );
  }
  if (filtroEstado === "todas" && !hayFiltrosAdicionales) {
    return (
      <EmptyStateInline
        icon={FileSpreadsheet}
        message="Aún no hay proformas"
        hint="Abre un embarque confirmado y elige Generar proforma en la pestaña Facturación."
        action={hasRouteAccess(role, "/embarques")
          ? { label: "Ir a Embarques", to: "/embarques" }
          : undefined}
      />
    );
  }
  if (filtroEstado === "aceptada") {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="Ninguna proforma aceptada pendiente de emitir"
        description="Cuando un cliente acepte una proforma, aparecerá aquí lista para convertirse en factura."
        primaryAction={{ label: "Limpiar filtros", onClick: onLimpiarFiltros }}
      />
    );
  }
  return (
    <EmptyState
      icon={FileSpreadsheet}
      title="No hay proformas con estos filtros"
      description="Ajusta o quita los filtros aplicados para ver el listado completo de proformas."
      primaryAction={{ label: "Limpiar filtros", onClick: onLimpiarFiltros }}
    />
  );
}
