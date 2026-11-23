import { useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/errors";
import { useCreateCliente } from "@/features/cliente/hooks/useClientes";
import { subirDocumentoCliente } from "@/features/cliente/services/clienteDocumentos";
import type { Cliente } from "@/features/cliente/types/cliente";
import type { DocumentoChecklist } from "@/components/shared/DocumentChecklist";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

import { revisarPaso1Cliente } from "./nuevoClienteFormState";
import { useLecturaCsfCliente } from "./useLecturaCsfCliente";
import { DOC_CSF, DOCS_OBLIGATORIOS, EMPTY_CLIENTE, type ClienteForm, type ModoAlta } from "./useNuevoClienteController.constants";
export { DOC_CSF } from "./useNuevoClienteController.constants";
export type { ClienteForm, ModoAlta } from "./useNuevoClienteController.constants";

/**
 * Controller del diálogo de alta de clientes.
 * Encapsula el estado del wizard de 2 pasos, el parsing de CSF,
 * la validación y la mutación de creación. El componente UI queda presentacional.
 */
export function useNuevoClienteController(onClose: () => void, onAbrirCliente?: (id: string) => void) {
  const createCliente = useCreateCliente();

  const [form, setForm] = useState<ClienteForm>(EMPTY_CLIENTE);
  const [step, setStep] = useState<1 | 2>(1);
  const [modoAlta, setModoAlta] = useState<ModoAlta>("manual");
  const csf = useLecturaCsfCliente(setForm);
  const { csfFile, parsingCsf } = csf;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [clienteCreado, setClienteCreado] = useState<Cliente | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // El ref bloquea dobles clics y descartes antes del siguiente render.
  const saveInFlight = useRef(false);

  const handleChange = (field: keyof ClienteForm, value: string) => {
    csf.retirarMarca(field);
    setForm(prev => ({
      ...prev,
      [field]: field === "nombre" ? value.toLocaleUpperCase("es-MX") : value,
    }));
  };

  const { faltantes: faltantesPaso1, invalidos: invalidosPaso1 } = revisarPaso1Cliente(form);
  const isStep1Valid = faltantesPaso1.length === 0 && invalidosPaso1.length === 0;

  // El archivo seleccionado es la única fuente del checklist, incluso si falla la extracción.
  const documentos: DocumentoChecklist[] = step === 2 ? DOCS_OBLIGATORIOS.map(nombre => ({
    nombre, requerido: nombre === DOC_CSF,
    adjuntado: nombre === DOC_CSF && !!csfFile,
    archivo: nombre === DOC_CSF ? csfFile?.name : undefined,
  })) : [];

  const handleNext = () => {
    if (!isStep1Valid || parsingCsf) return;
    setStep(2);
  };

  const handleFileChange = (docNombre: string, file: File | undefined) => {
    if (docNombre !== DOC_CSF) return;
    csf.adjuntar(file ?? null);
  };

  // P-08: sólo la CSF es obligatoria; el resto del expediente se completa
  // después desde el detalle del cliente.
  const docsRequeridosCompletos =
    documentos.length > 0 && documentos.every(d => d.requerido === false || d.adjuntado);

  const reset = () => {
    setForm(EMPTY_CLIENTE);
    setStep(1);
    csf.adjuntar(null);
    setModoAlta("manual");
    setClienteCreado(null);
  };

  const resetAndClose = () => {
    if (saveInFlight.current) return;
    reset();
    onClose();
  };

  const handleSave = async () => {
    if (!isStep1Valid || !docsRequeridosCompletos || !csfFile || saveInFlight.current || parsingCsf) return;
    saveInFlight.current = true;
    setIsSaving(true);
    let cliente = clienteCreado;
    try {
      if (!cliente) {
        cliente = await createCliente.mutateAsync(form);
        if (mounted.current) setClienteCreado(cliente);
      }
      await subirDocumentoCliente({
        clienteId: cliente.id,
        organizationId: cliente.organization_id,
        tipo: "Constancia de situación fiscal",
        archivo: csfFile,
      });
      if (!mounted.current) return;
      const clienteId = cliente.id;
      notifySuccess(undefined, {
        title: "Cliente creado exitosamente",
        action: onAbrirCliente ? { label: "Ver ficha del cliente", onClick: () => onAbrirCliente(clienteId) } : undefined,
      });
      // Sólo el guardado exitoso puede cerrar mientras conserva el lock.
      reset();
      onClose();
    } catch (error: unknown) {
      if (!mounted.current) return;
      notifyError(undefined, {
        title: cliente ? "Cliente creado; constancia pendiente" : "Error al crear cliente",
        description: cliente
          ? `La constancia no se guardó. Intenta de nuevo: no se creará otro cliente. ${getErrorMessage(error)}`
          : getErrorMessage(error),
        error: error,
        method: "HANDLE_SAVE",
      });
    } finally {
      saveInFlight.current = false;
      if (mounted.current) setIsSaving(false);
    }
  };

  const hayCambios = clienteCreado !== null || csfFile !== null ||
    (Object.keys(EMPTY_CLIENTE) as Array<keyof ClienteForm>).some((campo) => form[campo] !== EMPTY_CLIENTE[campo]);

  return {
    form,
    hayCambios,
    step,
    documentos,
    modoAlta,
    parsingCsf,
    csfFile,
    csfParsed: csf.csfParsed,
    camposCsf: csf.camposCsf,
    lecturaCsf: csf.lecturaCsf,
    clienteCreado,
    isSaving,
    isStep1Valid,
    faltantesPaso1,
    invalidosPaso1,
    docsRequeridosCompletos,
    setModoAlta,
    setStep,
    handleChange,
    handleNext,
    handleFileChange,
    handleSave,
    handleCsfUpload: csf.handleCsfUpload,
    resetAndClose,
  };
}
