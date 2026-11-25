import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAutoFocusPrimerCampo } from "@/components/shared/utils/useAutoFocusPrimerCampo";
import { Button } from "@/components/ui/button";
import { CalendarClock, MapPin } from "lucide-react";
import { useRegistrarEventoTracking } from "@/features/embarques/hooks/mutations/useRegistrarEventoTracking";
import { DocumentosTrackingPendientesError } from "@/features/embarques/services/registrarEventoTracking";
import { getErrorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/formatters";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { ActualizarEtaForm } from "./ActualizarEtaForm";
import { MarcarLlegadaForm } from "./MarcarLlegadaForm";

type Modo = "menu" | "eta" | "llegada";

interface Props {
  embarqueId: string;
  modoTransporte?: string | null;
  estadoActual?: string | null;
  etaActual?: string | null;
  etd?: string | null;
  fechaLlegadaRealActual?: string | null;
  destinoDefault?: string | null;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  confirmarDescarte?: (accion: () => void) => void;
}

export function TrackingNuevoEventoForm({
  embarqueId,
  modoTransporte,
  etaActual,
  etd,
  fechaLlegadaRealActual,
  destinoDefault,
  onClose,
  onDirtyChange,
  confirmarDescarte,
}: Props) {
  const [modo, setModo] = useState<Modo>("menu");
  const ultimoModo = useRef<Exclude<Modo, "menu"> | null>(null);
  const etaButton = useRef<HTMLButtonElement>(null);
  const llegadaButton = useRef<HTMLButtonElement>(null);
  const formRef = useAutoFocusPrimerCampo<HTMLDivElement>(modo !== "menu");

  useEffect(() => {
    if (modo !== "menu" || !ultimoModo.current) return;
    const button = ultimoModo.current === "eta" ? etaButton.current : llegadaButton.current;
    ultimoModo.current = null;
    if (button?.disabled) etaButton.current?.focus();
    else button?.focus();
  }, [modo]);

  const { registrar, isPending } = useRegistrarEventoTracking();
  const llegadaRegistrada = fechaLlegadaRealActual?.slice(0, 10);
  const transportista = modoTransporte === "Marítimo" ? "la naviera" : modoTransporte === "Aéreo" ? "la aerolínea" : "el transportista";

  const volverAlMenu = () => {
    const volver = () => {
      onDirtyChange?.(false);
      ultimoModo.current = modo === "menu" ? null : modo;
      setModo("menu");
    };
    if (confirmarDescarte) confirmarDescarte(volver);
    else volver();
  };

  async function guardar(accion: "eta" | "llegada", fecha: string, ubicacion: string) {
    try {
      if (!await registrar({ embarqueId, accion, fecha, ubicacion })) return;
      notifySuccess(undefined, { title: accion === "eta" ? "ETA actualizada" : "Llegada real registrada" });
      onClose();
    } catch (error) {
      if (error instanceof DocumentosTrackingPendientesError) {
        notifyError(undefined, { title: "Documentos incompletos", description: error.message, error, method: "TRACKING_MARCAR_LLEGADA" });
        return;
      }
      notifyError(undefined, {
        title: accion === "eta" ? "Error al actualizar ETA" : "Error al registrar llegada",
        description: getErrorMessage(error),
        error,
        method: accion === "eta" ? "TRACKING_ACTUALIZAR_ETA" : "TRACKING_MARCAR_LLEGADA",
      });
    }
  }

  if (modo === "menu" || (modo === "llegada" && llegadaRegistrada)) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>¿Qué quieres registrar?</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            ref={etaButton}
            onClick={() => setModo("eta")}
            className="flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CalendarClock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-body">Actualizar ETA</div>
              <div className="text-body-sm text-muted-foreground mt-1">
                Nueva fecha publicada por {transportista}. Se propaga a toda la app.
              </div>
            </div>
          </button>
          <button
            type="button"
            ref={llegadaButton}
            onClick={() => setModo("llegada")}
            disabled={Boolean(llegadaRegistrada)}
            className="flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors enabled:hover:bg-muted/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"
          >
            <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-body">Registrar llegada real</div>
              <div className="text-body-sm text-muted-foreground mt-1">
                {llegadaRegistrada
                  ? `Llegada registrada el ${formatDate(llegadaRegistrada)}.`
                  : "Registra cuándo llegó la carga. Desde En Tránsito o En Proceso pasa a Arribo; en etapas posteriores compatibles conserva su estado."}
              </div>
            </div>
          </button>
          <div className="md:col-span-2 flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (modo === "eta") {
    return (
      <div ref={formRef}>
        <ActualizarEtaForm
          etaActual={etaActual ?? null}
          isPending={isPending}
          onCancel={volverAlMenu}
          onDirtyChange={onDirtyChange}
          onSubmit={({ fecha, fuente }) => guardar("eta", fecha, fuente)}
        />
      </div>
    );
  }

  return (
    <div ref={formRef}>
      <MarcarLlegadaForm
        destinoDefault={destinoDefault ?? ""}
        etd={etd}
        isPending={isPending}
        onCancel={volverAlMenu}
        onDirtyChange={onDirtyChange}
        onSubmit={({ fecha, ubicacion }) => guardar("llegada", fecha, ubicacion)}
      />
    </div>
  );
}
