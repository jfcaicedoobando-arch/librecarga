import { ExternalLink, ShieldCheck } from "lucide-react";
import { HallazgoSeveridadBadge } from "./HallazgoSeveridadBadge";
import { Button } from "@/components/ui/button";
import { DataTable, defineColumns, type ColumnDef } from "@/components/shared/DataTable";
import type { HallazgoAuditoria } from "@/features/auditoria/types";
import { HallazgoDetalleCell } from "./HallazgoDetalleCell";
import { COL_W } from "@/components/shared/dataTable/columnWidths";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { Hint } from "@/components/shared/Hint";
import { reglaToTab } from "./hallazgosTablaConfig";

interface Props {
  hallazgos: HallazgoAuditoria[];
}

function formatEta(eta: string | null): string {
  if (!eta) return "—";
  const [y, m, d] = eta.split("-");
  return `${d}/${m}/${y}`;
}

export function HallazgoTabla({ hallazgos }: Props) {
  const cols: ColumnDef<HallazgoAuditoria, unknown>[] = defineColumns<HallazgoAuditoria>([
    { id: "sev", header: "Severidad", meta: { width: COL_W.fecha },
      cell: ({ row }) => <HallazgoSeveridadBadge severidad={row.original.severidad} /> },
    { id: "exp", header: "Expediente", meta: { width: COL_W.monto, className: "font-medium tabular-nums" }, cell: ({ row }) => row.original.expediente },
    { id: "cliente", header: "Cliente", meta: { className: "truncate max-w-[200px]" },
      cell: ({ row }) => (
        <Hint label={row.original.cliente_nombre}>
          <span>{row.original.cliente_nombre || "—"}</span>
        </Hint>
      ) },
    { id: "estado", header: "Estado", meta: { width: COL_W.fecha, className: "text-body-sm text-muted-foreground" }, cell: ({ row }) => row.original.estado },
    { id: "eta", header: "ETA", meta: { width: COL_W.fecha, className: "text-body-sm tabular-nums text-muted-foreground" }, cell: ({ row }) => formatEta(row.original.eta) },
    { id: "detalle", header: "Detalle", meta: { className: "text-body" },
      cell: ({ row }) => {
        return <HallazgoDetalleCell hallazgo={row.original} />;
      } },
    { id: "acc", header: "", meta: { width: COL_W.short },
      cell: ({ row }) => {
        const h = row.original;
        const url = `${window.location.origin}/embarques/${h.embarque_id}?tab=${reglaToTab[h.regla]}`;
        return (
          <Hint label={`Abrir embarque ${h.expediente} en nueva pestaña`}>
            <Button
              size="sm" variant="ghost" className="h-7 gap-1 text-body-sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label={`Abrir embarque ${h.expediente} en nueva pestaña`}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir
            </Button>
          </Hint>
        );
      } },
  ]);

  if (hallazgos.length === 0) {
    return <EmptyStateInline icon={ShieldCheck} message="Sin hallazgos en esta categoría." />;
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <DataTable
        columns={cols}
        data={hallazgos}
        rowKey={(h) => `${h.embarque_id}-${h.regla}`}
        density={TABLE_DENSITY.embebida}
      />
    </div>
  );
}
