/** Tarjeta «Costo cotizado vs real» por moneda (sólo lectura). */
import { DataTable, defineColumns } from "@/components/shared/DataTable";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const visible = resumen && resumen.estado !== "sin_cotizacion" ? resumen : null;
  if (!consulta.isError && !visible) return null;
  return (
    <section aria-label="Costo cotizado vs real">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle as="h3">Costo cotizado vs real</CardTitle>
            {visible && <Badge variant="outline">{ETIQUETA_ESTADO_COSTO[visible.estado]}</Badge>}
            {visible?.cotizacionFolio && <span className="text-caption text-muted-foreground">
              {[visible.cotizacionFolio, visible.expediente].filter(Boolean).join(" · ")}</span>}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {consulta.isError && (
            <ErrorStateInline message="No se pudo calcular la comparación de costos."
              onRetry={() => void consulta.refetch()} retrying={consulta.isFetching} />
          )}
          {visible && (
            <>
              <TablaCostoReal resumen={visible} />
              <p className="text-caption text-muted-foreground">Real = facturas de proveedor vigentes del embarque, antes de IVA. Cada moneda se compara por separado.</p>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
