import { useState } from "react";
import { FileCheck2 } from "lucide-react";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRevisionFiscalCotizacion } from "../../hooks/useRevisionFiscalCotizacion";
import { useVistaFiscalCotizacion } from "../../hooks/wizard/useVistaFiscalCotizacion";
import { usePricingScope } from "../../hooks/wizard/usePricingScope";
import type { SnapshotFiscalCotizacion } from "../../domain/snapshotFiscalCotizacion";
import type { CotizacionRow } from "../../types";
import { ResumenFiscalCotizacion } from "../ResumenFiscalCotizacion";

type Props = { cotizacion: CotizacionRow; fiscal: SnapshotFiscalCotizacion };

export function RevisionFiscalCotizacion(props: Props) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAbierta(true)}>Revisar ISR RESICO</Button>
      {abierta && <DialogoRevision {...props} cerrar={() => setAbierta(false)} />}
    </>
  );
}

function DialogoRevision({ cotizacion, fiscal, cerrar }: Props & { cerrar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const revision = useRevisionFiscalCotizacion(cotizacion.id);
  const scope = usePricingScope();
  const vigente = useVistaFiscalCotizacion({
    scope, organizationId: cotizacion.organization_id, clienteId: cotizacion.cliente_id,
    cotizacionId: cotizacion.id, conceptos: cotizacion.conceptos_venta,
  });
  const verificado = "bloques" in vigente && scope.organizationId === cotizacion.organization_id;

  return (
    <FormDialogShell
      open
      onOpenChange={(open) => { if (!open && !revision.isPending) cerrar(); }}
      icon={FileCheck2}
      title="Revisión fiscal de la cotización"
      description="Compara el desglose aprobado con el vigente. La cotización volverá a borrador para autorizar los importes de nuevo."
      size="2xl"
      footer={
        <>
          <Button variant="outline" onClick={cerrar} disabled={revision.isPending}>Cancelar</Button>
          <Button
            disabled={!verificado || motivo.trim().length < 10 || revision.isPending}
            onClick={() => revision.mutate(
              { cotizacionId: cotizacion.id, fingerprint: fiscal.conceptos_fingerprint, motivo: motivo.trim() },
              { onSuccess: cerrar },
            )}
          >
            Devolver a borrador
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-body font-semibold">Desglose aprobado</h3>
          <ResumenFiscalCotizacion {...fiscal} />
        </div>
        <div className="space-y-2">
          <h3 className="text-body font-semibold">Evaluación vigente</h3>
          {verificado ? <ResumenFiscalCotizacion {...vigente} /> : (
            <ResumenFiscalCotizacion estado={vigente.estado === "cargando" ? "cargando" : "error"} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="motivo-revision-isr">Motivo de la revisión (mínimo 10 caracteres)</Label>
          <Textarea id="motivo-revision-isr" value={motivo} onChange={(event) => setMotivo(event.target.value)} />
        </div>
      </div>
    </FormDialogShell>
  );
}
