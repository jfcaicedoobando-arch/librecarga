/** Tarjeta «Costo cotizado vs real» por moneda (sólo lectura). */
import { DataTable, defineColumns } from "@/components/shared/DataTable";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/formatters/numbers";
import { useCostoVsReal } from "@/features/crm/hooks/useRecotizarPricing";
import { ETIQUETA_ESTADO_COSTO, type MonedaCostoReal, type ResumenCostoReal } from "@/features/crm/services/pricing/costoVsRealPricing";

const COLUMNAS_COSTO_REAL = defineColumns<MonedaCostoReal>([
  { id: "moneda", header: "Moneda", accessorKey: "moneda", enableSorting: false },
  {
    id: "cotizado",
    header: "Cotizado",
    cell: ({ row: { original } }) => formatCurrency(original.cotizado, original.moneda),
    meta: { align: "right" },
    enableSorting: false,
  },
  {
    id: "real",
    header: "Real",
    cell: ({ row: { original } }) => formatCurrency(original.real, original.moneda),
    meta: { align: "right" },
    enableSorting: false,
  },
  {
    id: "diferencia",
    header: "Diferencia",
    cell: ({ row: { original } }) => (
      <span className={original.diferencia > 0 ? "text-destructive" : undefined}>
        {formatCurrency(original.diferencia, original.moneda)}
      </span>
    ),
    meta: { align: "right" },
    enableSorting: false,
  },
  {
    id: "pct",
    header: "%",
    cell: ({ row: { original } }) => original.pct == null ? "—" : formatPercent(original.pct),
    meta: { align: "right" },
    enableSorting: false,
  },
]);

export function TablaCostoReal({ resumen }: { resumen: ResumenCostoReal }) {
  if (resumen.estado !== "con_resultado" && resumen.estado !== "esperando_facturas") return null;
  return (
    <DataTable
      columns={COLUMNAS_COSTO_REAL}
      data={resumen.monedas}
      rowKey={(moneda) => moneda.moneda}
      density={TABLE_DENSITY.embebida}
      striped={false}
      hoverable={false}
      emptyMessage="No hay costos por moneda."
    />
  );
}

export function CostoVsRealPricing({ solicitudId }: { solicitudId: string }) {
  const consulta = useCostoVsReal([solicitudId]);
  const resumen = consulta.data?.get(solicitudId);
  if (consulta.isLoading || !resumen || resumen.estado === "sin_cotizacion") return null;
  return (
    <section aria-label="Costo cotizado vs real" className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-subsection">Costo cotizado vs real</h3>
        <Badge variant="outline">{ETIQUETA_ESTADO_COSTO[resumen.estado]}</Badge>
        {resumen.cotizacionFolio && <span className="text-caption text-muted-foreground">
          {[resumen.cotizacionFolio, resumen.expediente].filter(Boolean).join(" · ")}</span>}
      </div>
      <TablaCostoReal resumen={resumen} />
      <p className="text-caption text-muted-foreground">Real = facturas de proveedor vigentes del embarque, antes de IVA. Cada moneda se compara por separado.</p>
    </section>
  );
}
