/**
 * Encabezado de una solicitud: folio, estado, reloj y acciones permitidas.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Hint } from "@/components/shared/Hint";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { useAccionSolicitud, useGuardarSolicitud } from "@/features/crm/hooks/usePricingCrm";
import { datosCopiaSolicitud } from "@/features/crm/services/pricing/copiaSolicitud";
import { ETIQUETA_ESTADO_PRICING, type SolicitudPricingRow } from "@/features/crm/services/pricing/tiposPricing";
import { RelojPricing } from "./RelojPricing";
import { AccionesFlujoPricing } from "./AccionesFlujoPricing";

interface Props {
  solicitud: SolicitudPricingRow;
  puedeCancelar: boolean;
  puedeResponder: boolean;
  puedeEditar: boolean;
  puedeCopiar: boolean;
  onEditar: () => void;
  numOpciones: number;
  consultaRespuesta?: ConsultaRespuesta;
}

interface ConsultaRespuesta {
  enCurso: boolean;
  error: boolean;
  reintentar: () => void;
}

function motivoFaltaRespuesta(consulta?: ConsultaRespuesta) {
  if (consulta?.enCurso) return "Consultando opciones de respuesta…";
  if (consulta?.error) return "No se pudieron consultar las opciones de respuesta.";
  return "Agrega al menos una opción para responder";
}

function EstadoConsultaRespuesta({ consulta }: { consulta?: ConsultaRespuesta }) {
  if (consulta?.error) return (
    <div className="px-6 pb-4">
      <ErrorStateInline message="No se pudieron consultar las opciones de respuesta."
        onRetry={consulta.reintentar} retrying={consulta.enCurso} />
    </div>
  );
  if (consulta?.enCurso) {
    return <p role="status" className="px-6 pb-4 text-body-sm text-muted-foreground">Consultando opciones de respuesta…</p>;
  }
  return null;
}

export function AccionesSolicitudPricing({ solicitud: s, puedeCancelar, puedeResponder, puedeEditar, puedeCopiar, onEditar, numOpciones, consultaRespuesta }: Props) {
  const accion = useAccionSolicitud();
  const copiar = useGuardarSolicitud();
  const [idPorCancelar, setIdPorCancelar] = useState<string | null>(null);
  const sinOpciones = numOpciones === 0;
  const motivoRespuesta = sinOpciones ? motivoFaltaRespuesta(consultaRespuesta) : undefined;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 py-4">
        <span className="text-h4 font-semibold">{s.folio}</span>
        <Badge variant="outline">{ETIQUETA_ESTADO_PRICING[s.estado] ?? s.estado}</Badge>
        <RelojPricing enviadaAt={s.enviada_at} venceAt={s.vence_at} respondidaAt={s.respondida_at}
          cancelada={s.estado === "cancelada" || s.estado === "sin_opcion"} pausada={s.estado === "info_requerida"} />
        <div className="ml-auto flex min-w-0 flex-wrap gap-2">
          {puedeCopiar && (
            <Button variant="outline" size="sm" disabled={copiar.isPending}
              onClick={() => copiar.mutate({ datos: datosCopiaSolicitud(s), enviar: true })}>Copiar y enviar</Button>
          )}
          {puedeEditar && (
            <Button variant="outline" size="sm" onClick={onEditar}>Editar</Button>
          )}
          {puedeCancelar && (
            <Button variant="outline" size="sm" disabled={accion.isPending}
              onClick={() => setIdPorCancelar(s.id)}>Cancelar solicitud</Button>
          )}
          {puedeResponder && (
            <Hint label={motivoRespuesta}>
              <span tabIndex={sinOpciones ? 0 : undefined} aria-label={motivoRespuesta}>
                <Button size="sm" disabled={accion.isPending || sinOpciones}
                  onClick={() => accion.mutate({ id: s.id, oportunidadId: s.oportunidad_id, accion: "responder" })}>Marcar respondida</Button>
              </span>
            </Hint>
          )}
        </div>
      </CardContent>
      <div className="px-6 pb-4 empty:hidden"><AccionesFlujoPricing solicitud={s} /></div>
      {puedeResponder && sinOpciones && <EstadoConsultaRespuesta consulta={consultaRespuesta} />}
      <ConfirmActionDialog
        open={puedeCancelar && idPorCancelar === s.id}
        onOpenChange={(open) => { if (!open && !accion.isPending) setIdPorCancelar(null); }}
        title={`¿Cancelar la solicitud ${s.folio}?`}
        description="La solicitud dejará de estar disponible para responder."
        cancelLabel="Conservar solicitud"
        confirmLabel="Cancelar solicitud"
        variant="destructive"
        isPending={accion.isPending}
        onConfirm={() => {
          if (!puedeCancelar || idPorCancelar !== s.id || accion.isPending) return;
          accion.mutate({ id: s.id, oportunidadId: s.oportunidad_id, accion: "cancelar" }, {
            onSuccess: () => setIdPorCancelar(null),
          });
        }}
      />
    </Card>
  );
}
