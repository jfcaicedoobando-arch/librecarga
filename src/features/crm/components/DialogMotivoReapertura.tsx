import { useId, useState } from "react";
import { RotateCcw } from "lucide-react";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogFooter } from "@/components/shared/FormDialogFooter";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function DialogMotivoReapertura({ nombre, loading, onCancel, onConfirm }: {
  nombre: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (motivo: string) => void;
}) {
  const id = useId();
  const [motivo, setMotivo] = useState("");
  return (
    <FormDialogShell
      open
      onOpenChange={(open) => { if (!open && !loading) onCancel(); }}
      icon={RotateCcw}
      title="Reabrir oportunidad"
      description={`Registra por qué reabres "${nombre}". El motivo queda en el historial de etapas.`}
      footer={<FormDialogFooter
        onCancel={onCancel}
        onConfirm={() => onConfirm(motivo.trim())}
        confirmLabel="Reabrir"
        loading={loading}
        disabled={!motivo.trim()}
      />}
    >
      <div className="space-y-1.5">
        <Label htmlFor={id}>Motivo de reapertura</Label>
        <Textarea id={id} required maxLength={500} value={motivo} disabled={loading}
          onChange={(event) => setMotivo(event.target.value)} />
      </div>
    </FormDialogShell>
  );
}
