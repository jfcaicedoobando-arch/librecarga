import { Button } from "@/components/ui/button";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Pencil, X } from "lucide-react";

export function AccionesEditarCostos({ visible, enEdicion, guardando, puedeAbrir, onCancelar, onAbrir }: {
  visible: boolean;
  enEdicion: boolean;
  guardando: boolean;
  puedeAbrir: boolean;
  onCancelar: () => void;
  onAbrir: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="flex justify-end">
      {enEdicion ? (
        <Button variant="outline" size="sm" disabled={guardando} onClick={onCancelar}>
          <X className="h-4 w-4 mr-1" /> Cancelar edición
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled={!puedeAbrir} onClick={onAbrir}>
          <Pencil className="h-4 w-4 mr-1" /> Editar costos
        </Button>
      )}
    </div>
  );
}

export function AvisoCargaCostos({ mostrarDatosPrevios, reintentando, reintentar }: {
  mostrarDatosPrevios: boolean;
  reintentando: boolean;
  reintentar: () => void;
}) {
  return (
    <ErrorStateInline title="No se pudieron consultar los costos"
      message={mostrarDatosPrevios ? "Mostramos la última consulta disponible." : "Reintenta antes de capturar el desglose."}
      onRetry={reintentar} retrying={reintentando} />
  );
}
