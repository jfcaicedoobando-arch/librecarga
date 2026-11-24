/** Alta de prospecto externo: empresa + contactos; el KAM se asigna por turno. */
import { useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogCancelarBoton } from "@/components/shared/FormDialogCancelarBoton";
import { FormDialogSection } from "@/components/shared/FormDialogSection";
import { contactoVacio, empresaVacia, validarAlta } from "../domain/altaProspecto";
import { useAltaProspectoBroker } from "../hooks/useBrokerPortal";
import EmpresaBrokerFields from "./EmpresaBrokerFields";
import ContactosBrokerFields from "./ContactosBrokerFields";

interface Props {
  brokerId: string | null;
  open: boolean;
  nombreInicial: string;
  onClose: () => void;
}

export default function AltaProspectoDialog({ brokerId, open, nombreInicial, onClose }: Props) {
  const empresaInicial = { ...empresaVacia(), nombre: nombreInicial };
  const [empresa, setEmpresa] = useState(empresaInicial);
  const [contactos, setContactos] = useState(() => [contactoVacio()]);
  const m = useAltaProspectoBroker(brokerId);
  const problema = validarAlta(empresa, contactos);
  const hayCambios = JSON.stringify(empresa) !== JSON.stringify(empresaInicial)
    || contactos.length !== 1 || Object.values(contactos[0] ?? {}).some(Boolean);

  const cerrar = () => { setEmpresa(empresaInicial); setContactos([contactoVacio()]); onClose(); };
  const guardar = async () => {
    if (problema) return;
    try {
      await m.mutateAsync({ empresa, contactos });
      cerrar();
    } catch {
      // el aviso lo muestra el hook
    }
  };

  return (
    <FormDialogShell
      open={open}
      onOpenChange={(o) => { if (!o) cerrar(); }}
      icon={Building2}
      title="Registrar prospecto externo"
      description="La empresa queda como Prospecto externo con fuente Broker."
      size="lg"
      isDirty={hayCambios}
      busy={m.isPending}
      footer={
        <>
          <FormDialogCancelarBoton onCancelar={cerrar} disabled={m.isPending} />
          <Button onClick={guardar} disabled={!!problema} loading={m.isPending}>Registrar</Button>
        </>
      }
    >
      <FormDialogSection title="Empresa">
        <EmpresaBrokerFields value={empresa} onChange={setEmpresa} problema={problema} />
      </FormDialogSection>
      <FormDialogSection title="Contactos">
        <ContactosBrokerFields value={contactos} onChange={setContactos} problema={problema} />
      </FormDialogSection>
    </FormDialogShell>
  );
}
