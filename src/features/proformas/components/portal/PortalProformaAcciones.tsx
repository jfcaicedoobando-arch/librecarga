/**
 * Bloque de acciones (Aceptar / Rechazar) del portal público de proformas.
 */
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle } from "lucide-react";
import { COPY_ENLACE, COPY_PASOS, COPY_VALIDACION } from "@/lib/copy/publicoCopy";
import { reportCaughtError } from "@/lib/observability/reportCaughtError";

interface Props {
  submitting: boolean;
  onResponder: (respuesta: "aceptada" | "rechazada", motivo: string) => Promise<void>;
  error: string | null;
}

export function PortalProformaAcciones({ submitting, onResponder, error }: Props) {
  const [modo, setModo] = useState<"idle" | "rechazar">("idle");
  const [motivo, setMotivo] = useState("");
  const [intentoRechazo, setIntentoRechazo] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const idMotivo = useId();
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  const motivoCapturado = motivo.trim();
  const motivoInvalido = intentoRechazo && motivoCapturado.length < 3;

  async function ejecutar(respuesta: "aceptada" | "rechazada") {
    setLocalError(null);
    if (respuesta === "rechazada" && motivoCapturado.length < 3) {
      setIntentoRechazo(true);
      motivoRef.current?.focus();
      return;
    }
    try {
      await onResponder(respuesta, motivoCapturado);
    } catch (e) {
      // Superficie pública: nunca exponer `error.message` crudo al cliente.
      // Ola 17: el diagnóstico va a Sentry, no a `console.error` huérfano.
      reportCaughtError(e, { feature: "proformas", op: "portal_responder" });
      setLocalError(COPY_ENLACE.noDisponible);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tu respuesta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {modo === "idle" && (
          <>
            <p className="text-body text-muted-foreground">
              Revisa los conceptos y totales. Puedes aceptar la proforma para autorizar la facturación, o
              rechazarla indicando el motivo.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                className="flex-1"
                onClick={() => void ejecutar("aceptada")}
                loading={submitting}
              >
                {!submitting && <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                Aceptar proforma
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setModo("rechazar")}
                disabled={submitting}
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Rechazar
              </Button>
            </div>
          </>
        )}

        {modo === "rechazar" && (
          <>
            <div>
              <Label htmlFor={idMotivo}>Motivo del rechazo *</Label>
              <Textarea
                id={idMotivo}
                ref={motivoRef}
                required
                aria-invalid={motivoInvalido || undefined}
                aria-describedby={motivoInvalido ? `${idMotivo}-error` : undefined}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={4}
                placeholder="Ej.: los conceptos no coinciden con lo acordado; requerimos ajuste en flete."
              />
              {motivoInvalido && (
                <p id={`${idMotivo}-error`} role="alert" className="mt-1 text-body text-destructive">
                  {COPY_VALIDACION.motivoRechazo}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => void ejecutar("rechazada")} loading={submitting}>
                Confirmar rechazo
              </Button>
              <Button variant="outline" onClick={() => { setModo("idle"); setIntentoRechazo(false); }} disabled={submitting}>
                Cancelar
              </Button>
            </div>
          </>
        )}

        {(localError || error) && (
          <div className="space-y-1">
            <p className="text-body text-destructive">{localError ?? error}</p>
            {(localError ?? error) === COPY_ENLACE.noDisponible && (
              <ul className="list-disc pl-5 text-body-sm text-muted-foreground space-y-0.5">
                {COPY_PASOS.servicioNoDisponible.map((paso) => (
                  <li key={paso}>{paso}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
