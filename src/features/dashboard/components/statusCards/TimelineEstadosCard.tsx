import { useId, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ESTADOS_FILTRO, type EstadoFiltro } from "@/features/dashboard/hooks";
import { getEstadoVisual } from "@/lib/ui/estadoConfig";
import { cn } from "@/lib/utils";

interface Props {
  conteoPorEstado: Record<EstadoFiltro, number>;
  isLoading: boolean;
}

export function TimelineEstadosCard({ conteoPorEstado, isLoading }: Props) {
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const estadosId = useId();

  return (
    <Card className="overflow-hidden" data-testid="timeline-estados-card">
      <CardContent className="p-4 sm:p-6">
        <div id={estadosId} className="relative grid grid-cols-4 items-start gap-2 sm:flex sm:justify-between sm:gap-3">
          <div className="absolute top-5 sm:top-6 left-[10%] right-[10%] h-px bg-border" aria-hidden="true" />
          {ESTADOS_FILTRO.map((estado, idx) => {
            const Icon = getEstadoVisual(estado).icon;
            const count = conteoPorEstado[estado];

            return (
              <Button
                key={estado}
                asChild
                variant="ghost"
                className={cn(
                  "relative z-10 h-auto min-w-0 flex-1 flex-col gap-0 whitespace-normal p-0 md:h-auto",
                  idx >= 4 && !mostrarTodos && "hidden sm:flex",
                )}
              >
                <Link
                  to={`/embarques?estado=${encodeURIComponent(estado)}`}
                  aria-label={`Ver embarques en estado ${estado}${isLoading ? "" : ` (${count})`}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground sm:h-11 sm:w-11">
                    <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
                  </span>
                  <div className="mt-1.5 sm:mt-2">
                    {isLoading ? (
                      <Skeleton className="h-6 w-7 sm:h-7 sm:w-8" />
                    ) : (
                      <span data-e2e-mask="dynamic-count" className="text-kpi tabular-nums tracking-tight text-foreground">
                        {count}
                      </span>
                    )}
                  </div>
                  <span className="mt-0.5 px-0.5 text-center text-label font-medium leading-tight text-muted-foreground text-balance">
                    {estado}
                  </span>
                </Link>
              </Button>
            );
          })}
        </div>
        {ESTADOS_FILTRO.length > 4 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full sm:hidden"
            aria-expanded={mostrarTodos}
            aria-controls={estadosId}
            onClick={() => setMostrarTodos((v) => !v)}
          >
            {mostrarTodos ? "Ver menos estados" : `Ver ${ESTADOS_FILTRO.length - 4} estados más`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
