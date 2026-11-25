import { memo, useMemo } from "react";
import { TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MargenBadge } from "@/components/shared/MargenBadge";
import { Hint } from "@/components/shared/Hint";
import { UMBRAL_MARGEN_COTIZACION } from "@/lib/ui/margen";
import { defineColumns, type ColumnDef, type SortDir } from "@/components/shared/DataTable";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { sortByNumber } from "@/components/shared/dataTable/sortingFns";
import { useTableInstance, type ControlledSort } from "@/components/shared/dataTable/useTableInstance";
import { formatCurrency, toTitleCase, formatTipoCambio} from "@/lib/formatters";
import type { EmbarqueConProfit } from "@/features/dashboard/hooks";
import { usePermissions } from "@/hooks/shared/usePermissions";
import { useIsMobile } from "@/hooks/shared/useIsMobile";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { proyectarFilasUtilidadVisible } from "@/features/dashboard/domain/proyeccionVisible";

interface Props {
  embarques: EmbarqueConProfit[];
  isLoading: boolean;
}

const IMPORTE_MOVIL = "overflow-visible text-clip whitespace-normal break-words";
const ORDENES_MOVIL = [
  { key: null, dir: "asc", label: "Orden predeterminado" },
  { key: "profit", dir: "desc", label: "Mayor utilidad" },
  { key: "profit", dir: "asc", label: "Menor utilidad" },
  { key: "margen", dir: "desc", label: "Mayor margen" },
  { key: "margen", dir: "asc", label: "Menor margen" },
] as const;

function claveOrden(key: string | null, dir: SortDir) {
  return key ? `${key}:${dir}` : "predeterminado";
}

