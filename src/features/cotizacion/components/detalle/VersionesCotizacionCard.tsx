/**
 * P3 (v13.297.0) — Panel de Versiones (snapshots inmutables) de una cotización.
 * Muestra la línea de tiempo de versiones creadas cuando la cotización pasó
 * a estado "Enviada". Cada versión conserva el folio, estado y el `snapshot`
 * completo de la fila + `costos_snapshot`.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import { Hint } from "@/components/shared/Hint";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { LoadingState } from "@/components/shared/states/LoadingState";
import { formatDate } from "@/lib/formatters";
import { useVersionesCotizacion } from "@/features/cotizacion/hooks/useCotizacionVersiones";

interface Props {
  cotizacionId: string;
  /**
   * v13.823.341 — estado vigente de la cotización. El historial guarda el
   * estado que tenía al congelar cada versión (p. ej. "Aceptada"), así que sin
   * este dato parecía contradecir el encabezado ("En operación").
   */
  estadoActual?: string | null;
}

export function VersionesCotizacionCard({ cotizacionId, estadoActual }: Props) {
  const { data: versiones = [], isLoading, isError, isFetching, refetch } = useVersionesCotizacion(cotizacionId);

  if (versiones.length === 0 && (isLoading || isError)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Historial de versiones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingState
            minHeight="min-h-16"
            label="Cargando historial…"
            error={isError}
            errorLabel="No se pudo cargar el historial de versiones."
            onRetry={() => void refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  if (versiones.length === 0) {
    return null;
  }

  const ultimoEstado = versiones[0]?.estado_al_snapshot ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4" /> Historial de versiones
          <Badge variant="outline" className="ml-1 text-label">
            {versiones.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isError && (
          <ErrorStateInline
            title="No se pudo actualizar el historial de versiones"
            message="Mostramos las versiones de la última consulta."
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        )}
        <p className="text-body-sm text-muted-foreground">
          Cada vez que la cotización pasa a <strong>Enviada</strong> se congela
          una versión inmutable con folio, conceptos y costos vigentes.
        </p>
        <ul className="divide-y divide-border/60 rounded-md border">
          {versiones.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-body"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Badge variant="secondary" className="shrink-0">
                  v{v.version_num}
                </Badge>
                <span className="font-medium truncate">{v.folio}</span>
                <Hint label="Estado que tenía la cotización al congelar esta versión">
                  <Badge variant="outline" className="text-label shrink-0">
                    {v.estado_al_snapshot}
                  </Badge>
                </Hint>
              </div>
              <span className="text-body-sm text-muted-foreground whitespace-nowrap">
                {formatDate(v.created_at)}
              </span>
            </li>
          ))}
        </ul>
        {estadoActual && ultimoEstado && estadoActual !== ultimoEstado && (
          <p className="text-body-sm text-muted-foreground">
            La última versión se congeló en <strong>{ultimoEstado}</strong> y la
            cotización avanzó después a <strong>{estadoActual}</strong>. El
            historial conserva el estado original de cada versión.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
