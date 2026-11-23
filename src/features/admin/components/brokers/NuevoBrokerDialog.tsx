import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogSection } from "@/components/shared/FormDialogSection";
import { useCrearBroker } from "@/features/admin/hooks/useBrokers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NuevoBrokerDialog({ open, onOpenChange }: Props) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const crear = useCrearBroker();
  const valido = nombre.trim() !== "" && email.includes("@");

  const cerrar = (next: boolean) => {
    if (!next) { setNombre(""); setEmail(""); }
    onOpenChange(next);
  };

  const guardar = async () => {
    if (!valido) return;
    try {
      await crear.mutateAsync({ nombre: nombre.trim(), email: email.trim(), comision_pct: 0 });
      cerrar(false);
    } catch {
      // el aviso lo muestra el hook
    }
  };

  return (
    <FormDialogShell
      open={open}
      onOpenChange={cerrar}
      icon={UserPlus}
      title="Crear broker nuevo"
      description="El broker recibirá un correo para crear su contraseña y entrar al Portal de Brokers."
      size="md"
      isDirty={nombre !== "" || email !== ""}
      busy={crear.isPending}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => cerrar(false)} disabled={crear.isPending}>Cancelar</Button>
          <Button onClick={guardar} disabled={!valido} loading={crear.isPending}>Crear broker</Button>
        </>
      }
    >
      <FormDialogSection flat>
        <div className="space-y-1.5">
          <Label htmlFor="broker-nombre">Nombre del broker</Label>
          <Input id="broker-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="broker-email">Correo electrónico</Label>
          <Input id="broker-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="broker@correo.com" autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <p className="text-body-sm text-muted-foreground">Comisiona con el tabulador oficial de brokers por servicio; se gana conforme el cliente paga.</p>
        </div>
      </FormDialogSection>
    </FormDialogShell>
  );
}
