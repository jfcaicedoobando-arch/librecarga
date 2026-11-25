/**
 * Lógica de guardado de useEditarEmbarqueWizard: construye los payloads,
 * calcula el diff para bitácora y ejecuta la mutación. Extraído para que el
 * hook orquestador quede enfocado en el estado de hidratación del wizard.
 */
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { labelExpediente } from "@/lib/domain/labelExpediente";
import { getErrorMessage } from "@/lib/errors";
import { diffFields, SENSITIVE_FIELDS } from "@/lib/domain/auditDiff";
import { diffConceptos } from "@/lib/domain/auditDiffConceptos";
import { resolverRutaAlGuardar, buildBitacoraDetallesEdit } from "./useEditarEmbarqueWizard.helpers";
import type { useEmbarqueForm } from "@/features/embarques/hooks/useEmbarqueForm";
import type { useConceptosForm } from "@/features/cotizacion/hooks";
import type { useUpdateEmbarque, useEmbarque } from "@/features/embarques/hooks/useEmbarques";
import type { useRegistrarActividad } from "@/features/auditoria";
import type { Tables } from "@/integrations/supabase/types";
import type { ConceptoLike } from "@/lib/domain/auditDiffConceptos";
import { evaluarMargenMinimo } from "@/lib/domain/margenMinimo";
import { totalesMargenUSD } from "@/features/embarques/domain/totalesMargenUSD";
import { captureAuthDataScope } from "@/lib/auth/authOperationScope";
import { prepararRevisionFiscalEmbarque, type PropuestaRevisionFiscalEmbarque } from "../services/evaluacionFiscalEmbarque";
import { consultarAprobacionMargen } from "../services/aprobacionMargen";

type ContactoRow = Pick<Tables<"contactos_cliente">, "id" | "nombre" | "tipo" | "pais">;
async function usaAprobacionBorrador(id: string, estado: string) {
  return estado === 'Borrador' && await consultarAprobacionMargen(id) !== null;
}
interface Deps {
  id: string | undefined;
  embarque: ReturnType<typeof useEmbarque>["data"];
  methods: ReturnType<typeof useEmbarqueForm>["methods"];
  buildEmbarquePayload: ReturnType<typeof useEmbarqueForm>["buildEmbarquePayload"];
  buildConceptosVentaPayload: ReturnType<typeof useEmbarqueForm>["buildConceptosVentaPayload"];
  buildConceptosCostoPayload: ReturnType<typeof useEmbarqueForm>["buildConceptosCostoPayload"];
  contactos: ContactoRow[];
  selectedClienteNombre: string | undefined;
  userEmail: string | undefined;
  conceptosVenta: ReturnType<typeof useConceptosForm>["conceptosVenta"];
  conceptosCosto: ReturnType<typeof useConceptosForm>["conceptosCosto"];
  conceptosVentaDb: (ConceptoLike & Pick<Tables<"conceptos_venta">, "evaluacion_fiscal">)[];
  conceptosCostoDb: ConceptoLike[];
  proveedoresDb: { id: string; nombre: string }[];
  updateEmbarque: ReturnType<typeof useUpdateEmbarque>;
  registrarActividad: ReturnType<typeof useRegistrarActividad>;
  setCurrentStep: (step: number) => void;
  volverAlDetalle: () => void;
  /** Regla de margen mínimo (los totales se convierten a USD al guardar). */
  margenMinimoPct: number;
  puedeAutorizarMargen: boolean;
  confirmar?: (mensaje: string) => boolean;
  solicitarRevisionFiscal: (propuesta: PropuestaRevisionFiscalEmbarque) => Promise<string | null>;
  signal: AbortSignal;
}

/** Margen en USD (misma conversión que el paso de costos) o mensaje si falta T/C. */
function resumenMargenBajo(deps: Deps): string | null {
  const t = totalesMargenUSD(
    deps.conceptosVenta, deps.conceptosCosto,
    deps.methods.getValues("tipoCambioUSD"), deps.methods.getValues("tipoCambioEUR"),
  );
  if (!t) return "No se puede calcular el margen estimado: hay montos en otra moneda y falta el tipo de cambio.";
  const ev = evaluarMargenMinimo(t.ventaUSD, t.costoUSD, deps.margenMinimoPct);
  if (!ev.debajoDelMinimo) return null;
  return `El margen estimado (${ev.margenPct.toFixed(2)}%) queda por debajo del mínimo (${ev.minimoPct}%).`;
}

/** Sólo valida si el margen queda POR DEBAJO del mínimo; por encima no pide nada. */
function validarMargenMinimo(deps: Deps): boolean {
  const resumen = resumenMargenBajo(deps);
  if (!resumen) return true;
  if (!deps.puedeAutorizarMargen) {
    notifyError(undefined, {
      title: "Requiere autorización comercial",
      description: `${resumen} Pide a administración o a la gerencia comercial que guarde este cambio.`,
      method: "HANDLE_SAVE",
    });
    return false;
  }
  const confirmar = deps.confirmar ?? ((m: string) => window.confirm(m));
  return confirmar(`${resumen} ¿Autorizas y guardas este cambio?`);
}

