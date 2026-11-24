import { useId } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Mail, FileSpreadsheet } from "lucide-react";
import { DetailHeader } from "@/components/shared/DetailHeader";
import { useVolver } from "@/hooks/shared/useVolver";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { toTitleCase, formatDate } from "@/lib/formatters";
import type { CotizacionRow } from "@/features/cotizacion/types";
import { tieneImportesEfectivos } from "@/lib/domain/cotizacionDetalle";

interface Props {
  cotizacion: CotizacionRow;
  nombreDestinatario: string;
  onBack: () => void;
  onExportarPdf: () => void;
  /** M14 (Ola 7): true mientras el PDF se genera; evita el doble clic. */
  exportandoPdf?: boolean;
  onEnviarEmail?: () => void;
  yaEnviada?: boolean;
}

export function CotizacionDetalleHeader({ cotizacion, nombreDestinatario, onExportarPdf, exportandoPdf = false, onEnviarEmail, yaEnviada }: Props) {
  const volver = useVolver("/cotizaciones");
  const motivoImporteId = useId();
  // R-08: una cotización sin importe no puede enviarse al cliente.
  // W-01 (QA r2): se evalúa contra los conceptos de venta (USD y MXN) — antes
  // sólo `subtotal`, que era 0 en cotizaciones MXN-only y bloqueaba el envío
  // aunque la cotización sí tuviera importes.
  // v13.823.346 — regla única de importe efectivo (filas USD legacy sin `total`).
  const sinImporte = !tieneImportesEfectivos(cotizacion.conceptos_venta);
  const mostrarEnvio = !!onEnviarEmail && !cotizacion.es_prospecto;
  const metaFecha = cotizacion.fecha_aceptacion
    ? `Aceptada el ${formatDate(cotizacion.fecha_aceptacion, "dd/MM/yyyy HH:mm")}`
    : cotizacion.fecha_rechazo
      ? `Rechazada el ${formatDate(cotizacion.fecha_rechazo, "dd/MM/yyyy HH:mm")}`
      : null;

  return (
    <DetailHeader
      backTo={volver}
      backLabel="Volver a Cotizaciones"
      icon={<FileSpreadsheet className="h-6 w-6 text-accent shrink-0" />}
      title={cotizacion.folio}
      subtitle={toTitleCase(nombreDestinatario)}
      badge={<StatusBadge domain="cotizacion" status={cotizacion.estado} />}
      meta={metaFecha ? <span className="text-body-sm text-muted-foreground">{metaFecha}</span> : undefined}
      trailing={
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onExportarPdf} disabled={exportandoPdf || sinImporte}
              aria-describedby={sinImporte ? motivoImporteId : undefined}>
              <FileDown className="h-4 w-4 mr-1" /> {exportandoPdf ? "Generando…" : "Exportar PDF"}
            </Button>
            {mostrarEnvio && (
              <Button
                variant="default"
                size="sm"
                onClick={onEnviarEmail}
                disabled={sinImporte}
                aria-describedby={sinImporte ? motivoImporteId : undefined}
              >
                <Mail className="h-4 w-4 mr-1" /> {yaEnviada ? "Reenviar" : "Enviar por correo"}
              </Button>
            )}
          </div>
          {sinImporte && (
            <p id={motivoImporteId} className="text-body-sm text-muted-foreground">
              Agrega conceptos de venta con importe antes de {mostrarEnvio ? "exportar o enviar" : "exportar"} la cotización.
            </p>
          )}
        </div>
      }
    />
  );
}


