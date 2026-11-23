/**
 * Flags de visibilidad de la barra de acciones de proforma.
 * Puro y testeable; extraído del componente (Power-of-10 ≤200 líneas).
 */
import type { ProformaDetalleFull } from "@/features/proformas/services";
import { leerAjusteConsolidacion } from "../domain/proformaFiscal";
import {
  resolveEstadoCliente,
  type EstadoClienteProforma,
} from "@/features/proformas/domain/proformaClienteEstado";

export type EstadoCliente = EstadoClienteProforma;

export function readEstadoCliente(p: ProformaDetalleFull): EstadoCliente {
  return resolveEstadoCliente(p.estado_cliente);
}

function suspenderPublicacion(p: ProformaDetalleFull) {
  return p.evaluacion_fiscal != null
    && (p.estado_revision === "consolidada" || leerAjusteConsolidacion(p)?.pendiente === true);
}

export function computarFlags(
  proforma: ProformaDetalleFull,
  canEmitirFactura: boolean,
  canResponderProformaManual: boolean,
) {
  const facturada = (proforma.estado_proforma ?? "pendiente") === "facturada";
  const cancelada = proforma.estado_proforma === "cancelada";
  const estadoCliente = readEstadoCliente(proforma);
  const clienteAcepto = estadoCliente === "aceptada";
  const publicacionSuspendida = suspenderPublicacion(proforma);
  const puedePublicar = !cancelada && !publicacionSuspendida;
  return {
    facturada,
    cancelada,
    puedePublicar,
    tokenPublico: publicacionSuspendida ? null : proforma.token_publico ?? null,
    puedeConvertir:
      clienteAcepto && !facturada && puedePublicar && !proforma.factura_id && canEmitirFactura,
    puedeResponder:
      !facturada && puedePublicar && estadoCliente === "pendiente" && canResponderProformaManual,
    mostrarHint: !clienteAcepto && !facturada && puedePublicar,
  };
}