function OrdenUtilidadMovil({ sort, onSortChange }: {
  sort: ControlledSort;
  onSortChange: (key: string | null, dir: SortDir) => void;
}) {
  return (
    <div className="mb-3">
      <Select value={claveOrden(sort.key, sort.dir)} onValueChange={(value) => {
        const orden = ORDENES_MOVIL.find(({ key, dir }) => claveOrden(key, dir) === value);
        if (orden) onSortChange(orden.key, orden.dir);
      }}>
        <SelectTrigger className="w-full" aria-label="Ordenar arribos"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ORDENES_MOVIL.map(({ key, dir, label }) => (
            <SelectItem key={label} value={claveOrden(key, dir)}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ProfitMobileCard({ e, verCostos }: { e: EmbarqueConProfit; verCostos: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 wrap-anywhere">
          <p className="font-medium">{e.expediente}</p>
          <p className="text-body-sm text-muted-foreground">{toTitleCase(e.cliente_nombre)}</p>
        </div>
        {verCostos && (
          <div>
            <p className="text-overline font-medium">Margen</p>
            <MargenBadge pct={e.margenMXN} umbrales={UMBRAL_MARGEN_COTIZACION} className="text-label" />
          </div>
        )}
      </div>
      <div className={verCostos ? "grid grid-cols-2 gap-2" : undefined}>
        <MoneyCell label="Venta MXN" value={formatCurrency(e.ventaMXN, "MXN")} valueClassName={IMPORTE_MOVIL} />
        {verCostos && (
          <>
            <MoneyCell label="Costo MXN" value={formatCurrency(e.costoMXN, "MXN")} valueClassName={IMPORTE_MOVIL} />
            <MoneyCell label="Utilidad MXN" value={formatCurrency(e.profitMXN, "MXN")} highlight
              className="col-span-2" valueClassName={`${IMPORTE_MOVIL} ${e.profitMXN >= 0 ? "text-success" : "text-destructive"}`} />
          </>
        )}
      </div>
    </div>
  );
}

function MoneyWithBreakdown({ e, value }: { e: EmbarqueConProfit; value: number }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`cursor-help ${value >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(value, "MXN")}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <div className="space-y-1 text-body">
            <div className="font-semibold border-b pb-1 mb-1">Desglose homologado a MXN</div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Venta:</span><span className="tabular-nums">{formatCurrency(e.ventaMXN, "MXN")}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Costo:</span><span className="tabular-nums">{formatCurrency(e.costoMXN, "MXN")}</span></div>
            <div className="border-t pt-1 mt-1 space-y-0.5 text-label text-muted-foreground">
              <div className="flex justify-between gap-3"><span>USD → MXN:</span><span className="tabular-nums">V {formatCurrency(e.ventaMxnFromUsd, "MXN")} · C {formatCurrency(e.costoMxnFromUsd, "MXN")}</span></div>
              <div className="flex justify-between gap-3"><span>EUR → MXN:</span><span className="tabular-nums">V {formatCurrency(e.ventaMxnFromEur, "MXN")} · C {formatCurrency(e.costoMxnFromEur, "MXN")}</span></div>
              <div className="flex justify-between gap-3"><span>MXN nativo:</span><span className="tabular-nums">V {formatCurrency(e.ventaMxnNative, "MXN")} · C {formatCurrency(e.costoMxnNative, "MXN")}</span></div>
              <div className="pt-1 italic">TC USD {formatTipoCambio(e.tipoCambioUSD)} · TC EUR {formatTipoCambio(e.tipoCambioEUR)}</div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * QA B-07 — Columnas de la tabla de utilidad.
 * En modo "solo ventas" (roles comerciales sin permiso de costos) se omiten
 * costo, utilidad y margen: sólo se muestra el lado de venta.
 */
function construirColumnas(verCostos: boolean): ColumnDef<EmbarqueConProfit, unknown>[] {
  return defineColumns<EmbarqueConProfit>([
  { id: "expediente", header: "Expediente", meta: { className: "font-medium" }, cell: ({ row }) => row.original.expediente },
  { id: "cliente", header: "Cliente", meta: { className: "max-w-[240px] truncate" }, cell: ({ row }) => <Hint label={row.original.cliente_nombre}><span>{toTitleCase(row.original.cliente_nombre)}</span></Hint> },
  { id: "venta", header: "Venta MXN", meta: { className: "text-right tabular-nums", headerClassName: "text-right" }, cell: ({ row }) => formatCurrency(row.original.ventaMXN, "MXN") },
  { id: "costo", header: "Costo MXN", meta: { className: "text-right tabular-nums", headerClassName: "text-right" }, cell: ({ row }) => formatCurrency(row.original.costoMXN, "MXN") },
  {
    id: "profit", header: "Utilidad MXN",
    accessorFn: (e) => e.profitMXN, enableSorting: true,
    sortFn: sortByNumber<EmbarqueConProfit>((e) => e.profitMXN),
    meta: { className: "text-right font-semibold tabular-nums", headerClassName: "text-right" },
    cell: ({ row }) => <MoneyWithBreakdown e={row.original} value={row.original.profitMXN} />,
  },
  {
    id: "margen", header: "Margen",
    accessorFn: (e) => e.margenMXN, enableSorting: true,
    sortFn: sortByNumber<EmbarqueConProfit>((e) => e.margenMXN),
    meta: { className: "text-right", headerClassName: "text-right" },
    cell: ({ row }) => (
      <MargenBadge pct={row.original.margenMXN} umbrales={UMBRAL_MARGEN_COTIZACION} className="text-label" />
    ),
  },
  ]).filter((c) => verCostos || !["costo", "profit", "margen"].includes(String(c.id)));
}

export const ProfitTable = memo(function ProfitTable({ embarques, isLoading }: Props) {
  const { canViewCosts } = usePermissions();
  const movil = useIsMobile();
  const columns = useMemo(() => construirColumnas(canViewCosts), [canViewCosts]);
  // P2-B: misma política de presentación que el tablero y el P&L del embarque:
  // utilidad y margen visibles se derivan de venta/costo ya redondeados.
  const filas = useMemo(() => proyectarFilasUtilidadVisible(embarques), [embarques]);
  // Una sola instancia ordena las filas para las tarjetas y los encabezados.
  const table = useTableInstance({ data: filas, columns, sortMode: "client", enableSorting: canViewCosts });
  const orden = canViewCosts ? table.state.sorting[0] : undefined;
  const sort: ControlledSort = { key: orden?.id ?? null, dir: orden?.desc ? "desc" : "asc" };
  const onSortChange = (key: string | null, dir: SortDir) => {
    table.setSorting(key ? [{ id: key, desc: dir === "desc" }] : []);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-success" />
          {canViewCosts ? "Utilidad MXN — Arribos este mes" : "Venta MXN — Arribos este mes"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {movil && canViewCosts && !isLoading && filas.length > 1 && <OrdenUtilidadMovil sort={sort} onSortChange={onSortChange} />}
        <div className="overflow-auto max-h-[320px]">
          <ResponsiveDataTable
            columns={columns}
            data={orden ? table.getRowModel().rows.map(({ original }) => original) : filas}
            sortMode="server"
            controlledSort={sort}
            onSortChange={onSortChange}
            isLoading={isLoading}
            emptyMessage="Sin embarques con arribo este mes"
            getRowHref={(e) => `/embarques/${e.id}`}
            rowKey={(e) => e.id}
            mobileCard={(e) => <ProfitMobileCard e={e} verCostos={canViewCosts} />}
            skeletonRows={4}
            density={TABLE_DENSITY.embebida}
          />
        </div>
      </CardContent>
    </Card>
  );
});
