import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { formatFechaHora } from "@/lib/formatters";

interface Props {
  aviso: { expiresAt: string | null; urlParaCopiar?: string } | null;
  onClose: () => void;
}

export function EnlaceTrackingCopiadoDialog({ aviso, onClose }: Props) {
  const expiresAt = aviso?.expiresAt;
  const urlParaCopiar = aviso?.urlParaCopiar;
  const tieneVencimiento = !!expiresAt && Number.isFinite(Date.parse(expiresAt));
  return (
    <FormDialogShell
      open={aviso !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      icon={Copy}
      title={urlParaCopiar ? "Enlace público listo para copiar" : "Enlace público copiado"}
      description={urlParaCopiar
        ? "Copia el enlace del campo y envíalo al destinatario por el canal que uses."
        : "El enlace está en tu portapapeles. Envíalo al destinatario por el canal que uses."}
      size="md"
      footer={<Button onClick={onClose}>Entendido</Button>}
    >
      {urlParaCopiar && <div className="space-y-1.5">
        <Label htmlFor="enlace-tracking-manual">Enlace público de tracking</Label>
        <Input id="enlace-tracking-manual" readOnly value={urlParaCopiar}
          onFocus={(evento) => evento.currentTarget.select()} />
      </div>}
      <p className="text-body">
        Quien tenga este enlace podrá consultar el estado, la ruta, las fechas,
        el historial de seguimiento y el avance documental de este embarque.
        No permite descargar los archivos del expediente ni consultar notas internas.
      </p>
      <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-body-sm">
        <p className="font-medium">Vencimiento de este enlace</p>
        {tieneVencimiento ? (
          <p><time dateTime={expiresAt}>{formatFechaHora(expiresAt, {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
          })}</time> (hora de Ciudad de México)</p>
        ) : (
          <p>Vencimiento no disponible. Compruébalo antes de compartir el enlace.</p>
        )}
        <p>Copiar un enlace vigente conserva su fecha de vencimiento.</p>
      </div>
      <p className="text-body-sm text-muted-foreground">
        Puedes usar «Revocar este enlace» en Más acciones para que el enlace vigente
        deje de abrir el seguimiento del embarque.
      </p>
    </FormDialogShell>
  );
}
