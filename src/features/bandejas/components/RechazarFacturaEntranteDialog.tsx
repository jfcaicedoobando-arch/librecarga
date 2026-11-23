/**
 * Diálogo de rechazo de un documento del buzón CxP.
 * Contabilidad indica por qué el archivo no sirve para capturar la factura.
 */
import { useState } from "react";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogSection } from "@/components/shared/FormDialogSection";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendiente: boolean;
  nombreArchivo?: string | null;
  expediente?: string | null;
  onConfirm: (motivo: string) => Promise<void> | void;
}

const MIN_MOTIVO = 10;

export function RechazarFacturaEntranteDialog({ open, onOpenChange, pendiente, nombreArchivo, expediente, onConfirm }: Props) {
  const [motivo, setMotivo] = useState("");
  const valido = motivo.trim().length >= MIN_MOTIVO;

  const cerrar = () => {
    if (pendiente) return;
    setMotivo("");
    onOpenChange(false);
  };

  const rechazar = async () => {
    if (pendiente || !valido) return;
    try {
      await onConfirm(motivo.trim());
      setMotivo("");
    } catch {
      // La mutación avisa del fallo. Conserva el motivo para corregirlo o reintentar.
    }
  };

  return (
    <FormDialogShell
      open={open}
      onOpenChange={(v) => { if (!v) cerrar(); }}
      busy={pendiente}
      icon={XCircle}
      title="Rechazar documento del buzón"
      description="Operación verá el motivo en el embarque para volver a enviarlo correctamente."
      size="md"
      footer={(
        <>
          <Button variant="outline" onClick={cerrar} disabled={pendiente}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={pendiente || !valido}
            onClick={() => void rechazar()}
          >
            {pendiente ? "Rechazando…" : "Rechazar"}
          </Button>
        </>
      )}
    >
      <p className="mb-3 break-words text-body-sm">
        <strong>Archivo:</strong> {nombreArchivo || "Sin nombre"}
        {" · "}<strong>Expediente:</strong> {expediente || "Sin referencia"}
      </p>
      <FormDialogSection title="Motivo" cols={1}>
        <div className="space-y-2">
          <Label htmlFor="motivo-rechazo-entrante">Explica el motivo (mín. {MIN_MOTIVO} caracteres)</Label>
          <Textarea
            id="motivo-rechazo-entrante"
            rows={4}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. El PDF está incompleto: falta la página con el desglose de cargos."
          />
        </div>
      </FormDialogSection>
    </FormDialogShell>
  );
}
