import { Plus, MoreHorizontal, Download, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/shared/Hint";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SIN_EXPORTAR = "No hay cotizaciones que exportar con los filtros actuales.";

interface CotizacionesPageActionsProps {
  canEdit: boolean;
  /** Total filtrado en servidor: con 0 no hay nada que exportar. */
  totalFiltrado?: number;
  actualizandoResultados?: boolean;
  /** v13.823.349 — evita segundas descargas mientras el CSV se está armando. */
  exportando?: boolean;
  onExportar: () => void;
  onNueva: () => void;
}

export function CotizacionesPageActions({
  canEdit,
  totalFiltrado,
  actualizandoResultados = false,
  exportando = false,
  onExportar,
  onNueva,
}: CotizacionesPageActionsProps) {
  const motivoExportar = actualizandoResultados ? "Actualizando los resultados de los filtros." : totalFiltrado === 0 ? SIN_EXPORTAR : "";
  const exportacionBloqueada = Boolean(motivoExportar) || exportando;
  const etiquetaExportar = exportando ? "Exportando…" : "Exportar CSV";
  return (
    <>
      <Button variant="outline" asChild className="hidden md:inline-flex">
        <Link to="/cotizaciones/plantillas">
          <Sparkles className="h-4 w-4 mr-2" /> Plantillas
        </Link>
      </Button>
      <Hint label={motivoExportar}>
        <Button
          variant="outline"
          onClick={onExportar}
          disabled={exportacionBloqueada}
          // Un botón deshabilitado no dispara el tooltip de Radix (no recibe
          // eventos de puntero): dejamos la causa como descripción accesible
          // (sin `title` nativo, prohibido por la auditoría de arquitectura).
          aria-describedby={motivoExportar ? "exportar-csv-motivo" : undefined}
          className="hidden md:inline-flex"
        >
          <Download className="h-4 w-4 mr-2" /> {etiquetaExportar}
        </Button>
      </Hint>
      {motivoExportar && (
        <span id="exportar-csv-motivo" className="sr-only">
          {motivoExportar}
        </span>
      )}

      {/* v13.223.0 · Capa 3 Tranche A · 3.2: acciones secundarias primero,
          primary (`Nueva cotización`) pegado al borde derecho (Fitts's law). */}
      {canEdit && (
        <Button variant="outline" asChild className="hidden md:inline-flex">
          <Link to="/cotizaciones/nueva/tarifario">
            <Plus className="h-4 w-4 mr-2" /> Nuevo tarifario
          </Link>
        </Button>
      )}
      {canEdit && (
        <Button onClick={onNueva} className="hidden md:inline-flex">
          <Plus className="h-4 w-4 mr-2" /> Nueva cotización
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="md:hidden" aria-label="Más acciones">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to="/cotizaciones/plantillas">
              <Sparkles className="mr-2 h-4 w-4" /> Plantillas
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onExportar}
            disabled={exportacionBloqueada}
            aria-describedby={motivoExportar ? "exportar-csv-motivo" : undefined}
          >
            <Download className="mr-2 h-4 w-4" /> {etiquetaExportar}
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem asChild>
              <Link to="/cotizaciones/nueva/tarifario">
                <Plus className="mr-2 h-4 w-4" /> Nuevo tarifario
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

