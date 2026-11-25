import { createContext, useContext } from "react";
import { Link } from "react-router";
import { defineColumns } from "@/components/shared/DataTable";
import { Hint } from "@/components/shared/Hint";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { COL_W } from "@/components/shared/dataTable/columnWidths";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsMobile } from "@/hooks/shared";
import { formatCurrency, formatDate, toTitleCase } from "@/lib/formatters";
import type { NotaCreditoConFactura } from "@/features/facturacion/services/notasCredito";
import { ESTADOS_NC_CON_CFDI } from "./notasCreditoZip.constants";

function facturaHref(nota: NotaCreditoConFactura) {
  return `/facturacion/${nota.factura_id}`;
}

function facturaLabel(nota: NotaCreditoConFactura) {
  return `Ver factura ${nota.factura_numero}`;
}

function montoNota(nota: NotaCreditoConFactura) {
  return formatCurrency(Number(nota.monto), nota.moneda);
}

function EstadoNota({ nota }: { nota: NotaCreditoConFactura }) {
  return <StatusBadge domain="cfdi" status={nota.estado.toLowerCase()} label={nota.estado} />;
}

interface SeleccionNotas {
  seleccion: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

// Las columnas estáticas mantienen montada la casilla de escritorio al seleccionarla.
const SeleccionNotasContext = createContext<SeleccionNotas | null>(null);

function SeleccionNota({ nota }: { nota: NotaCreditoConFactura }) {
  const controles = useContext(SeleccionNotasContext);
  if (!controles) return null;
  return (
    <Checkbox
      aria-label={`Seleccionar ${nota.folio}`}
      checked={controles.seleccion.has(nota.id)}
      onCheckedChange={() => controles.onToggle(nota.id)}
    />
  );
}

function NotaRecienteMobileCard({ nota }: { nota: NotaCreditoConFactura }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words font-mono text-body-sm font-semibold">{nota.folio}</span>
        <EstadoNota nota={nota} />
      </div>
      <p className="break-words text-body-sm">{toTitleCase(nota.cliente_nombre)}</p>
      <p className="break-words text-body-sm text-muted-foreground">{formatDate(nota.fecha_emision)} · {nota.motivo}</p>
      <MoneyCell label="Monto" value={montoNota(nota)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="link" size="sm" className="h-auto min-h-11 min-w-0 whitespace-normal px-0 text-left">
          <Link to={facturaHref(nota)}><span className="min-w-0 break-words">{facturaLabel(nota)}</span></Link>
        </Button>
        {ESTADOS_NC_CON_CFDI.has(nota.estado) && (
          <label className="inline-flex min-h-11 items-center gap-2 text-body-sm">
            <SeleccionNota nota={nota} />
            Seleccionar
          </label>
        )}
      </div>
    </div>
  );
}

const columns = defineColumns<NotaCreditoConFactura>([
  {
    id: "seleccion", header: () => <span className="sr-only">Seleccionar</span>, meta: { width: COL_W.micro },
    cell: ({ row: { original: nota } }) => ESTADOS_NC_CON_CFDI.has(nota.estado)
      ? <SeleccionNota nota={nota} />
      : null,
  },
  { id: "folio", header: "Folio", meta: { width: COL_W.folio, className: "font-mono whitespace-nowrap" }, cell: ({ row }) => row.original.folio },
  { id: "factura", header: "Factura", meta: { className: "font-mono whitespace-nowrap" }, cell: ({ row }) => row.original.factura_numero },
  {
    id: "cliente", header: "Cliente",
    cell: ({ row }) => {
      const cliente = toTitleCase(row.original.cliente_nombre);
      return <Hint label={cliente}><span className="block max-w-[200px] truncate">{cliente}</span></Hint>;
    },
  },
  { id: "fecha", header: "Fecha", meta: { width: COL_W.fecha, className: "whitespace-nowrap" }, cell: ({ row }) => formatDate(row.original.fecha_emision) },
  { id: "motivo", header: "Motivo", cell: ({ row }) => row.original.motivo },
  { id: "estado", header: "Estado", meta: { width: COL_W.estado }, cell: ({ row }) => <EstadoNota nota={row.original} /> },
  { id: "monto", header: "Monto", meta: { width: COL_W.monto, align: "right", className: "tabular-nums whitespace-nowrap" }, cell: ({ row }) => montoNota(row.original) },
]);

export function NotasCreditoRecientesListado({ notas, seleccion, onToggle }: SeleccionNotas & {
  notas: NotaCreditoConFactura[];
}) {
  const isMobile = useIsMobile();

  return (
    <SeleccionNotasContext value={{ seleccion, onToggle }}>
      <ResponsiveDataTable
        columns={columns}
        data={notas}
        rowKey={(nota) => nota.id}
        getRowHref={isMobile ? undefined : facturaHref}
        getRowAriaLabel={facturaLabel}
        density={TABLE_DENSITY.embebida}
        striped={false}
        tableClassName="w-full"
        mobileCard={(nota) => <NotaRecienteMobileCard nota={nota} />}
      />
    </SeleccionNotasContext>
  );
}
