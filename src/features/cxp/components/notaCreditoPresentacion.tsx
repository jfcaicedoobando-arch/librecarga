import { FileDigit, FileText, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { defineColumns } from "@/components/shared/DataTable";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { MobileRowDetails } from "@/components/shared/dataTable/MobileRowDetails";
import { ToneBadge } from "@/components/shared/ToneBadge";
import { NotaCreditoImporte } from "@/components/shared/NotaCreditoImporte";
import { Hint } from "@/components/shared/Hint";
import { formatFechaDia } from "@/lib/formatters";
import type { ChipTone } from "@/lib/ui/badgeTone";
import type { NotaCreditoProveedor as NotaCredito } from "@/features/cxp/types";
import { NcSatBadge } from "./NcSatBadge";

const NC_TONES: Record<string, { tone: ChipTone; label: string }> = {
  Aplicada: { tone: "success", label: "Aplicada" },
  Aprobada: { tone: "info", label: "Aprobada" },
  Cancelada: { tone: "neutral", label: "Cancelada" },
  Borrador: { tone: "neutral", label: "Borrador" },
};

function NcEstadoBadge({ nota }: { nota: NotaCredito }) {
  const meta = NC_TONES[nota.estado] ?? { tone: "neutral" as ChipTone, label: nota.estado };
  return <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>;
}

interface Acciones {
  facturaId: string;
  canEdit: boolean;
  pendingAprobar: boolean;
  pendingAplicar: boolean;
  pendingCancelar: boolean;
  onAbrirArchivo: (path: string) => void;
  onAprobar: (id: string) => void;
  onAplicar: (id: string) => void;
  onCancelar: (nota: { id: string; folio: string }) => void;
}

export function ImporteNotaProveedor({ nota }: { nota: NotaCredito }) {
  return <NotaCreditoImporte nota={{ ...nota, monto: Number(nota.monto) }}
    factura={nota.proveedor_facturas} estado={nota.estado} />;
}

function SatNota({ nota, facturaId }: { nota: NotaCredito; facturaId: string }) {
  return <NcSatBadge facturaId={facturaId} ncId={nota.id} uuidFiscal={nota.uuid_fiscal} estatus={nota.uuid_estatus_sat} />;
}

function MenuNota({ nota, acciones, incluirArchivos = false }: {
  nota: NotaCredito; acciones: Acciones; incluirArchivos?: boolean;
}) {
  const folio = nota.folio_nc || "s/folio";
  const xml = incluirArchivos ? nota.archivo_xml_url : null;
  const pdf = incluirArchivos ? nota.archivo_pdf_url : null;
  const editar = acciones.canEdit && nota.estado !== "Cancelada";
  if (!editar && !xml && !pdf) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={"Acciones de la nota " + folio}>
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {xml && <DropdownMenuItem onSelect={() => acciones.onAbrirArchivo(xml)}>Descargar XML</DropdownMenuItem>}
        {pdf && <DropdownMenuItem onSelect={() => acciones.onAbrirArchivo(pdf)}>Descargar PDF</DropdownMenuItem>}
        {editar && nota.estado === "Borrador" && (
          <DropdownMenuItem disabled={acciones.pendingAprobar} onSelect={() => acciones.onAprobar(nota.id)}>Aprobar</DropdownMenuItem>
        )}
        {editar && nota.estado === "Aprobada" && (
          <DropdownMenuItem disabled={acciones.pendingAplicar} onSelect={() => acciones.onAplicar(nota.id)}>Aplicar al saldo</DropdownMenuItem>
        )}
        {editar && (
          <DropdownMenuItem disabled={acciones.pendingCancelar} className="text-destructive"
            onSelect={() => acciones.onCancelar({ id: nota.id, folio })}>Cancelar nota de crédito</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ArchivoNota({ tipo, nota, abrir }: { tipo: "PDF" | "XML"; nota: NotaCredito; abrir: Acciones["onAbrirArchivo"] }) {
  const ruta = tipo === "PDF" ? nota.archivo_pdf_url : nota.archivo_xml_url;
  const Icono = tipo === "PDF" ? FileText : FileDigit;
  if (!ruta) return <span className="text-muted-foreground/40">—</span>;
  return (
    <Hint label={"Descargar " + tipo}>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => abrir(ruta)}
        aria-label={"Descargar " + tipo + " de la nota " + (nota.folio_nc || "s/folio")}>
        <Icono className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </Hint>
  );
}

function notaCreditoColumns(acciones: Acciones) {
  return defineColumns<NotaCredito>([
    { id: "folio", header: "Folio", cell: ({ row }) => <span className="font-mono">{row.original.folio_nc || "s/folio"}</span> },
    { id: "fecha", header: "Fecha", cell: ({ row }) => formatFechaDia(row.original.fecha) },
    { id: "motivo", header: "Motivo", cell: ({ row }) => row.original.motivo },
    { id: "monto", header: "Monto", meta: { align: "right" }, cell: ({ row }) => <ImporteNotaProveedor nota={row.original} /> },
    { id: "estado", header: "Estado", meta: { align: "center" }, cell: ({ row }) => <NcEstadoBadge nota={row.original} /> },
    { id: "sat", header: "SAT", meta: { align: "center" }, cell: ({ row }) => <SatNota nota={row.original} facturaId={acciones.facturaId} /> },
    { id: "xml", header: "XML", meta: { align: "center" }, cell: ({ row }) => <ArchivoNota tipo="XML" nota={row.original} abrir={acciones.onAbrirArchivo} /> },
    { id: "pdf", header: "PDF", meta: { align: "center" }, cell: ({ row }) => <ArchivoNota tipo="PDF" nota={row.original} abrir={acciones.onAbrirArchivo} /> },
    { id: "acciones", header: () => <span className="sr-only">Acciones</span>, meta: { align: "right" },
      cell: ({ row }) => <MenuNota nota={row.original} acciones={acciones} /> },
  ]);
}

function NotaCreditoTarjeta({ nota, acciones }: { nota: NotaCredito; acciones: Acciones }) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto break-all font-medium">{nota.folio_nc || "s/folio"}</span>
        <NcEstadoBadge nota={nota} />
        <MenuNota nota={nota} acciones={acciones} incluirArchivos />
      </div>
      {nota.motivo && <p className="break-words text-body-sm">{nota.motivo}</p>}
      <MobileRowDetails fields={[
        { label: "Fecha", value: formatFechaDia(nota.fecha) },
        { label: "SAT", value: <SatNota nota={nota} facturaId={acciones.facturaId} /> },
        { label: "Monto", value: <ImporteNotaProveedor nota={nota} /> },
      ]} />
    </div>
  );
}

export function TablaNotasCreditoProveedor({ notas, acciones }: { notas: NotaCredito[]; acciones: Acciones }) {
  return (
    <ResponsiveDataTable
      columns={notaCreditoColumns(acciones)} data={notas} rowKey={(nota) => nota.id}
      density={TABLE_DENSITY.embebida}
      mobileCard={(nota) => <NotaCreditoTarjeta nota={nota} acciones={acciones} />}
    />
  );
}
