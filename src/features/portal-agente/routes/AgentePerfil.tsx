/**
 * Perfil del agente: datos de contacto + cambio de contraseña.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { User as UserIcon } from "lucide-react";
import { actualizarPasswordAgente } from "@/features/portal-agente/services/perfil";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { getErrorMessage } from "@/lib/errors";
import { useAgenteContext } from "@/features/portal-agente/hooks";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { useDocumentTitle } from "@/hooks/shared";

const MIN_PASSWORD = 8;

export default function AgentePerfil() {
  useDocumentTitle("Mi perfil");
  const { data: ctx } = useAgenteContext();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const passwordCorta = password.length > 0 && password.length < MIN_PASSWORD;

  const cambiarPassword = async () => {
    if (pending || password.length < MIN_PASSWORD) return;
    setPending(true);
    try {
      await actualizarPasswordAgente(password);
      notifySuccess(undefined, { title: "Contraseña actualizada" });
      setPassword("");
    } catch (error) {
      notifyError(undefined, { title: "No se pudo cambiar la contraseña", description: getErrorMessage(error), error, method: "AGENTE_CHANGE_PASSWORD" });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        icon={<UserIcon className="h-6 w-6 text-accent" />}
        title="Mi perfil"
        description="Datos de tu cuenta de agente y cambio de contraseña."
      />


      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Agente</p>
            <p className="font-medium">{ctx?.agenteNombre ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-medium">{ctx?.email ?? "—"}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <SectionHeading>Cambiar contraseña</SectionHeading>
        <div className="space-y-2">
          <Label htmlFor="agente-nueva-password">Nueva contraseña</Label>
          <Input
            id="agente-nueva-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            aria-invalid={passwordCorta || undefined}
            aria-describedby={passwordCorta ? "agente-password-ayuda agente-password-error" : "agente-password-ayuda"}
          />
          <p id="agente-password-ayuda" className="text-body-sm text-muted-foreground">Mínimo {MIN_PASSWORD} caracteres.</p>
          {passwordCorta && <p id="agente-password-error" className="text-body-sm text-destructive">Faltan {MIN_PASSWORD - password.length} caracteres.</p>}
        </div>
        <Button onClick={cambiarPassword} disabled={pending || password.length < MIN_PASSWORD}>
          {pending ? "Guardando…" : "Actualizar contraseña"}
        </Button>
      </Card>
    </div>
  );
}
