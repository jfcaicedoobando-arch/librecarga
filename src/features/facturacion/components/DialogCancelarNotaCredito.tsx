/**
 * DialogCancelarNotaCredito — captura motivo SAT y UUID sustituto (cuando aplica)
 * para cancelar una nota de crédito timbrada vía FacturApi.
 */
import { useState } from "react";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { esUuid } from "@/lib/esUuid";
import type { MotivoCancelacionSat } from "@/features/facturacion/services/facturapi";

const MOTIVOS: { value: MotivoCancelacionSat; label: string }[] = [
  { value: "02", label: "02 · Comprobante emitido con errores sin relación" },
  { value: "03", label: "03 · No se llevó a cabo la operación" },
  { value: "04", label: "04 · Operación nominativa relacionada en factura global" },
  { value: "01", label: "01 · Comprobante emitido con errores (con sustitución)" },
];

interface Props {
  open: boolean;
  folio?: string;
  onOpenChange: (o: boolean) => void;
  onConfirm: (motivo: MotivoCancelacionSat, sustituyeUuid?: string) => void;
  loading?: boolean;
}

export function DialogCancelarNotaCredito(props: Props) {
  if (!props.open) return null;
  return <FormularioCancelarNotaCredito {...props} />;
}

function FormularioCancelarNotaCredito({ open, folio, onOpenChange, onConfirm, loading }: Props) {
  const [motivo, setMotivo] = useState<MotivoCancelacionSat>("02");
  const [uuid, setUuid] = useState("");

  const requiereUuid = motivo === "01";
  const uuidValido = esUuid(uuid.trim());
  const errorUuid = requiereUuid && !uuidValido;
  const mensajeUuid = uuid.trim()
    ? "El UUID debe tener el formato 8-4-4-4-12, con los guiones en su lugar."
    : "Captura el UUID de la nota de crédito que sustituye a esta.";

  const footer = (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
        Cerrar
      </Button>
      <Button
        variant="destructive"
        onClick={() => onConfirm(motivo, requiereUuid ? uuid.trim() : undefined)}
        disabled={errorUuid || loading}
      >
        {loading ? "Cancelando…" : "Cancelar NC"}
      </Button>
    </>
  );

  return (
    <FormDialogShell
      open={open}
      onOpenChange={onOpenChange}
      icon={XCircle}
      title={folio ? `Cancelar nota de crédito ${folio}` : "Cancelar nota de crédito"}
      busy={loading}
      description="Esta acción notifica al SAT vía FacturApi y no se puede revertir."
      size="md"
      footer={footer}
    >
      <div className="space-y-1.5">
        <Label htmlFor="motivo-sat-nc">Motivo SAT *</Label>
        <Select value={motivo} onValueChange={(v) => setMotivo(v as MotivoCancelacionSat)}>
          <SelectTrigger id="motivo-sat-nc"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MOTIVOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {requiereUuid && (
        <div className="space-y-1.5">
          <Label htmlFor="nc-sub-uuid">UUID de la NC que la sustituye *</Label>
          <Input
            id="nc-sub-uuid" value={uuid} onChange={(e) => setUuid(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            aria-invalid={errorUuid || undefined}
            aria-describedby={errorUuid ? "nc-sub-uuid-error" : undefined}
            disabled={loading}
          />
          {errorUuid && <p id="nc-sub-uuid-error" className="text-body-sm text-destructive">{mensajeUuid}</p>}
        </div>
      )}
    </FormDialogShell>
  );
}
