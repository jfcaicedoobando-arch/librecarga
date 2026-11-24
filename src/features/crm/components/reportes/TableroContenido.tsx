/**
 * Contenido del tablero activo en /crm/reportes: pestañas de tableros,
 * estado vacío y la cuadrícula de tarjetas. Extraído de la ruta.
 */
import { BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmptyState from "@/components/empty/EmptyState";
import { LoadingState } from "@/components/shared/states/LoadingState";
import type { CrmReporteRow, CrmTableroRow } from "@/features/crm/services/reportes/tiposReportes";
import { TarjetaReporte } from "./TarjetaReporte";

interface Props {
  tableros: CrmTableroRow[];
  activoId: string | null;
  reportes: CrmReporteRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isSuperAdmin: boolean;
  onSeleccionarTablero: (id: string) => void;
  onEditarReporte: (r: CrmReporteRow) => void;
  onEliminarReporte: (r: CrmReporteRow) => void;
}

export function TableroContenido(p: Props) {
  return (
    <Tabs value={p.activoId ?? ""} onValueChange={p.onSeleccionarTablero}>
      <TabsList aria-label="Tableros de CRM">
        {p.tableros.map((t) => (
          <TabsTrigger key={t.id} value={t.id}>{t.nombre}</TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={p.activoId ?? ""}>
        {(p.isLoading || p.isError) && (
          <LoadingState
            key={p.activoId}
            label="Cargando reportes…"
            error={p.isError}
            errorLabel="No se pudieron cargar los reportes de este tablero."
            onRetry={p.onRetry}
          />
        )}
        {!p.isLoading && !p.isError && p.reportes.length === 0 && (
          <EmptyState
            icon={BarChart3}
            title="Este tablero no tiene reportes"
            description={p.isSuperAdmin ? "Agrega el primero con el botón de arriba." : "Pide al administrador que agregue reportes."}
          />
        )}
        {p.reportes.length > 0 && (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {p.reportes.map((r) => (
              <TarjetaReporte
                key={r.id}
                reporte={r}
                canEdit={p.isSuperAdmin}
                onEditar={p.onEditarReporte}
                onEliminar={p.onEliminarReporte}
              />
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
