/**
 * Chips de filtros activos de CxP. Patrón consistente con Embarques.
 * No incluye Search (tiene input visible propio).
 */
import { ActiveFilterChips } from "@/components/shared/ActiveFilterChips";
import { formatDate } from "@/lib/formatters";

interface ProveedorOption { id: string; nombre: string }
interface CategoriaOption { id: string; nombre: string }

export interface CxpFiltrosChipsProps {
  estatus: string;
  onEstatusChange: (v: string) => void;
  moneda: string;
  onMonedaChange: (v: string) => void;
  origen: string;
  onOrigenChange: (v: string) => void;
  proveedorId: string;
  onProveedorChange: (v: string) => void;
  categoriaPresupuestoId: string;
  onCategoriaPresupuestoChange: (v: string) => void;
  fechaDesde: string;
  onFechaDesdeChange: (v: string) => void;
  fechaHasta: string;
  onFechaHastaChange: (v: string) => void;
  proveedores: ProveedorOption[];
  categorias: CategoriaOption[];
  onClearAll: () => void;
}

interface ChipDef { key: string; label: string; value: string; onRemove: () => void }

interface FilterRule {
  key: string;
  label: string;
  isActive: (p: CxpFiltrosChipsProps) => boolean;
  getValue: (p: CxpFiltrosChipsProps) => string;
  reset: (p: CxpFiltrosChipsProps) => void;
}

const FILTER_RULES: FilterRule[] = [
  {
    key: "estatus", label: "Estatus",
    isActive: (p) => !!p.estatus && p.estatus !== "todos",
    getValue: (p) => p.estatus,
    reset: (p) => p.onEstatusChange("todos"),
  },
  {
    key: "moneda", label: "Moneda",
    isActive: (p) => !!p.moneda && p.moneda !== "todas",
    getValue: (p) => p.moneda,
    reset: (p) => p.onMonedaChange("todas"),
  },
  {
    key: "origen", label: "Origen",
    isActive: (p) => !!p.origen && p.origen !== "todos",
    getValue: (p) => p.origen,
    reset: (p) => p.onOrigenChange("todos"),
  },
  {
    key: "proveedor", label: "Proveedor",
    isActive: (p) => !!p.proveedorId && p.proveedorId !== "todos",
    getValue: (p) => p.proveedores.find((x) => x.id === p.proveedorId)?.nombre ?? "—",
    reset: (p) => p.onProveedorChange("todos"),
  },
  {
    key: "categoria", label: "Categoría",
    isActive: (p) => !!p.categoriaPresupuestoId && p.categoriaPresupuestoId !== "todas",
    getValue: (p) => p.categorias.find((x) => x.id === p.categoriaPresupuestoId)?.nombre ?? "—",
    reset: (p) => p.onCategoriaPresupuestoChange("todas"),
  },
  {
    key: "fechaDesde", label: "Emisión desde",
    isActive: (p) => !!p.fechaDesde,
    getValue: (p) => formatDate(p.fechaDesde),
    reset: (p) => p.onFechaDesdeChange(""),
  },
  {
    key: "fechaHasta", label: "Emisión hasta",
    isActive: (p) => !!p.fechaHasta,
    getValue: (p) => formatDate(p.fechaHasta),
    reset: (p) => p.onFechaHastaChange(""),
  },
];

/** Helper puro data-driven: filtra reglas activas y arma los chips. */
function buildChips(p: CxpFiltrosChipsProps): ChipDef[] {
  return FILTER_RULES
    .filter((r) => r.isActive(p))
    .map((r) => ({
      key: r.key,
      label: r.label,
      value: r.getValue(p),
      onRemove: () => r.reset(p),
    }));
}

export function CxpFiltrosChips(p: CxpFiltrosChipsProps) {
  const chips = buildChips(p);
  return <ActiveFilterChips chips={chips} onClearAll={p.onClearAll} searchId="cxp-filtros-buscar"
    className="mt-3 border-t border-border pt-3 short:mt-2 short:pt-2" />;
}
