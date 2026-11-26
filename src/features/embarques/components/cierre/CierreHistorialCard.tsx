/**
 * Subcomponente presentacional: historial de cierres/reaperturas.
 * Extraído de `TabCierre.tsx` (Auditoría arquitectónica 13.56.6 / paso 15).
 *
 * v13.139.x — muestra el usuario que ejecutó la acción y soporta
 * registros legacy provenientes de `bitacora_actividad` (cuando el cierre
 * se realizó antes de que existiera `cierre_embarque_log`).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import { formatFechaHora } from "@/lib/formatters";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";

export interface CierreLogEntry {
  id: string;
  accion: string;
  created_at: string;
  motivo?: string | null;
  usuario_email?: string | null;
  usuario_id?: string | null;
  origen?: "log" | "bitacora";
}

interface Props {
  log: CierreLogEntry[];
  isLoading: boolean;
  falloConsulta?: { reintentando: boolean; reintentar: () => void };
}

export function CierreHistorialCard({ log, isLoading, falloConsulta }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4" /> Historial de cierres
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {falloConsulta && (
          <ErrorStateInline
            title="No se pudo cargar el historial de cierres"
            message={log.length > 0 ? "Se muestran los movimientos de la última consulta exitosa." : "Reintenta para consultar los cierres y reaperturas."}
            onRetry={falloConsulta.reintentar}
            retrying={falloConsulta.reintentando}
          />
        )}
        {isLoading && (
          <p role="status" className="text-body text-muted-foreground">Cargando historial de cierres…</p>
        )}
        {!isLoading && !falloConsulta && log.length === 0 && (
          <EmptyStateInline icon={History} message="Sin movimientos." className="py-4" />
        )}
        {log.length > 0 && (
          <ul className="space-y-2">
            {log.map((entry) => (
              <li key={entry.id} className="rounded-md border p-3 text-body">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={entry.accion.startsWith("cerrar") ? "default" : "outline"}>
                      {entry.accion === "cerrar_forzado" ? "Cerrado forzado"
                        : entry.accion === "cerrar_automatico" ? "Cerrado automáticamente"
                        : entry.accion === "cerrar" ? "Cerrado" : "Reabierto"}
                    </Badge>
                    {entry.origen === "bitacora" && (
                      <Badge variant="secondary" className="text-2xs">
                        Bitácora anterior
                      </Badge>
                    )}
                  </div>
                  <span className="text-body-sm text-muted-foreground">
                    {formatFechaHora(entry.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  Por <span className="font-medium text-foreground">
                    {entry.usuario_email || (entry.accion === "cerrar_automatico" ? "Sistema"
                      : entry.usuario_id ? `Usuario ${entry.usuario_id.slice(0, 8)}` : "Usuario desconocido")}
                  </span>
                </p>
                {entry.origen === "bitacora" && (
                  <p className="mt-1 text-body-sm text-muted-foreground">Movimiento registrado antes del historial actual.</p>
                )}
                {entry.motivo && (
                  <p className="mt-1 text-body text-muted-foreground">{entry.motivo}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
