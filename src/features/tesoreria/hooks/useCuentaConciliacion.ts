import { useState } from "react";
import type { RefPago } from "@/features/tesoreria/domain/pagoDetalle";
import type { MovimientoBBVA } from "@/features/tesoreria/services";

export function useCuentaConciliacion(cuentaId: string) {
  const [seleccion, setSeleccion] = useState<MovimientoBBVA | null>(null);
  const [refPago, setRefPago] = useState<RefPago | null>(null);
  const movimientoSeleccionado = seleccion?.cuenta_bancaria_id === cuentaId ? seleccion : null;
  const panelKey = movimientoSeleccionado?.id ?? cuentaId;

  const seleccionarMovimiento = (movimiento: MovimientoBBVA) => {
    if (movimiento.cuenta_bancaria_id !== cuentaId) return;
    if (movimiento.id !== movimientoSeleccionado?.id) setRefPago(null);
    setSeleccion(movimiento);
  };

  const cerrarMovimiento = () => setSeleccion((actual) => actual === movimientoSeleccionado ? null : actual);

  return { movimientoSeleccionado, panelKey, seleccionarMovimiento, cerrarMovimiento, refPago, setRefPago };
}
