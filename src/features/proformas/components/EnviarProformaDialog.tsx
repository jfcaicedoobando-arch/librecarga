/** Envío de proforma por correo con resultado por destinatario. */
import { useEffect, useRef, useState } from "react";
import { CampoCorreoProforma, type ErrorCorreoProforma } from "./CampoCorreoProforma";
import { Mail } from "lucide-react";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogCancelarBoton } from "@/components/shared/FormDialogCancelarBoton";
import { emailSchema } from "@/lib/validation/mutationSchemas.shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCopyText } from "@/hooks/shared/useCopyText";
import { useDestinatariosSugeridos } from "@/features/proformas/hooks/useDestinatariosSugeridos";
import { useEmailsOcultos } from "@/features/proformas/hooks/useEmailsOcultos";
import { useEnviarProformaEmail, type EnviarProformaVars } from "@/features/proformas/hooks/useEnviarProformaEmail";
import type { EnviarProformaEmailResult } from "@/features/proformas/services/enviarEmail";
import { DestinatariosRecientesChips } from "./DestinatariosRecientesChips";
import { ResultadoEnvioProforma } from "./ResultadoEnvioProforma";
import type { ProformaDetalleFull } from "@/features/proformas/services";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proforma: ProformaDetalleFull;
}

function defaultAsunto(proforma: ProformaDetalleFull) {
  return `Proforma ${proforma.numero ?? ""} para su aprobación`.trim();
}

function destinatariosIniciales(ultimo?: { to: string[]; cc: string[] } | null) {
  return [ultimo?.to.join(", ") ?? "", ultimo?.cc.join(", ") ?? ""];
}

function defaultMensaje(p: ProformaDetalleFull): string {
  return [
    `Estimado(a) ${p.cliente_nombre ?? "cliente"},`,
    "",
    `Compartimos la proforma ${p.numero ?? ""} correspondiente al embarque ${p.expediente ?? ""} para su revisión.`,
    "",
    "Desde el botón en el correo podrás aceptarla o rechazarla directamente.",
    "",
    "Saludos cordiales,",
  ].join("\n");
}

