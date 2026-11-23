/**
 * useCancelarFacturaController — orquesta datos y acciones del diálogo de
 * cancelación de factura: evalúa condiciones SAT, carga sustitutas
 * disponibles, gestiona el formulario y ejecuta la cancelación.
 */
import { useEffect, useMemo, useState } from "react";
import { useCancelarFactura } from "@/features/facturacion/hooks/useTimbrarFactura";
import { useSustitutasDeFactura } from "@/features/facturacion/hooks/useSustitutasDeFactura";
import type { MotivoCancelacionSat } from "@/features/facturacion/services/facturapi";
import { todayLocalISO } from "@/lib/date/today";
import { getErrorMessage } from "@/lib/errors";

// RFC genérico SAT para "público en general" y extranjeros.
const RFC_GENERICOS = new Set(["XAXX010101000", "XEXX010101000"]);

/**
 * Evalúa si la cancelación requiere aceptación del receptor según la
 * regla SAT 2.7.1.34 (RMF 2022+).
 */
function evaluarCondicionesSAT(params: {
  fechaEmision: string | null | undefined;
  total: number | null | undefined;
  rfc: string | null | undefined;
}): { mismoDia: boolean; montoBajo: boolean; rfcGenerico: boolean; requiereAceptacion: boolean } {
  const hoy = todayLocalISO();
  const fecha = params.fechaEmision?.slice(0, 10) ?? null;
  const mismoDia = fecha !== null && fecha === hoy;
  const montoBajo = (params.total ?? Infinity) <= 1000;
  const rfc = (params.rfc ?? "").toUpperCase().trim();
  const rfcGenerico = RFC_GENERICOS.has(rfc);
  const requiereAceptacion = !(mismoDia || montoBajo || rfcGenerico);
  return { mismoDia, montoBajo, rfcGenerico, requiereAceptacion };
}

interface Params {
  facturaId: string | null;
  fechaEmision?: string | null;
  total?: number | null;
  rfcCliente?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAbrirSustituir?: () => void;
}

export function useCancelarFacturaController(params: Params) {
  const { facturaId, fechaEmision, total, rfcCliente, open, onOpenChange, onAbrirSustituir } = params;
  const cancelar = useCancelarFactura();
  const [motivo, setMotivoState] = useState<MotivoCancelacionSat>("02");
  const [sustitutaId, setSustitutaId] = useState<string>("");
  const [consultarOpen, setConsultarOpen] = useState(false);

  const cond = useMemo(
    () => evaluarCondicionesSAT({ fechaEmision, total, rfc: rfcCliente }),
    [fechaEmision, total, rfcCliente],
  );

  const sustitutasQ = useSustitutasDeFactura(facturaId, open && motivo === "01");

  const sustitutasTimbradas = useMemo(
    () => (sustitutasQ.data ?? []).filter((s) => s.estado === "Emitida" && !!s.uuid_fiscal),
    [sustitutasQ.data],
  );

  const sustitutaElegida = sustitutasTimbradas.find((s) => s.id === sustitutaId);

  useEffect(() => {
    setSustitutaId("");
  }, [facturaId, open]);

  useEffect(() => {
    if (sustitutaId && !sustitutasQ.isLoading && !sustitutasQ.isError && !sustitutaElegida) setSustitutaId("");
  }, [sustitutaId, sustitutasQ.isLoading, sustitutasQ.isError, sustitutaElegida]);

  const setMotivo = (nuevoMotivo: MotivoCancelacionSat) => {
    setMotivoState(nuevoMotivo);
    setSustitutaId("");
  };

  const requiereSustituta = motivo === "01";
  const puedeConfirmar = !requiereSustituta
    || (!sustitutasQ.isError && !!sustitutaElegida);

  const onConfirm = () => {
    if (!facturaId || !puedeConfirmar || cancelar.isPending) return;
    cancelar.mutate(
      {
        facturaId,
        motivo,
        sustituidaPorFacturaId: requiereSustituta ? sustitutaId : undefined,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const abrirWizard = () => {
    onOpenChange(false);
    onAbrirSustituir?.();
  };

  const errorMessage = cancelar.isError
    ? getErrorMessage(cancelar.error)
    : null;

  return {
    cancelar,
    motivo,
    setMotivo,
    sustitutaId,
    setSustitutaId,
    consultarOpen,
    setConsultarOpen,
    cond,
    sustitutasQ,
    sustitutasTimbradas,
    sustitutaElegida,
    requiereSustituta,
    puedeConfirmar,
    onConfirm,
    abrirWizard,
    errorMessage,
  };
}
