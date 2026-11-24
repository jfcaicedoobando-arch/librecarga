/** Motivo de pérdida: Pricing lo registra con el catálogo de la empresa y el vendedor recibe aviso. */
import { useState } from "react";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { useMotivosPerdida } from "@/features/crm/hooks/useEtapasPipeline";
import { useMarcarPerdidaPricing } from "@/features/crm/hooks/usePerdidaPricing";
import { MAXIMO_NOTA_PERDIDA, puedeMarcarPerdida } from "@/features/crm/services/pricing/perdidaPricing";
import type { SolicitudPricingRow } from "@/features/crm/services/pricing/tiposPricing";

interface Props { solicitud: SolicitudPricingRow; esPricing: boolean }

export function PerdidaPricing({ solicitud: s, esPricing }: Props) {
  const puede = puedeMarcarPerdida(s, esPricing);
  const motivos = useMotivosPerdida(!s.perdida_at);
  if (s.perdida_at) {
    const nombre = motivos.data?.find((m) => m.id === s.motivo_perdida_id)?.nombre ?? "sin motivo";
    return <div className="flex flex-wrap items-center gap-2 text-body-sm">
      <Badge variant="destructive">Perdida</Badge><span>Motivo: {nombre}</span>
      {s.perdida_nota && <span className="text-muted-foreground">— {s.perdida_nota}</span>}
    </div>;
  }
  if (!puede) return null;
  return <DialogoPerdida solicitud={s} motivos={motivos.data ?? []} />;
}

function DialogoPerdida({ solicitud: s, motivos }: { solicitud: SolicitudPricingRow; motivos: { id: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [motivoId, setMotivoId] = useState("");
  const [nota, setNota] = useState("");
  const m = useMarcarPerdidaPricing();
  return <>
    <Button size="sm" variant="outline" onClick={() => setAbierto(true)} disabled={m.isPending}>Marcar como perdida</Button>
    <ConfirmActionDialog open={abierto} onOpenChange={(o) => { if (!o && !m.isPending) setAbierto(false); }}
      title={`Solicitud ${s.folio} perdida`} size="md" cancelLabel="Volver" confirmLabel="Guardar motivo"
      description="El vendedor que hizo la solicitud recibirá un aviso con el motivo."
      isPending={m.isPending} confirmDisabled={!motivoId}
      onConfirm={() => {
        if (!motivoId) return;
        m.mutate({ id: s.id, oportunidadId: s.oportunidad_id, motivoId, nota: nota.trim() },
          { onSuccess: () => { setAbierto(false); setMotivoId(""); setNota(""); } });
      }}>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="motivo-perdida">Motivo de pérdida</Label>
          <Select value={motivoId} onValueChange={setMotivoId}>
            <SelectTrigger id="motivo-perdida"><SelectValue placeholder="Elige un motivo" /></SelectTrigger>
            <SelectContent>{motivos.map((x) => <SelectItem key={x.id} value={x.id}>{x.nombre}</SelectItem>)}</SelectContent>
          </Select>
          {motivos.length === 0 && (
            <EmptyStateInline density="compact" message="No hay motivos activos en el catálogo de CRM." />
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="nota-perdida">Nota (opcional)</Label>
          <Textarea id="nota-perdida" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={MAXIMO_NOTA_PERDIDA}
            placeholder="Ej. el cliente eligió otra naviera" />
        </div>
      </div>
    </ConfirmActionDialog>
  </>;
}
