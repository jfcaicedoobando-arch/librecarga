/** Consulta del tabulador; las cuentas del broker no generan comisión KAM. */
import { Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogSection } from "@/components/shared/FormDialogSection";
import type { BrokerFila } from "@/features/admin/services/brokers";
import { TabuladorBroker } from "./TabuladorBroker";

export default function PorcentajesBrokerDialog({ broker, onClose }: { broker: BrokerFila; onClose: () => void }) {
  return (
    <FormDialogShell open onOpenChange={(o) => { if (!o) onClose(); }} icon={Percent}
      title={`Comisión de ${broker.nombre}`} description="Comisión exclusiva del broker."
      size="md"
      footer={<Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>}>
      <FormDialogSection flat>
        <TabuladorBroker />
        <p className="text-body-sm text-muted-foreground">
          Comisión del KAM: 0%. Conserva la gestión de la cuenta.
        </p>
      </FormDialogSection>
    </FormDialogShell>
  );
}
