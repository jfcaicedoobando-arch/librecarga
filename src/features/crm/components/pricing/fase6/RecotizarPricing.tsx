/** Botón «Recotizar»: guarda la versión actual y regresa la solicitud a En proceso (sólo Pricing). */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { useRecotizarPricing } from "@/features/crm/hooks/useRecotizarPricing";
import type { SolicitudPricingRow } from "@/features/crm/services/pricing/tiposPricing";
import { MINIMO_MOTIVO_RECOTIZAR } from "@/features/crm/services/pricing/versionesPricing";


export function RecotizarPricing({ solicitud: s }: { solicitud: SolicitudPricingRow }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const m = useRecotizarPricing();
  const valido = motivo.trim().length >= MINIMO_MOTIVO_RECOTIZAR;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAbierto(true)} disabled={m.isPending}>Recotizar</Button>
      <ConfirmActionDialog
        open={abierto}
        onOpenChange={(open) => { if (!open && !m.isPending) setAbierto(false); }}
        title={`Recotizar ${s.folio}`}
        description={`La versión ${s.version} se guarda para consulta y la solicitud vuelve a En proceso con un nuevo plazo. Las cotizaciones ya creadas no cambian.`}
        cancelLabel="Volver"
        confirmLabel="Recotizar"
        isPending={m.isPending}
        size="md"
        confirmDisabled={!valido}
        onConfirm={() => {
          if (!valido) return;
          m.mutate({ id: s.id, oportunidadId: s.oportunidad_id, motivo: motivo.trim() },
            { onSuccess: () => { setAbierto(false); setMotivo(""); } });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="motivo-recotizar">Motivo de la recotización</Label>
          <Textarea id="motivo-recotizar" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500}
            placeholder="Ej. el cliente cambió la fecha de carga" />
          <p className="text-caption text-muted-foreground">Mínimo {MINIMO_MOTIVO_RECOTIZAR} caracteres.</p>
        </div>
      </ConfirmActionDialog>
    </>
  );
}
