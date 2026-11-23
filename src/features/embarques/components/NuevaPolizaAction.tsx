import { useId } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  canEdit: boolean;
  isLoading: boolean;
  isError: boolean;
  onClick: () => void;
}

export function NuevaPolizaAction({ canEdit, isLoading, isError, onClick }: Props) {
  const motivoId = useId();
  const motivoBloqueo = !canEdit ? "Sólo consulta"
    : isLoading ? "Cargando pólizas…"
    : isError ? "Reintenta la consulta para registrar una póliza." : null;
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button onClick={onClick} disabled={!!motivoBloqueo} aria-describedby={motivoBloqueo ? motivoId : undefined}>
        <Plus className="h-4 w-4 mr-2" /> Nueva póliza
      </Button>
      {motivoBloqueo && <p id={motivoId} role="status" className="text-body-sm text-muted-foreground">{motivoBloqueo}</p>}
    </div>
  );
}
