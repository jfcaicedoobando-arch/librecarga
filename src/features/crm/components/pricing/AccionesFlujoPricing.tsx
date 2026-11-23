/**
 * Botones de trabajo de Pricing (Fase 5): tomar, iniciar, pedir información,
 * reanudar y cerrar sin opción. La base valida cada transición.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useCambiarEstadoPricing } from "@/features/crm/hooks/useFlujoPricing";
import { esRolPricing } from "@/features/crm/services/pricing/permisosPricing";
import { accionesDisponibles, MOTIVO_MINIMO, type AccionFlujoPricing } from "@/features/crm/services/pricing/estadosPricing";
import type { SolicitudPricingRow } from "@/features/crm/services/pricing/tiposPricing";

const ETIQUETAS: Record<AccionFlujoPricing, string> = {
  tomar: "Tomar solicitud", iniciar: "Iniciar", pedir_info: "Pedir información",
  reanudar: "Ya respondí, reanudar", sin_opcion: "Sin opción",
};
const DIALOGO = {
  pedir_info: { titulo: "Pedir información al solicitante", texto: "El plazo se pausa hasta que el solicitante responda.", etiqueta: "¿Qué información falta?" },
  sin_opcion: { titulo: "Cerrar sin opción", texto: "El solicitante recibirá el motivo y la solicitud quedará cerrada.", etiqueta: "Motivo" },
} as const;

export function AccionesFlujoPricing({ solicitud: s }: { solicitud: SolicitudPricingRow }) {
  const { effectiveRole, user } = useAuth();
  const m = useCambiarEstadoPricing();
  const [dialogo, setDialogo] = useState<"pedir_info" | "sin_opcion" | null>(null);
  const [motivo, setMotivo] = useState("");
  const acciones = accionesDisponibles(s, user?.id, esRolPricing(effectiveRole));
  if (acciones.length === 0 && !s.info_motivo && !s.motivo_sin_opcion) return null;
  const ejecutar = (accion: AccionFlujoPricing, texto?: string) =>
    m.mutate({ id: s.id, oportunidadId: s.oportunidad_id, accion, motivo: texto }, {
      onSuccess: () => { setDialogo(null); setMotivo(""); },
    });
  const minimo = dialogo ? MOTIVO_MINIMO[dialogo] ?? 0 : 0;
  return (
    <div className="space-y-2">
      {s.estado === "info_requerida" && s.info_motivo && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-body-sm">
          <strong>Pricing pide información:</strong> {s.info_motivo}
        </p>
      )}
      {s.estado === "sin_opcion" && s.motivo_sin_opcion && (
        <p className="rounded-md border bg-muted p-3 text-body-sm"><strong>Sin opción:</strong> {s.motivo_sin_opcion}</p>
      )}
      {acciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {acciones.map((a) => (
            <Button key={a} size="sm" variant={a === "sin_opcion" ? "outline" : "secondary"} disabled={m.isPending}
              onClick={() => (a === "pedir_info" || a === "sin_opcion" ? setDialogo(a) : ejecutar(a))}>
              {ETIQUETAS[a]}
            </Button>
          ))}
        </div>
      )}
      <ConfirmActionDialog
        open={dialogo !== null}
        onOpenChange={(open) => { if (!open && !m.isPending) setDialogo(null); }}
        title={dialogo ? DIALOGO[dialogo].titulo : ""}
        description={dialogo ? DIALOGO[dialogo].texto : ""}
        cancelLabel="Volver"
        confirmLabel={dialogo ? ETIQUETAS[dialogo] : ""}
        variant={dialogo === "sin_opcion" ? "destructive" : "default"}
        isPending={m.isPending}
        size="md"
        confirmDisabled={motivo.trim().length < minimo}
        onConfirm={() => { if (dialogo && motivo.trim().length >= minimo) ejecutar(dialogo, motivo.trim()); }}
      >
        <div className="space-y-1">
          <Label htmlFor="motivo-flujo-pricing">{dialogo ? DIALOGO[dialogo].etiqueta : ""}</Label>
          <Textarea id="motivo-flujo-pricing" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
          <p className="text-caption text-muted-foreground">Mínimo {minimo} caracteres.</p>
        </div>
      </ConfirmActionDialog>
    </div>
  );
}