export function EnviarProformaDialog({ open, onOpenChange, proforma }: Props) {
  const copy = useCopyText();
  const [destinatarios, setDestinatarios] = useState("");
  const [cc, setCc] = useState("");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [contenidoInicial, setContenidoInicial] = useState({ asunto: "", mensaje: "" });
  const proformaInicializada = useRef<string | null>(null);
  const correosEditados = useRef({ to: false, cc: false });
  const paraRef = useRef<HTMLInputElement>(null);
  const ccRef = useRef<HTMLInputElement>(null);
  const [errorCorreo, setErrorCorreo] = useState<ErrorCorreoProforma | null>(null);
  const [envio, setEnvio] = useState<{ resultado: EnviarProformaEmailResult; vars: EnviarProformaVars } | null>(null);
  const { data: memoria } = useDestinatariosSugeridos(proforma.cliente_id);
  const { ocultos, isOculto, ocultar, restaurar, restaurarVarios } = useEmailsOcultos(proforma.cliente_id);

  const sugerenciasVisibles = (memoria?.sugerencias ?? []).filter((e) => !isOculto(e));
  const [paraInicial, ccInicial] = destinatariosIniciales(memoria?.ultimo);

  useEffect(() => {
    if (!open) {
      proformaInicializada.current = null;
      return;
    }
    if (proformaInicializada.current !== proforma.id) {
      proformaInicializada.current = proforma.id;
      correosEditados.current = { to: false, cc: false };
      setErrorCorreo(null);
      const inicial = { asunto: defaultAsunto(proforma), mensaje: defaultMensaje(proforma) };
      setContenidoInicial(inicial);
      setAsunto(inicial.asunto);
      setMensaje(inicial.mensaje);
    }
    if (!correosEditados.current.to) setDestinatarios(paraInicial);
    if (!correosEditados.current.cc) setCc(ccInicial);
  }, [open, proforma, paraInicial, ccInicial]);
  function editarEmail(target: "to" | "cc", valor: string) {
    correosEditados.current[target] = true;
    setErrorCorreo((error) => error?.campo === target ? null : error);
    const setter = target === "to" ? setDestinatarios : setCc;
    setter(valor);
  }
  function agregarEmail(target: "to" | "cc", email: string) {
    const current = target === "to" ? destinatarios : cc;
    const partes = current.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (partes.includes(email.toLowerCase())) return;
    editarEmail(target, current ? `${current.replace(/[,;\s]+$/, "")}, ${email}` : email);
  }

  const enviarMut = useEnviarProformaEmail(proforma.id, (res, vars) => {
    setEnvio({ resultado: res, vars });
    if (res.estado === "enviado" || res.estado === "parcial") {
      restaurarVarios([...vars.to.map((t) => t.email), ...vars.ccList]);
    }
  });

  function handleEnviar() {
    const to = destinatarios.split(/[,;\s]+/).filter(Boolean).map((email) => ({ email }));
    const ccList = cc.split(/[,;\s]+/).filter(Boolean);
    if (!to.length || to.some(({ email }) => !emailSchema.safeParse(email).success)) {
      setErrorCorreo({ campo: "to", texto: to.length ? "Revisa el formato de los correos en Para." : "Ingresa al menos un destinatario." });
      paraRef.current?.focus();
      return;
    }
    if (ccList.some((email) => !emailSchema.safeParse(email).success)) {
      setErrorCorreo({ campo: "cc", texto: "Revisa el formato de los correos en CC." });
      ccRef.current?.focus();
      return;
    }
    enviarMut.mutate({ to, ccList, asunto, mensaje });
  }

  const loading = enviarMut.isPending;
  const valores = [destinatarios, cc, asunto, mensaje];
  const iniciales = [paraInicial, ccInicial, contenidoInicial.asunto, contenidoInicial.mensaje];
  const isDirty = !envio && valores.some((valor, i) => valor !== iniciales[i]);
  const cerrar = (next: boolean) => {
    if (loading) return;
    if (!next && envio?.resultado.estado !== "pendiente") setEnvio(null);
    onOpenChange(next);
  };

  function copiar(link: string) {
    void copy(link, {
      successMessage: "Enlace copiado",
      errorTitle: "No se pudo copiar. Selecciona el enlace visible para copiarlo manualmente.",
      method: "PROFORMAS_COPIAR_ENLACE_ENVIO",
    });
  }

  const footer = !envio ? (
    <>
      <FormDialogCancelarBoton onCancelar={() => cerrar(false)} disabled={loading} />
      <Button onClick={handleEnviar} loading={loading}>
        Enviar correo
      </Button>
    </>
  ) : (
    <>
      <Button variant="outline" onClick={() => cerrar(false)} disabled={loading}>Cerrar</Button>
      {envio.resultado.estado === "pendiente" && (
        <Button onClick={() => enviarMut.mutate(envio.vars)} loading={loading}>Reintentar envío</Button>
      )}
    </>
  );

  return (
    <FormDialogShell
      open={open}
      onOpenChange={cerrar}
      icon={Mail}
      title="Enviar proforma al cliente"
      description="El cliente recibirá un correo con un enlace seguro para aceptar o rechazar la proforma."
      size="lg"
      busy={loading}
      isDirty={isDirty}
      footer={footer}
    >
      {!envio && (
        <div className="space-y-3">
          <datalist id="proforma-emails-sugeridos">
            {sugerenciasVisibles.map((e) => <option key={e} value={e} />)}
          </datalist>
          <div>
            <CampoCorreoProforma campo="to" ref={paraRef} error={errorCorreo} value={destinatarios}
              onChange={(valor) => editarEmail("to", valor)} />
            <DestinatariosRecientesChips
              sugerencias={sugerenciasVisibles}
              ocultos={ocultos}
              onAgregar={(e) => agregarEmail("to", e)}
              onOcultar={ocultar}
              onRestaurar={restaurar}
              onRestaurarVarios={restaurarVarios}
            />
          </div>

          <CampoCorreoProforma campo="cc" ref={ccRef} error={errorCorreo} value={cc}
            onChange={(valor) => editarEmail("cc", valor)} />
          <div>
            <Label htmlFor="asunto">Asunto</Label>
            <Input id="asunto" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="msg">Mensaje</Label>
            <Textarea id="msg" value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={6} />
          </div>
        </div>
      )}

      {envio && <ResultadoEnvioProforma resultado={envio.resultado} onCopiar={copiar} />}
    </FormDialogShell>
  );
}
