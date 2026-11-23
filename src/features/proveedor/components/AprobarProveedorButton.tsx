/** Botón "Aprobar como proveedor" para Contabilidad (proveedores provisionales). */
import { useState } from "react";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAprobarProveedorProvisional } from "@/features/proveedor/hooks/useProveedoresProvisionales";

export function AprobarProveedorButton({ proveedorId, nombre }: { proveedorId: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const aprobar = useAprobarProveedorProvisional(proveedorId);
  return (
    <>
      <Button size="sm" variant="outline" disabled={aprobar.isPending} onClick={() => setAbierto(true)}>
        <CheckCircle2 className="mr-2 size-4" /> Aprobar como proveedor
      </Button>
      <ConfirmActionDialog
        open={abierto}
        onOpenChange={(open) => { if (!aprobar.isPending) setAbierto(open); }}
        title={`¿Aprobar a ${nombre}?`}
        description="Quita el bloqueo por alta provisional. Las facturas y los pagos conservan sus demás validaciones."
        confirmLabel="Confirmar aprobación"
        isPending={aprobar.isPending}
        onConfirm={() => aprobar.mutate(undefined, { onSuccess: () => setAbierto(false) })}
      />
    </>
  );
}
