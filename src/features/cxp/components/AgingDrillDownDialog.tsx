/**
 * Diálogo drill-down de aging: al abrir una fila de proveedor en /compras/aging
 * muestra sus facturas con saldo abierto, con badge de cubeta y exporta a CSV.
 *
 * v13.303.95 · Rediseño al design language del detalle CxP:
 * chip-folio inline, filtro de cubetas como chips en action bar y export en overflow.
 */
import { useMemo, useState } from "react";
import { FileText, X, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Button } from "@/components/ui/button";

import { TooltipProvider } from "@/components/ui/tooltip";
import { dialogSize } from "@/components/shared/utils/dialogTokens";
import { defineColumns } from "@/components/shared/DataTable";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { Card, CardContent } from "@/components/ui/card";
import { useFacturasCxP } from "@/features/cxp/hooks";
import type { FacturaCxP } from "@/features/cxp/services";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { CxpAgingRow } from "@/features/cxp/services/cxpAging";
import { bucketDeDias, BUCKET_LABELS, BUCKET_TONE, type CubetaAging } from "./agingBuckets";
import { ToneBadge } from "@/components/shared/ToneBadge";

import { todayLocalISO } from "@/lib/date/today";
import { AgingKpiRow } from "./AgingDrillDownDialog.parts";
import { AgingActionBar } from "@/components/shared/AgingActionBar";
import { CUBETAS_AGING } from "@/lib/aging/buckets";

const opciones = [{ value: "todas" as const, label: "Todas" },
  ...CUBETAS_AGING.map((value) => ({ value, label: value === "mas_90" ? ">90 d" : BUCKET_LABELS[value] })),
];
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { clasificarAFecha } from "@/lib/aging/reportScope";

interface Props {
  proveedor: CxpAgingRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cubetaInicial?: CubetaAging | "todas";
  fechaReferencia?: string;
}

function FacturaAgingCard({ factura }: { factura: FacturaCxP }) {
  const bucket = bucketDeDias(factura.dias_vencido);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="break-all font-mono text-body-sm">{factura.folio_proveedor}</p>
          <ToneBadge tone={BUCKET_TONE[bucket]}>{BUCKET_LABELS[bucket]}</ToneBadge>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-body-sm">
          <div><dt>Emisión</dt><dd>{formatDate(factura.fecha_emision)}</dd></div>
          <div><dt>Vencimiento</dt><dd>{factura.fecha_vencimiento ? formatDate(factura.fecha_vencimiento) : "—"}</dd></div>
          <div><dt>Días</dt><dd>{factura.dias_vencido > 0 ? "+" : ""}{factura.dias_vencido}</dd></div>
        </dl>
        <MoneyCell label="Saldo" value={formatCurrency(factura.saldo, factura.moneda)} highlight />
      </CardContent>
    </Card>
  );
}

