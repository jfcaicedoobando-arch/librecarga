import { useState } from "react";
import type { RefPago } from "@/features/tesoreria/domain/pagoDetalle";
import type { MovimientoBBVA } from "@/features/tesoreria/services";
import type { useCuentasBancarias } from "./useTesoreriaCuentas";

type ConsultaCuentas = ReturnType<typeof useCuentasBancarias>;

function resolverCuenta(consulta: ConsultaCuentas, solicitada: string) {
  const cuentas = consulta.data ?? [];
  const cuentasOcupadas = consulta.isLoading || consulta.isError;
  const activa = cuentasOcupadas ? undefined : cuentas.find((cuenta) => cuenta.id === solicitada);
  return {
    cuentas,
    cuentasOcupadas,
    cuentaId: activa?.id ?? "",
    moneda: activa?.moneda ?? "MXN",
    alias: activa?.alias,
    mensajeSinCuenta: solicitada ? "Esta cuenta ya no está disponible. Selecciona otra."
      : "Selecciona una cuenta para empezar a conciliar.",
  };
}

export function useCuentaConciliacion(consulta: ConsultaCuentas, cuentaSolicitada: string) {
  const cuenta = resolverCuenta(consulta, cuentaSolicitada);
  const { cuentaId } = cuenta;
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

  return { cuenta, movimientoSeleccionado, panelKey, seleccionarMovimiento, cerrarMovimiento, refPago, setRefPago };
}
