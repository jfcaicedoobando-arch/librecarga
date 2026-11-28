import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { useDiaNegocio } from "@/hooks/shared/useDiaNegocio";
import { usePermissions } from "@/hooks/shared/usePermissions";
import { formatDate, formatFechaHora } from "@/lib/formatters";
import { useEmbarqueDocumentosDetalle } from "../../hooks/useEmbarqueDetalleSecciones";
import { useFechasEntrega } from "../../hooks/useFechasEntrega";

function HistorialEntrega({ filas }: { filas: NonNullable<ReturnType<typeof useFechasEntrega>["historial"]["data"]> }) {
  if (filas.length === 0) return null;
  return <details>
    <summary>Historial de entrega</summary>
    <ul className="mt-2 space-y-2">
      {filas.map((fila) => (
        <li key={fila.id} className="text-body-sm">
          <p>{fila.fecha_anterior ? `${formatDate(fila.fecha_anterior)} → ` : ""}{formatDate(fila.fecha_propuesta)} · {fila.estado}</p>
          <p>{fila.motivo}{fila.documento_nombre ? ` · ${fila.documento_nombre}` : ""}</p>
          <p>Solicitud del {formatFechaHora(fila.solicitado_en)} por {fila.solicitante}</p>
          {fila.resuelto_en && <p>Resolución del {formatFechaHora(fila.resuelto_en)} por {fila.responsable}{fila.motivo_resolucion ? ` · ${fila.motivo_resolucion}` : ""}</p>}
        </li>
      ))}
    </ul>
  </details>;
}

function FechaEntregaEstado({ historial, fecha }: { historial: ReturnType<typeof useFechasEntrega>["historial"]; fecha?: string }) {
  if (historial.isError) return <ErrorStateInline title="No se pudo consultar la fecha efectiva"
    message="Reintenta para ver el historial." onRetry={() => void historial.refetch()} />;
  if (historial.isPending) return <p role="status">Consultando entrega…</p>;
  return <p>{fecha ? formatDate(fecha) : "Pendiente de confirmar"}</p>;
}

export function FechaEntregaCard({ embarqueId, llegada }: { embarqueId: string; llegada: string | null }) {
  const fieldId = useId();
  const hoy = useDiaNegocio();
  const { role } = usePermissions();
  const { historial, mutation } = useFechasEntrega(embarqueId);
  const [fecha, setFecha] = useState("");
  const [motivo, setMotivo] = useState("");
  const [documento, setDocumento] = useState("");
  const [solicitando, setSolicitando] = useState(false);
  const documentos = useEmbarqueDocumentosDetalle(embarqueId, solicitando);
  const filas = historial.data ?? [];
  const actual = filas.filter((fila) => fila.estado === "aprobada")
    .sort((a, b) => (b.resuelto_en ?? "").localeCompare(a.resuelto_en ?? ""))[0];
  const pendiente = filas.find((fila) => fila.estado === "pendiente");
  const puedePedir = role === "coordinador_logistico" && !pendiente && !historial.isPending;
  const puedeResolver = role === "gerente_operaciones" && pendiente;
  const motivoValido = motivo.trim().length >= 10;
  const solicitudLista = [fecha, documento, motivoValido].every(Boolean);
  const limpiar = () => { setMotivo(""); setDocumento(""); setFecha(""); setSolicitando(false); };

  return (
    <Card>
      <CardHeader><CardTitle>Fecha efectiva de entrega</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <FechaEntregaEstado historial={historial} fecha={actual?.fecha_propuesta} />
        <HistorialEntrega filas={filas} />
        {pendiente && <p role="status">Fecha propuesta {formatDate(pendiente.fecha_propuesta)} · {pendiente.documento_nombre}. {pendiente.motivo}</p>}
        {puedePedir && !solicitando && <Button variant="outline" onClick={() => setSolicitando(true)}>Solicitar corrección</Button>}
        {solicitando && puedePedir && (
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ fecha, motivo: motivo.trim(), documento }, { onSuccess: limpiar });
          }}>
            <Label htmlFor={`${fieldId}-fecha`}>Fecha propuesta</Label>
            <DatePickerMx id={`${fieldId}-fecha`} value={fecha} onChange={setFecha} min={llegada ?? undefined} max={hoy} />
            <Label htmlFor={`${fieldId}-doc`}>Evidencia de entrega</Label>
            <select id={`${fieldId}-doc`} className="block w-full rounded-md border bg-background p-2" value={documento} onChange={(event) => setDocumento(event.target.value)} required>
              <option value="">Selecciona un documento adjunto</option>
              {(documentos.data ?? []).filter((doc) => doc.archivo).map((doc) => <option key={doc.id} value={doc.id}>{doc.nombre}</option>)}
            </select>
            {documentos.isError && <ErrorStateInline title="No se pudieron consultar los documentos"
              message="Reintenta para seleccionar la evidencia." onRetry={() => void documentos.refetch()} />}
            <Label htmlFor={`${fieldId}-motivo`}>Motivo de la solicitud</Label>
            <Textarea id={`${fieldId}-motivo`} value={motivo} onChange={(event) => setMotivo(event.target.value)} minLength={10} maxLength={1000} required />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={mutation.isPending || !solicitudLista}>Enviar solicitud</Button>
              <Button type="button" variant="outline" onClick={limpiar}>Cancelar</Button>
            </div>
          </form>
        )}
        {puedeResolver && (
          <div className="space-y-3">
            <Label htmlFor={`${fieldId}-motivo`}>Motivo de la resolución</Label>
            <Textarea id={`${fieldId}-motivo`} value={motivo} onChange={(event) => setMotivo(event.target.value)} maxLength={1000} />
            <div className="flex flex-wrap gap-2">
              {[true, false].map((aprobar) => (
                <Button key={String(aprobar)} variant={aprobar ? "default" : "outline"} disabled={!motivoValido || mutation.isPending}
                  onClick={() => mutation.mutate({ solicitud: pendiente.id, motivo: motivo.trim(), aprobar }, { onSuccess: limpiar })}>
                  {aprobar ? "Aprobar corrección" : "Rechazar corrección"}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
