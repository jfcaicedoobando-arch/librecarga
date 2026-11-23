/**
 * Tarjeta de un reporte dentro de un tablero: título, gráfica y (para el
 * súper administrador) acciones de editar y eliminar.
 */
import { Pencil, Trash2 } from "lucide-react";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReporteDatos } from "@/features/crm/hooks/useReportesCrm";
import type { CrmReporteRow } from "@/features/crm/services/reportes/tiposReportes";
import { GraficaReporte } from "./GraficaReporte";

interface Props {
  reporte: CrmReporteRow;
  canEdit: boolean;
  onEditar: (reporte: CrmReporteRow) => void;
  onEliminar: (reporte: CrmReporteRow) => void;
}

export function TarjetaReporte({ reporte, canEdit, onEditar, onEliminar }: Props) {
  const { data: datos = [], isLoading, isError, isFetching, refetch } = useReporteDatos(reporte.id);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base font-semibold leading-tight">{reporte.nombre}</CardTitle>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditar(reporte)} aria-label="Editar reporte">
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEliminar(reporte)} aria-label="Eliminar reporte">
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <p className="py-8 text-center text-body text-muted-foreground">Cargando…</p>}
        {isError && <ErrorStateInline title="No se pudieron cargar los datos" message="Reintenta para consultar los datos de esta gráfica."
          onRetry={() => void refetch()} retrying={isFetching} />}
        {!isLoading && !isError && <GraficaReporte tipo={reporte.tipo_grafica} datos={datos} medida={reporte.medida} />}
      </CardContent>
    </Card>
  );
}
