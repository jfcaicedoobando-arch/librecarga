/**
 * Modal "Nuevo Cliente" — wizard de 2 pasos sobre `FormDialogShell`.
 * Paso 1: Datos fiscales + contacto (con opción de prellenar desde CSF).
 * Paso 2: Checklist documental.
 *
 * Mantiene el controller intacto y delega secciones a `NuevoClienteFormPieces`.
 */
import { useRef, useState } from "react";
import { UserPlus } from "lucide-react";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { COPY_VALIDACION } from "@/lib/copy/publicoCopy";
import { FormDialogSection } from "@/components/shared/FormDialogSection";
import DocumentChecklist from "@/components/shared/DocumentChecklist";
import { useNuevoClienteController } from "@/features/cliente/hooks";
import {
  CsfDropZone,
  ModoAltaTabs,
  ClienteField,
  ClienteFiscalSelects,
} from "./NuevoClienteFormPieces";
import { rfcLooksValid, cpLooksValid, emailLooksValid } from "./nuevoClienteValidators";
import { NuevoClienteFooter, NuevoClienteSalida } from "./NuevoClienteDialogAcciones";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAbrirCliente?: (id: string) => void;
}

function descripcionDocumentos(clienteCreado: boolean, tieneCsf: boolean): string {
  return clienteCreado
    ? "El cliente ya se creó. Falta guardar la constancia; reintenta sin crear un duplicado."
    : tieneCsf
      ? "Tu CSF ya está adjunta. Se guardará en el expediente al crear el cliente; no necesitas subirla otra vez."
      : "Adjunta la CSF en PDF. Los demás documentos se suben después desde el detalle del cliente.";
}

export default function NuevoClienteDialog({ open, onOpenChange, onAbrirCliente }: Props) {
  const c = useNuevoClienteController(() => onOpenChange(false), onAbrirCliente);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmarSalida, setConfirmarSalida] = useState(false);

  const intentarCerrar = () => {
    if (c.isSaving) return;
    if (c.hayCambios) setConfirmarSalida(true);
    else c.resetAndClose();
  };

  const triggerCsfUpload = (file: File | null) => {
    if (!file || !fileInputRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInputRef.current.files = dt.files;
    fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const headerAside = c.csfFile ? (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-2xs font-semibold uppercase tracking-wide text-success">CSF adjunta</span>
      <span className="text-xs text-muted-foreground truncate max-w-[180px]">{c.csfFile?.name}</span>
    </div>
  ) : undefined;

  return (
    <>
    <FormDialogShell
      open={open}
      busy={c.isSaving}
      onOpenChange={(abierto) => { if (!abierto) intentarCerrar(); else onOpenChange(abierto); }}
      icon={UserPlus}
      title="Nuevo cliente"
      description={
        c.step === 1
          ? "Para crear al cliente se requiere su Constancia de Situación Fiscal (CSF) en PDF. Si capturas a mano, la adjuntarás en el paso 2."
          : "Revisa la Constancia de Situación Fiscal; el resto del expediente puede completarse después."
      }
      size="lg"
      stepper={{ step: c.step, totalSteps: 2, labels: ["Datos del cliente", "Documentación"] }}
      headerAside={headerAside}
      footer={<NuevoClienteFooter c={c} intentarCerrar={intentarCerrar} />}
    >
      {c.step === 1 && (
        <>
          {/* Input oculto que canaliza al handler original del controller. */}
          <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={c.handleCsfUpload} />

          <FormDialogSection flat title="Modo de captura">
            <ModoAltaTabs modo={c.modoAlta} onChange={c.setModoAlta} />
          </FormDialogSection>

          {c.modoAlta === "csf" && (
            <FormDialogSection flat>
              <CsfDropZone
                parsingCsf={c.parsingCsf}
                fileName={c.csfFile?.name ?? null}
                onFile={triggerCsfUpload}
              />
            </FormDialogSection>
          )}

          {c.lecturaCsf === "manual" && <p role="status" className="text-body-sm text-muted-foreground">PDF adjunto. Captura los datos manualmente.</p>}
          {c.lecturaCsf === "leida" && <p role="status" className="text-body-sm text-muted-foreground">Datos extraídos. Revisa los campos antes de continuar.</p>}

          <FormDialogSection title="Datos fiscales" description="Información requerida para facturación SAT.">
            <ClienteField label="RFC" field="rfc" form={c.form} onChange={c.handleChange} required
              prefilledFromCsf={c.camposCsf.has("rfc")} validate={(v) => (!rfcLooksValid(v) ? "Formato de RFC inválido" : null)} />
            <ClienteField label="Código Postal" field="cp" form={c.form} onChange={c.handleChange} required
              prefilledFromCsf={c.camposCsf.has("cp")} validate={(v) => (!cpLooksValid(v) ? "Deben ser 5 dígitos" : null)} />
            <ClienteFiscalSelects form={c.form} onChange={c.handleChange} prefilledRegimen={c.camposCsf.has("regimen_fiscal")} />
          </FormDialogSection>

          <FormDialogSection title="Datos generales y contacto">
            <ClienteField className="md:col-span-2" label="Nombre / Razón Social" field="nombre"
              form={c.form} onChange={c.handleChange} required prefilledFromCsf={c.camposCsf.has("nombre")} />
            <ClienteField className="md:col-span-2" label="Dirección" field="direccion"
              form={c.form} onChange={c.handleChange} prefilledFromCsf={c.camposCsf.has("direccion")} />
            <ClienteField label="Ciudad" field="ciudad" form={c.form} onChange={c.handleChange} prefilledFromCsf={c.camposCsf.has("ciudad")} />
            <ClienteField label="Estado" field="estado" form={c.form} onChange={c.handleChange} prefilledFromCsf={c.camposCsf.has("estado")} />
            <ClienteField label="Contacto" field="contacto" form={c.form} onChange={c.handleChange} required />
            <ClienteField label="Email" field="email" form={c.form} onChange={c.handleChange} required
              validate={(v) => (v && !emailLooksValid(v) ? COPY_VALIDACION.correoInvalido : null)} />
            <ClienteField label="Teléfono" field="telefono" form={c.form} onChange={c.handleChange} required />

          </FormDialogSection>
        </>
      )}

      {c.step === 2 && (
        <DocumentChecklist
          documentos={c.documentos.filter((d) => d.requerido)}
          onFileChange={c.handleFileChange}
          accept=".pdf"
          descripcion={descripcionDocumentos(!!c.clienteCreado, !!c.csfFile)}
        />
      )}
    </FormDialogShell>
      <NuevoClienteSalida
        open={confirmarSalida}
        onOpenChange={setConfirmarSalida}
        clienteId={c.clienteCreado?.id}
        isSaving={c.isSaving}
        onSalir={c.resetAndClose}
        onAbrirCliente={onAbrirCliente}
      />
    </>
  );
}
