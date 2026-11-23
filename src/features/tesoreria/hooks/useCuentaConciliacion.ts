import { useState } from "react";
import { useSearchParams } from "react-router";
import type { RefPago } from "@/features/tesoreria/domain/pagoDetalle";
import type { MovimientoBBVA } from "@/features/tesoreria/services";

export function useCuentaConciliacion() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [cuentaId, setCuentaIdState] = useState(searchParams.get("cuenta") ?? "");
  const [seleccion, setSeleccion] = useState<MovimientoBBVA | null>(null);
  const [refPago, setRefPago] = useState<RefPago | null>(null);
  const movimientoSeleccionado = seleccion?.cuenta_bancaria_id === cuentaId ? seleccion : null;
  const panelKey = movimientoSeleccionado?.id ?? cuentaId;

  const cambiarCuenta = (id: string) => {
    if (id === cuentaId) return;
    setSeleccion(null);
    setRefPago(null);
    setCuentaIdState(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("cuenta", id);
      else next.delete("cuenta");
      return next;
    }, { replace: true });
  };

  const cerrarMovimiento = () => setSeleccion((actual) => actual === movimientoSeleccionado ? null : actual);

  return { cuentaId, cambiarCuenta, movimientoSeleccionado, panelKey, setSeleccion, cerrarMovimiento, refPago, setRefPago };
}