async function confirmarCambiosFiscales(
  deps: Deps,
  embarque: NonNullable<Deps["embarque"]>,
  clienteId: string | null,
  conceptosVenta: ReturnType<Deps["buildConceptosVentaPayload"]>,
  scope: ReturnType<typeof captureAuthDataScope>,
) {
  const { conceptosVentaDb, signal, solicitarRevisionFiscal } = deps;
  if (!conceptosVentaDb.some((concepto) => concepto.evaluacion_fiscal != null) || !embarque.updated_at) return undefined;
  const propuesta = await prepararRevisionFiscalEmbarque({
    embarqueId: embarque.id, organizationId: embarque.organization_id,
    clienteAnterior: embarque.cliente_id, clienteId, conceptosVenta, expectedUpdatedAt: embarque.updated_at,
  });
  if (signal.aborted) return null;
  scope.assertCurrent();
  if (!propuesta) return undefined;
  const motivo = await solicitarRevisionFiscal(propuesta);
  if (motivo === null || signal.aborted) return null;
  scope.assertCurrent();
  return { huella: propuesta.huella, motivo };
}

function notificarErrorAlGuardar(err: unknown, signal: AbortSignal) {
  if (signal.aborted) return;
  const msg = getErrorMessage(err);
  const conflicto = typeof err === "object" && err !== null && "message" in err
    && String(err.message).includes("LC_CONFLICTO_CONCURRENCIA");
  notifyError(undefined, {
    title: conflicto ? "Otro usuario modificó este embarque" : "Error al actualizar",
    description: conflicto ? "Recarga la página para ver los cambios más recientes y vuelve a guardar." : msg,
    error: err,
    method: "HANDLE_SAVE",
  });
}

export async function ejecutarGuardarEmbarque(deps: Deps): Promise<void> {
  const {
    id, embarque, methods,
    buildEmbarquePayload, buildConceptosVentaPayload, buildConceptosCostoPayload,
    contactos, selectedClienteNombre, userEmail,
    conceptosVenta, conceptosCosto, conceptosVentaDb, conceptosCostoDb, proveedoresDb,
    updateEmbarque, registrarActividad, setCurrentStep, volverAlDetalle, signal,
  } = deps;
  if (!id || !embarque) return;
  try {
    const ruta = resolverRutaAlGuardar({
      modo: methods.getValues('modo'),
      contenedores: methods.getValues('contenedores'),
      naviera: methods.getValues('naviera'),
      tipoServicio: methods.getValues('tipoServicio'),
    });
    if (ruta.error) {
      notifyError(undefined, { title: ruta.titulo, description: ruta.error.description, method: "HANDLE_SAVE" });
      setCurrentStep(ruta.error.step);
      return;
    }

    const clienteNombre = selectedClienteNombre ?? "";
    const nuevoEmbarquePayload = buildEmbarquePayload(contactos, clienteNombre, userEmail ?? "");
    const nuevosVenta = buildConceptosVentaPayload(conceptosVenta);
    const nuevosCosto = buildConceptosCostoPayload(conceptosCosto, proveedoresDb);

    // Diff de campos sensibles ANTES de mutar (Bloque 3.6 ext).
    const cambiosEmbarque = diffFields(embarque, nuevoEmbarquePayload, SENSITIVE_FIELDS.embarque);
    const cambiosVenta = diffConceptos(conceptosVentaDb, nuevosVenta);
    const cambiosCosto = diffConceptos(conceptosCostoDb, nuevosCosto);
    const tocoMontos = cambiosVenta.agregados + cambiosVenta.eliminados + cambiosVenta.modificados
      + cambiosCosto.agregados + cambiosCosto.eliminados + cambiosCosto.modificados > 0;
    const scope = captureAuthDataScope();
    // Sólo liberar borradores si el servidor ya ofrece el guard de aprobación; candidata ausente => flujo previo.
    const borradorConAprobacion = await usaAprobacionBorrador(id, embarque.estado);
    if (signal.aborted) return;
    scope.assertCurrent();
    if (tocoMontos && !borradorConAprobacion && !validarMargenMinimo(deps)) return;
    const revisionFiscal = await confirmarCambiosFiscales(deps, embarque,
      nuevoEmbarquePayload.cliente_id ?? embarque.cliente_id, nuevosVenta, scope);
    if (revisionFiscal === null || signal.aborted) return;
    scope.assertCurrent();

    await updateEmbarque.mutateAsync({
      id,
      embarque: nuevoEmbarquePayload,
      conceptosVenta: nuevosVenta,
      conceptosCosto: nuevosCosto,
      contenedores: ruta.contenedores,
      // FIX-15 · Enviamos el `updated_at` que leímos al hidratar el wizard
      // para que la RPC rechace el guardado si alguien más ya guardó.
      expectedUpdatedAt: embarque.updated_at ?? null,
      revisionFiscal,
    });
    if (signal.aborted) return;
    scope.assertCurrent();


    const v = methods.getValues();
    registrarActividad.mutate({
      accion: 'editar',
      modulo: 'embarques',
      entidad_id: id,
      entidad_nombre: labelExpediente(embarque.expediente, embarque.id),
      detalles: buildBitacoraDetallesEdit({
        clienteNombre,
        modo: v.modo,
        tipo: v.tipo,
        cambiosEmbarque,
        cambiosVenta,
        cambiosCosto,
      }),
    });

    notifySuccess(undefined, { title: "Embarque actualizado", description: `${labelExpediente(embarque.expediente, embarque.id)} guardado correctamente.` });
    volverAlDetalle();
  } catch (err: unknown) {
    notificarErrorAlGuardar(err, signal);
  }
}
