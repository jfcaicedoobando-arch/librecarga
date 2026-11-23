/**
 * Diálogo de correo con destinatarios y copias editables.
 * La copia automática se limita a contactos registrados cuando el flujo lo exige.
 */
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Send } from "lucide-react";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import {
  useEnvioDocumentoForm,
  type EnvioFormState,
} from "@/hooks/emails";
import { DestinatariosPicker } from "@/components/shared/emails/DestinatariosPicker";
import { EmailChipsField } from "@/components/shared/emails/EmailChipsField";
import { useEnvioChips } from "@/components/shared/emails/useEnvioChips";

export interface EnviarDocumentoPayload {
  destinatarios: Array<{ email: string; nombre?: string; contacto_id?: string }>;
  cc: string[];
  asunto: string;
  mensaje: string;
  marcarEnviada: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string | null;
  titulo: string;
  descripcion?: string;
  buildAsuntoInicial: () => string;
  mostrarMarcarEnviada?: boolean;
  labelMarcarEnviada?: React.ReactNode;
  labelBotonEnviar?: string;
  labelBotonReenviar?: string;
  esReenvio?: boolean;
  loading?: boolean;
  ccInicial?: string[] | null;
  destinatariosInicial?: string[] | null;
  soloContactosRegistrados?: boolean;
  onEnviar: (payload: EnviarDocumentoPayload, form: EnvioFormState) => Promise<void> | void;
}

export function EnviarDocumentoDialog({
  open, onOpenChange, clienteId, titulo, descripcion,
  buildAsuntoInicial, mostrarMarcarEnviada, labelMarcarEnviada,
  labelBotonEnviar = "Enviar", labelBotonReenviar = "Reenviar",
  esReenvio, loading, ccInicial, destinatariosInicial, soloContactosRegistrados, onEnviar,
}: Props) {
  const form = useEnvioDocumentoForm(open, clienteId, buildAsuntoInicial, {
    ccInicial,
    destinatariosManualesInicial: destinatariosInicial,
    copiaSoloContacto: soloContactosRegistrados,
  });
  const permitidos = useMemo(() => soloContactosRegistrados
    ? new Set(form.contactos.map(({ email }) => email.trim().toLowerCase()))
    : undefined, [soloContactosRegistrados, form.contactos]);
  const chips = useEnvioChips(form, permitidos);
  const contactosNoDisponibles = form.loadingContactos || form.errorContactos;
  const hayCorreosInvalidos = soloContactosRegistrados && [...chips.paraChips, ...chips.ccChips].some((chip) => chip.invalid);
  const puedeEnviar = form.destinatarios.length > 0 && !loading
    && !(soloContactosRegistrados && contactosNoDisponibles) && !hayCorreosInvalidos;

  const handleSubmit = async () => {
    if (!puedeEnviar) return;
    await onEnviar(
      {
        destinatarios: form.destinatarios,
        cc: form.ccEmails,
        asunto: form.asunto,
        mensaje: form.mensaje,
        marcarEnviada: form.marcarEnviada,
      },
      form,
    );
  };

  return (
    <FormDialogShell
      open={open}
      onOpenChange={onOpenChange}
      icon={Send}
      title={titulo}
      description={descripcion ?? "Envía el documento al cliente por correo con la imagen de tu empresa."}
      size="xl"
      footer={
        <>
          <ConteoDestinatarios destinatarios={form.destinatarios.length} copias={form.ccEmails.length} />
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!puedeEnviar} loading={loading}>
            {esReenvio ? labelBotonReenviar : labelBotonEnviar}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="envio-para">
          Para <span className="text-destructive">*</span>
        </Label>
        {soloContactosRegistrados && (
          <p className="text-body-sm text-muted-foreground">Elige correos registrados en el cliente para Para y CC.</p>
        )}
        <EmailChipsField
          id="envio-para"
          chips={chips.paraChips}
          onAdd={chips.handleParaAdd}
          onRemove={chips.handleParaRemove}
          ariaLabel="Destinatarios"
          placeholder="escribe un correo o marca un contacto abajo…"
        />
        <ContactosEnvio form={form} mostrarError={soloContactosRegistrados} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="envio-cc">Copia (CC)</Label>
        <EmailChipsField
          id="envio-cc"
          chips={chips.ccChips}
          lockedChips={chipCopiaPropia(form.userEmail, soloContactosRegistrados)}
          onAdd={chips.handleCcAdd}
          onRemove={chips.handleCcRemove}
          ariaLabel="Copia CC"
          placeholder="agrega correos en copia…"
        />
        {hayCorreosInvalidos && !contactosNoDisponibles && (
          <p role="alert" className="text-body-sm text-destructive">
            Retira o corrige los correos señalados antes de enviar.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="envio-asunto">Asunto</Label>
        <Input id="envio-asunto" value={form.asunto} onChange={(e) => form.setAsunto(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="envio-mensaje">Mensaje (opcional)</Label>
        <Textarea
          id="envio-mensaje"
          rows={4}
          value={form.mensaje}
          onChange={(e) => form.setMensaje(e.target.value)}
          placeholder="Mensaje personalizado para el cliente…"
        />
      </div>

      {mostrarMarcarEnviada && (
        <label className="flex items-center gap-2">
          <Checkbox checked={form.marcarEnviada} onCheckedChange={(v) => form.setMarcarEnviada(!!v)} />
          <span className="text-body">
            {labelMarcarEnviada ?? <>Marcar el documento como <strong>Enviado</strong></>}
          </span>
        </label>
      )}
    </FormDialogShell>
  );
}

function ConteoDestinatarios({ destinatarios, copias }: { destinatarios: number; copias: number }) {
  return (
    <div className="mr-auto text-body-sm text-muted-foreground">
      {destinatarios} destinatario{destinatarios === 1 ? "" : "s"}
      {copias > 0 && <> · {copias} en copia</>}
    </div>
  );
}

function ContactosEnvio({ form, mostrarError }: { form: EnvioFormState; mostrarError?: boolean }) {
  if (mostrarError && form.errorContactos) {
    return <ErrorStateInline title="No pudimos consultar los contactos"
      message="Reintenta para comprobar los destinatarios registrados."
      onRetry={form.reintentarContactos} />;
  }

  return <DestinatariosPicker
    contactos={form.contactos}
    loadingContactos={form.loadingContactos}
    seleccionados={form.seleccionados}
    onToggle={(id, v) => form.setSeleccionados((s) => ({ ...s, [id]: v }))}
  />;
}

function chipCopiaPropia(email: string | null, soloContactosRegistrados?: boolean) {
  if (!email) return [];
  return [{
    email,
    label: `${email} (tú)`,
    tooltip: soloContactosRegistrados ? "Tu correo está registrado en el cliente" : "Siempre se agrega tu correo",
  }];
}
