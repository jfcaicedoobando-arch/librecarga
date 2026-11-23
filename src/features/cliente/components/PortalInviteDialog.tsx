import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send } from "lucide-react";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { useInviteClientUser } from "@/features/cliente/hooks";
import { emailSchema } from "@/lib/validation/mutationSchemas.shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  organizationId: string;
}

export default function PortalInviteDialog({
  open,
  onOpenChange,
  clienteId,
  organizationId,
}: Props) {
  const [email, setEmail] = useState("");
  const [mostrarError, setMostrarError] = useState(false);
  const id = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const inviteMutation = useInviteClientUser(clienteId);
  const correo = email.trim();
  const correoValido = correo !== "" && emailSchema.safeParse(correo).success;
  const errorVisible = mostrarError && !correoValido;

  const cerrar = () => {
    setEmail("");
    setMostrarError(false);
    onOpenChange(false);
  };

  // 13.85.10 — Toasts viven en `useInviteClientUser`.
  const handleInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inviteMutation.isPending) return;
    if (!correoValido) {
      setMostrarError(true);
      emailRef.current?.focus();
      return;
    }
    inviteMutation.mutate(
      { email: correo, cliente_id: clienteId, organization_id: organizationId },
      {
        onSuccess: cerrar,
      },
    );
  };

  return (
    <FormDialogShell
      open={open}
      onOpenChange={(next) => { if (!next) cerrar(); }}
      busy={inviteMutation.isPending}
      icon={Send}
      title="Invitar cliente al portal"
      description="Envía una invitación al cliente para acceder al portal de seguimiento."
      size="md"
      formId={id}
      onSubmit={handleInvite}
      footer={
        <>
          <Button variant="outline" onClick={cerrar} disabled={inviteMutation.isPending}>Cancelar</Button>
          <Button type="submit" form={id} loading={inviteMutation.isPending}>
            Enviar Invitación
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor={`${id}-email`}>Email del cliente</Label>
        <Input
          id={`${id}-email`}
          ref={emailRef}
          type="email"
          required
          placeholder="cliente@empresa.com"
          aria-invalid={errorVisible || undefined}
          aria-describedby={errorVisible ? `${id}-error` : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {errorVisible && (
          <p id={`${id}-error`} role="alert" className="text-body-sm text-destructive">
            {correo ? "Escribe un correo electrónico válido." : "Escribe el correo electrónico del cliente."}
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Se creará una cuenta con rol de cliente y se le enviará un correo. Al abrir
        el enlace, el cliente crea su contraseña y entra directo al portal. Tendrá
        acceso solo a sus propios embarques, cotizaciones y facturas. Puede agregar
        varios usuarios al mismo cliente.
      </p>
    </FormDialogShell>
  );
}
