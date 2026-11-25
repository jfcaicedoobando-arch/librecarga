import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import type { EnvioFormState } from "@/hooks/emails";
import { DestinatariosPicker } from "./DestinatariosPicker";

export function ContactosEnvio({ form, mostrarError }: { form: EnvioFormState; mostrarError?: boolean }) {
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
