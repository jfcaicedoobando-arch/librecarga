/**
 * v13.142.3 — Panel desplegable con el desglose de las alertas que alimentan
 * el badge "Embarques · N" del sidebar. Cada tarjeta aplica un filtro
 * `?alerta=` al listado para que el usuario pueda atender los pendientes
 * sin adivinar qué embarques están detrás del conteo.
 *
 * v13.545.0 — Se separaron "Cierre operativo" (Entregado / EIR) y "Cierre
 * administrativo" (Por liquidar). Las definiciones de tarjeta viven en
 * `constants/alertasTiles.ts`.
 */
import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { EmbarqueAlertaFiltro } from "@/features/embarques/hooks/useEmbarquesFilters";
import type { EmbarquesAlertasResumen } from "@/features/embarques/services/alertas";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { ALERTAS_TILES } from "@/features/embarques/constants/alertasTiles";

interface Props {
  resumen: EmbarquesAlertasResumen;
  activeAlerta: EmbarqueAlertaFiltro;
  onSelect: (alerta: EmbarqueAlertaFiltro) => void;
}

export function EmbarquesAlertasPanel({ resumen, activeAlerta, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);
  const alertaActiva = ALERTAS_TILES.find(({ key }) => key === activeAlerta);
  if (resumen.total === 0 && !alertaActiva) return null;

  return (
    <Collapsible asChild open={expanded} onOpenChange={setExpanded}>
    <Card className="px-4 py-2 border-warning/40 bg-warning/10 dark:bg-warning/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
          <SectionHeading>Alertas activas</SectionHeading>
          <Badge variant="warning" size="xs">
            {resumen.total}
          </Badge>
          {alertaActiva && <span className="text-body-sm">Filtro: {alertaActiva.titulo}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {alertaActiva && (
            <Button variant="ghost" size="sm" onClick={() => onSelect("todos")}>
              Ver todos los embarques
            </Button>
          )}
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1">
              {expanded ? "Ocultar alertas" : "Ver alertas"}
              <ChevronDown aria-hidden className={expanded ? "size-4 rotate-180" : "size-4"} />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>

      <CollapsibleContent className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ALERTAS_TILES.map(({ key, titulo, descripcion, Icon, color }) => {

          const count = resumen[key];
          const active = activeAlerta === key;
          // v13.223.0 · Capa 3 Tranche A · 2.2: ocultar tiles con count = 0
          // salvo cuando el usuario los eligió activamente (para no dejar la
          // vista vacía si limpian el filtro).
          if (count === 0 && !active) return null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(active ? "todos" : key)}
              aria-pressed={active}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-background/80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${
                active ? "border-primary ring-2 ring-primary/20 bg-background" : "border-border bg-background/50"
              }`}
            >
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md ${color}`}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body font-medium truncate">{titulo}</span>
                  <span className="text-base font-semibold tabular-nums">{count}</span>
                </div>
                <p className="text-body-sm text-muted-foreground mt-0.5 line-clamp-2">{descripcion}</p>
              </div>
            </button>
          );
        })}
      </CollapsibleContent>
    </Card>
    </Collapsible>
  );
}
