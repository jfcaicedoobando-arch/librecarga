import { useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { usePasarAProspecto } from "@/features/crm/hooks/useObjetosCrm";
import { usePermisoPasarAProspecto } from "@/features/crm/hooks/usePermisoPasarAProspecto";
import type { EmpresaProspecto } from "@/features/crm/domain/pasarEmpresaAProspecto";

export function PasarEmpresaAProspectoBoton({ empresa }: { empresa: EmpresaProspecto & { nombre: string } }) {
  const permiso = usePermisoPasarAProspecto(empresa);
  const pasar = usePasarAProspecto();
  const descripcionId = useId();
  const [idPorConvertir, setIdPorConvertir] = useState<string | null>(null);
  if (permiso.estado === "oculto") return null;
  const motivo = permiso.estado === "comprobar" ? "Verificando permiso…" : permiso.motivo;
  return (
    <div className="flex max-w-sm flex-col items-start gap-1">
      <Button onClick={() => setIdPorConvertir(empresa.id)}
        disabled={permiso.estado !== "permitido" || pasar.isPending}
        aria-describedby={motivo ? descripcionId : undefined}>
        <ArrowRight className="size-4" /> Pasar a prospecto
      </Button>
      {motivo && <p id={descripcionId} className="text-caption text-muted-foreground" role="status">{motivo}</p>}
      {permiso.reintentar && <Button variant="link" size="sm" onClick={permiso.reintentar}>Reintentar verificación</Button>}
      <ConfirmActionDialog
        open={idPorConvertir === empresa.id}
        onOpenChange={(open) => { if (!open && !pasar.isPending) setIdPorConvertir(null); }}
        title={`¿Pasar a prospecto a ${empresa.nombre}?`}
        description="La empresa pasará a Prospecto y se abrirá o recuperará su oportunidad."
        confirmLabel="Pasar a prospecto"
        cancelLabel="Conservar empresa"
        isPending={pasar.isPending}
        confirmDisabled={permiso.estado !== "permitido"}
        onConfirm={() => {
          if (permiso.estado !== "permitido" || idPorConvertir !== empresa.id || pasar.isPending) return;
          pasar.mutate(empresa.id, { onSuccess: () => setIdPorConvertir(null) });
        }}
      />
    </div>
  );
}