function AgingDrillDownBody({ proveedor, open, onOpenChange, cubetaInicial = "todas", fechaReferencia = todayLocalISO() }: Props) {
  const [cubeta, setCubeta] = useState<CubetaAging | "todas">(cubetaInicial);
  const { data: facturas = [], isLoading, isError, isFetching, refetch } = useFacturasCxP(
    proveedor ? { proveedor_id: proveedor.proveedor_id, moneda: proveedor.moneda } : {},
  );

  const moneda = proveedor?.moneda;
  const abiertas = useMemo(() => clasificarAFecha(facturas, fechaReferencia).filter((f) => f.saldo > 0.005 && f.moneda === moneda), [facturas, moneda, fechaReferencia]);
  const filtradas = useMemo(() => {
    if (cubeta === "todas") return abiertas;
    return abiertas.filter((f) => bucketDeDias(f.dias_vencido) === cubeta);
  }, [abiertas, cubeta]);

  const columns = useMemo(() => defineColumns<FacturaCxP>([
    {
      id: "folio_prov", header: "Folio prov.",
      cell: ({ row }) => <span className="font-mono text-body-sm">{row.original.folio_proveedor}</span>,
    },
    { id: "emision", header: "Emisión", cell: ({ row }) => formatDate(row.original.fecha_emision) },
    {
      id: "vencimiento", header: "Vencimiento",
      cell: ({ row }) => row.original.fecha_vencimiento ? formatDate(row.original.fecha_vencimiento) : "—",
    },
    {
      id: "dias", header: "Días",
      cell: ({ row }) => {
        const bucket = bucketDeDias(row.original.dias_vencido);
        return (
          <div className="flex items-center gap-1.5">
            <span className="tabular-nums text-body">
              {row.original.dias_vencido > 0 ? `+${row.original.dias_vencido}` : row.original.dias_vencido}
            </span>
            <ToneBadge tone={BUCKET_TONE[bucket]}>{BUCKET_LABELS[bucket]}</ToneBadge>
          </div>
        );
      },
    },
    {
      id: "saldo", header: "Saldo",
      cell: ({ row }) => (
        <span className="tabular-nums font-medium">
          {formatCurrency(row.original.saldo, row.original.moneda)}
        </span>
      ),
    },
  ]), []);

  const detalleDisponible = !isLoading && !isError;
  const exportCount = detalleDisponible ? filtradas.length : undefined;
  const handleExport = () => {
    if (!detalleDisponible || filtradas.length === 0 || !proveedor) return;
    const headers = ["Folio proveedor", "Emisión", "Vencimiento", "Días", "Cubeta", "Moneda", "Saldo", "Fecha para antigüedad", "Filtro de cubeta"];
    const lines = filtradas.map((f) => {
      const bucket = bucketDeDias(f.dias_vencido);
      return [
        `"${f.folio_proveedor.replace(/"/g, '""')}"`,
        f.fecha_emision, f.fecha_vencimiento ?? "",
        f.dias_vencido, BUCKET_LABELS[bucket], f.moneda, f.saldo,
        fechaReferencia, cubeta === "todas" ? "Todas las cubetas" : BUCKET_LABELS[cubeta],
      ].join(",");
    });
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = proveedor.proveedor_nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
    a.download = `aging-${slug}-${fechaReferencia}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={`${dialogSize["3xl"]} max-h-[90vh] flex flex-col gap-0 p-0`}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b bg-muted/30 space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <FileText className="h-5 w-5 text-accent" aria-hidden />
              <DialogTitle className="text-primary">
                Facturas con saldo
              </DialogTitle>
              {proveedor && detalleDisponible && (
                <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-body-sm font-mono font-semibold uppercase tracking-wider border">
                  {filtradas.length} factura{filtradas.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <DialogDescription>
              Facturas abiertas del proveedor clasificadas al {formatDate(fechaReferencia)} en la cubeta seleccionada.
            </DialogDescription>
            {proveedor && (
              <p className="text-body-sm text-muted-foreground">{proveedor.proveedor_nombre}</p>
            )}
          </DialogHeader>


          {proveedor && (
            <AgingActionBar
              options={opciones}
              cubeta={cubeta}
              onChange={setCubeta}
              onExport={handleExport}
              exportDisabled={!exportCount}
              exportCount={exportCount}
            />
          )}

          {proveedor && <AgingKpiRow proveedor={proveedor} />}

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {!proveedor ? (
              <div className="flex items-center gap-2 text-body text-muted-foreground py-8 justify-center">
                <AlertTriangle className="h-4 w-4" />
                Selecciona un proveedor.
              </div>
            ) : isError ? (
              <ErrorStateInline
                title="No se pudieron consultar las facturas del proveedor"
                message="Reintenta para actualizar la cubeta seleccionada."
                onRetry={() => void refetch()}
                retrying={isFetching}
              />
            ) : (
              <ResponsiveDataTable<FacturaCxP>
                columns={columns}
                data={filtradas}
                isLoading={isLoading}
                rowKey={(f) => f.id}
                mobileCard={(factura) => <FacturaAgingCard factura={factura} />}
                emptyMessage="Este proveedor no tiene facturas con saldo en esta cubeta"
                density={TABLE_DENSITY.embebida}
                striped
                hoverable
              />
            )}
          </div>

          <div className="px-6 py-3 border-t flex justify-end bg-background">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-1" /> Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

/** Cada apertura/proveedor/moneda comienza en la cubeta solicitada, sin filtro heredado. */
export function AgingDrillDownDialog(props: Props) {
  const identity = `${props.proveedor?.proveedor_id}:${props.proveedor?.moneda}:${props.open}:${props.cubetaInicial ?? "todas"}:${props.fechaReferencia}`;
  return <AgingDrillDownBody key={identity} {...props} />;
}
