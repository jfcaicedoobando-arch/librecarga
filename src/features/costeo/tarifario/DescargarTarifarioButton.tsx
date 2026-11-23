import { useId } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  cargando: boolean;
  error: boolean;
  hayFilas: boolean;
  onDownload: () => void;
}

export function DescargarTarifarioButton({ cargando, error, hayFilas, onDownload }: Props) {
  const id = useId();
  const motivo = error ? "No se pudo cargar la lista para exportar."
    : cargando ? "Espera a que termine la consulta."
      : !hayFilas ? "No hay filas visibles para exportar." : null;

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" type="button" onClick={onDownload} disabled={Boolean(motivo)}
        aria-describedby={motivo ? id : undefined}>
        <Download className="mr-1 size-4" /> Descargar CSV
      </Button>
      {motivo && <p id={id} className="text-label text-muted-foreground">{motivo}</p>}
    </div>
  );
}
