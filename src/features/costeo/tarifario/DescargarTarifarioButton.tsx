import { useId } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";

interface Props {
  cargando: boolean;
  error: boolean;
  hayFilas: boolean;
  onDownload: () => void;
  enMenu?: boolean;
}

export function DescargarTarifarioButton({ cargando, error, hayFilas, onDownload, enMenu = false }: Props) {
  const id = useId();
  const motivo = error ? "No se pudo cargar la lista para exportar."
    : cargando ? "Espera a que termine la consulta."
      : !hayFilas ? "No hay filas visibles para exportar." : null;

  if (enMenu) {
    return (
      <>
        <DropdownMenuItem onSelect={onDownload} disabled={Boolean(motivo)} aria-describedby={motivo ? id : undefined} className="gap-2">
          <Download className="size-4" /> Descargar CSV
        </DropdownMenuItem>
        {motivo && <DropdownMenuLabel id={id} className="text-label font-normal text-muted-foreground">{motivo}</DropdownMenuLabel>}
      </>
    );
  }

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
