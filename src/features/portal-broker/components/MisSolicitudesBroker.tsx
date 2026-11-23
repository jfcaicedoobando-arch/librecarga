/** Estado de las peticiones del broker (pendiente / autorizada / rechazada). */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { formatDate } from "@/lib/formatters/dates";
import { useMisSolicitudesBroker } from "../hooks/useBrokerPortal";

const ETIQUETA: Record<string, string> = { pendiente: "Pendiente", autorizada: "Autorizada", rechazada: "Rechazada" };

export default function MisSolicitudesBroker() {
  const { data: filas = [], isLoading, isError, isFetching, refetch } = useMisSolicitudesBroker();
  return (
    <section className="space-y-2">
      <h2 className="text-h4">Mis solicitudes</h2>
      <Card>
        <CardContent className="p-0 divide-y">
          {isError && (
            <ErrorStateInline
              title="No pudimos cargar tus solicitudes"
              message="Reintenta para consultar su estado."
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          {isLoading && <p role="status" className="p-3 text-body-sm text-muted-foreground">Cargando solicitudes…</p>}
          {!isLoading && !isError && filas.length === 0 && (
            <p className="p-3 text-body-sm text-muted-foreground">Todavía no has enviado solicitudes.</p>
          )}
          {filas.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-body-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{s.empresa}</p>
                <p className="text-muted-foreground">
                  {s.organizacion} · {formatDate(s.created_at)}
                  {s.motivo ? ` · ${s.motivo}` : ""}
                </p>
              </div>
              <Badge variant={s.estado === "autorizada" ? "secondary" : "outline"}>{ETIQUETA[s.estado] ?? s.estado}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
