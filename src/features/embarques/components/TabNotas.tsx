import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, RefreshCw, Send } from "lucide-react";

import { usePermissions } from "@/hooks/shared";
import { useActividadEmbarque } from "@/features/embarques/hooks";
import { ActividadFeedTimeline } from "@/features/embarques/components/ActividadFeedTimeline";
import { ActividadFiltros } from "@/features/embarques/components/ActividadFiltros";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";

interface Props {
  embarqueId?: string;
  texto: string;
  setTexto: (texto: string) => void;
  enviarNota: () => Promise<void>;
  enviando: boolean;
}

export function TabNotas({ embarqueId, texto, setTexto, enviarNota, enviando }: Props) {
  const { canEdit } = usePermissions();

  const { grupos, conteos, categoria, setCategoria, items, isLoading, isFetching, isError, refetch } =
    useActividadEmbarque(embarqueId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle>Actividad y Notas</CardTitle>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && <span role="status" className="text-body-sm text-muted-foreground">Actualizando actividad…</span>}
          <Button variant="ghost" size="sm" onClick={refetch} aria-label="Actualizar actividad" disabled={isFetching}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && embarqueId && (
          <div className="flex gap-2">
            <Textarea
              placeholder="Escribe una nota…"
              aria-label="Nueva nota del embarque"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="min-h-16"
            />
            <Button
              size="icon"
              className="shrink-0 self-end"
              onClick={() => void enviarNota()}
              aria-label="Enviar nota"
              disabled={!texto.trim() || enviando}
              loading={enviando}
            >
              {!enviando && <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}

        <ActividadFiltros conteos={conteos} categoria={categoria} onChange={setCategoria} />

        {isLoading ? (
          <EmptyStateInline loading message="Cargando actividad…" className="py-6" />
        ) : isError ? (
          <ErrorStateInline
            title="No se pudo cargar la actividad"
            message="Ocurrió un error al obtener las notas y eventos del embarque."
            onRetry={() => void refetch()}
            retrying={isFetching}
            className="py-6"
          />
        ) : items.length === 0 ? (
          <EmptyStateInline icon={MessageSquare} message="Sin actividad registrada" className="py-8" />
        ) : (
          <ActividadFeedTimeline grupos={grupos} />
        )}
      </CardContent>
    </Card>
  );
}
