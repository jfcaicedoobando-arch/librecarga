/**
 * Diálogo de confirmación para marcar varios hallazgos como revisados con una
 * misma "acción tomada". UI sigue el patrón `FormDialogShell`.
 */
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/shared/Hint";
import { useMarcarRevisadosBulk } from "@/features/auditoria/hooks/useMarcarRevisadosBulk";
import type { HallazgoAuditoria } from "@/features/auditoria/types";

interface Props {
  open: boolean;
  hallazgos: HallazgoAuditoria[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function MarcarRevisadosBulkDialog({ open, hallazgos, onOpenChange, onSuccess }: Props) {
  const [accion, setAccion] = useState("");
  const bulk = useMarcarRevisadosBulk();
  const resetBulk = bulk.reset;
  const total = hallazgos.length;
  const trimmed = accion.trim();
  const puedeConfirmar = trimmed.length >= 3 && total > 0 && !bulk.isPending;

  useEffect(() => {
    if (open) {
      setAccion("");
      resetBulk();
    }
  }, [open, resetBulk]);

  const handleConfirmar = async () => {
    if (!puedeConfirmar) return;
    const res = await bulk.mutateAsync({ hallazgos, accionTomada: trimmed });
    if (res.fail === 0) {
      onOpenChange(false);
      onSuccess();
    }
  };

  return (
    <FormDialogShell
      open={open}
      onOpenChange={(o) => { if (!bulk.isPending) onOpenChange(o); }}
      icon={CheckCircle2}
      title="Marcar hallazgos como revisados"
      description={`Vas a marcar ${total} hallazgo${total === 1 ? "" : "s"} con la misma acción tomada.`}
      size="2xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bulk.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={!puedeConfirmar} loading={bulk.isPending} className="gap-1">
            {!bulk.isPending && <CheckCircle2 className="h-4 w-4" />}
            Confirmar ({total})
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="accion-bulk" className="text-body font-medium">
          Acción tomada <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="accion-bulk"
          value={accion}
          onChange={(e) => setAccion(e.target.value)}
          placeholder="Ej. Validado por contabilidad — cierre de mes"
          rows={3}
          disabled={bulk.isPending}
          autoFocus
        />
        <p className="text-label text-muted-foreground">
          Esta misma nota se guardará en cada hallazgo seleccionado. Mínimo 3 caracteres.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-body font-medium">Hallazgos seleccionados</Label>
        <div className="max-h-60 overflow-y-auto rounded-md border bg-muted/30 divide-y">
          {hallazgos.map((h) => (
            <div key={`${h.embarque_id}-${h.regla}-${h.detalle}`} className="flex items-start gap-2 px-3 py-2 text-body-sm">
              <Badge variant="outline" className="shrink-0 tabular-nums font-medium">{h.expediente}</Badge>
              <span className="text-muted-foreground shrink-0">{h.regla}</span>
              <Hint label={h.detalle}><span className="truncate">{h.detalle}</span></Hint>
            </div>
          ))}
        </div>
      </div>

      {bulk.data && bulk.data.fail > 0 && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-body-sm text-destructive">
          <p>{bulk.data.ok} revisados · {bulk.data.fail} pendientes</p>
          <ul className="mt-1 list-disc pl-5">
            {bulk.data.errores.map(({ expediente, mensaje }, i) => (
              <li key={`${expediente}-${i}`}>{expediente} · {mensaje}</li>
            ))}
          </ul>
        </div>
      )}
    </FormDialogShell>
  );
}
