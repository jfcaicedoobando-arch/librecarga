import { useCallback, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useUpdateEmbarque } from "@/features/embarques/hooks/useEmbarques";
import { useContactosCliente } from "@/features/cliente/hooks/useClientes";
import { useDatosEditarEmbarque } from "./useDatosEditarEmbarque";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useRegistrarActividad } from "@/hooks/shared";
import {
  useConceptosForm,
  useCotizacion,
  useCotizacionesAceptadas,
} from "@/features/cotizacion/hooks";
import { useEmbarqueForm } from "@/features/embarques/hooks/useEmbarqueForm";
import { useHidratacionEditarEmbarque } from "./useHidratacionEditarEmbarque";
import { ejecutarGuardarEmbarque } from "./useEditarEmbarqueWizard.save";
import { validateStepRuta, type StepRutaInput, type StepValidationErrors } from "@/features/embarques/domain/embarqueWizardSchemas";
import { notifyError } from "@/lib/ui/appFeedback";
import { ERROR_CODES } from "@/lib/domain/errorCatalog";
import { useMargenMinimo } from "@/features/configuracion/hooks/useMargenMinimo";
import { puedeAutorizarMargenBajo } from "@/lib/domain/margenMinimo";
import type { PropuestaRevisionFiscalEmbarque } from "../services/evaluacionFiscalEmbarque";

/** Carga e hidrata el embarque y coordina el guardado del formulario. */
export function useEditarEmbarqueWizard(id: string | undefined) {
  const navigate = useNavigate();
  const { user, effectiveRole } = useAuth();
  const margenMinimoPct = useMargenMinimo();

  const carga = useDatosEditarEmbarque(id);
  const { embarque, conceptosVentaDb, conceptosCostoDb, contenedoresDb, clientes, proveedoresDb } = carga;
  // Mantiene visible la cotización vinculada, incluso en estado «En operación».
  const { data: cotizacionVinculada = null } = useCotizacion(embarque?.cotizacion_id ?? undefined);
  const { data: cotizacionesAceptadas = [] } = useCotizacionesAceptadas();
  const updateEmbarque = useUpdateEmbarque();
  const registrarActividad = useRegistrarActividad();

  const [initialized, setInitialized] = useState(false);
  const [hidratoContactos, setHidratoContactos] = useState(false);
  const [hidratoContenedores, setHidratoContenedores] = useState(false);
  const [hidratoVenta, setHidratoVenta] = useState(false);
  const [hidratoCosto, setHidratoCosto] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [guardando, setGuardando] = useState(false);
  const guardadoEnCurso = useRef<AbortController | null>(null);
  const [revisionFiscal, setRevisionFiscal] = useState<PropuestaRevisionFiscalEmbarque | null>(null);
  const resolverRevision = useRef<((motivo: string | null) => void) | null>(null);
  const responderRevisionFiscal = (motivo: string | null) => {
    resolverRevision.current?.(motivo);
    resolverRevision.current = null;
    setRevisionFiscal(null);
  };
  useEffect(() => () => {
    guardadoEnCurso.current?.abort();
    resolverRevision.current?.(null);
    resolverRevision.current = null;
  }, [id]);

  const {
    methods,
    handleMsdsUpload,
    inicializarDesdeEmbarque,
    buildEmbarquePayload,
    buildConceptosVentaPayload,
    buildConceptosCostoPayload,
  } = useEmbarqueForm();
  const clienteId = methods.watch('clienteId');
  const { data: contactos = [] } = useContactosCliente(clienteId || undefined);

  const conceptosForm = useConceptosForm();
  const {
    conceptosVenta, conceptosCosto,
    inicializarVenta, inicializarCosto,
  } = conceptosForm;

  useEffect(() => {
    if (!embarque || initialized) return;
    inicializarDesdeEmbarque(embarque);
    setInitialized(true);
  }, [embarque, initialized, inicializarDesdeEmbarque]);

  useHidratacionEditarEmbarque({
    initialized,
    datosListos: carga.listo,
    hidratoContactos,
    hidratoContenedores,
    hidratoVenta,
    hidratoCosto,
    setHidratoContactos,
    setHidratoContenedores,
    setHidratoVenta,
    setHidratoCosto,
    embarque,
    contactos,
    selectedClienteNombre: clientes.find((c) => c.id === clienteId)?.nombre,
    contenedoresDb,
    conceptosVentaDb,
    conceptosCostoDb,
    proveedoresDb,
    inicializarVenta,
    inicializarCosto,
    methods,
  });

  const selectedCliente = clientes.find((c) => c.id === clienteId);

  // El paso de costos exige una ruta completa. Los borradores pueden guardarse antes.
  const [validationErrors, setValidationErrors] = useState<Record<number, StepValidationErrors>>({});
  const validateStep = useCallback((step: number): boolean => {
    if (step !== 2) return true;
    // SAFE-CAST: los valores del formulario incluyen campos fuera de StepRutaInput;
    // validateStepRuta sólo lee los campos del paso 2 (ETD, ETA, ruta, contenedores).
    const errors = validateStepRuta(methods.getValues() as unknown as StepRutaInput);
    setValidationErrors((prev) => ({ ...prev, [step]: errors }));
    if (Object.keys(errors).length > 0) {
      notifyError(undefined, {
        step, errors, method: "USE_EDITAR_EMBARQUE_WIZARD",
        errorCode: ERROR_CODES.VALIDATION_FAILED,
      });
      return false;
    }
    return true;
  }, [methods]);

  const hidratado = initialized && hidratoVenta && hidratoCosto && hidratoContenedores;
  const handleSave = async () => {
    if (guardadoEnCurso.current) return;
    if (!carga.listo || !hidratado) {
      notifyError(undefined, {
        title: "No se puede guardar todavía",
        description: carga.errorCarga ?? "Espera a que termine de cargar la información del embarque.",
        method: "HANDLE_SAVE",
      });
      return;
    }
    const operacion = new AbortController();
    guardadoEnCurso.current = operacion;
    setGuardando(true);
    try {
      await ejecutarGuardarEmbarque({
        id,
        embarque,
        methods,
        buildEmbarquePayload,
        buildConceptosVentaPayload,
        buildConceptosCostoPayload,
        contactos,
        selectedClienteNombre: selectedCliente?.nombre,
        userEmail: user?.email,
        conceptosVenta,
        conceptosCosto,
        conceptosVentaDb,
        conceptosCostoDb,
        proveedoresDb,
        updateEmbarque,
        registrarActividad,
        setCurrentStep,
        navigate,
        margenMinimoPct,
        puedeAutorizarMargen: puedeAutorizarMargenBajo(effectiveRole),
        signal: operacion.signal,
        solicitarRevisionFiscal: (propuesta) => new Promise((resolve) => {
          resolverRevision.current = resolve;
          setRevisionFiscal(propuesta);
        }),
      });
    } finally {
      guardadoEnCurso.current = null;
      setGuardando(false);
      setRevisionFiscal(null);
    }
  };

  return {
    embarque,
    isLoading: !carga.isError && (carga.isLoading || Boolean(embarque && !hidratado)),
    isError: carga.isError,
    errorCarga: carga.errorCarga,
    refetch: carga.refetch,
    methods,
    currentStep,
    setCurrentStep,
    clientes,
    proveedoresDb,
    contactos,
    selectedCliente,
    handleMsdsUpload,
    handleSave,
    isPending: guardando || updateEmbarque.isPending,
    revisionFiscal,
    responderRevisionFiscal,
    navigate,
    conceptosForm,
    validateStep,
    validationErrors,
    cotizacionVinculada,
    cotizacionesAceptadas,
  };
}
