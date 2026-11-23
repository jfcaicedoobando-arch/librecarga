/**
 * Selector de cuenta bancaria del pago a proveedor.
 * Extraído de PagoProveedorFormBody (v13.452.1) para bajar la complejidad
 * ciclomática del cuerpo del formulario por debajo del límite de arquitectura.
 */
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/shared/usePermissions";
import { hasRouteAccess } from "@/lib/access/roleRouteMatrix";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AvisoFechaPreviaCorte } from "@/components/shared/AvisoFechaPreviaCorte";
import type { PagoProveedorFormBodyProps } from "./PagoProveedorFormBody.types";

function CuentaBancariaMensaje({ cargando, fallo, onRetry, puedeAbrirTesoreria }: {
  cargando: boolean;
  fallo: boolean;
  onRetry: () => void;
  puedeAbrirTesoreria: boolean;
}) {
  if (cargando) return <p role="status" className="text-body-sm">Cargando cuentas bancarias…</p>;
  if (fallo) return (
    <div role="alert" className="space-y-1 text-body-sm">
      <p>No se pudieron consultar las cuentas bancarias.</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>Reintentar cuentas</Button>
    </div>
  );
  return (
    <div role="status" className="space-y-1 text-body-sm">
      <p>Para este medio de pago necesitas una cuenta bancaria activa.</p>
      {puedeAbrirTesoreria ? (
        <Link to="/tesoreria/cuentas" target="_blank" rel="noopener" className="text-primary underline">
          Abrir cuentas bancarias en otra pestaña
        </Link>
      ) : <p>Solicita el alta de una cuenta a Tesorería.</p>}
    </div>
  );
}

type Props = Pick<
  PagoProveedorFormBodyProps,
  "cuentas" | "cuentasCargando" | "cuentasError" | "reintentarCuentas"
  | "cuentaId" | "setCuentaId" | "requiereCuenta" | "fecha"
>;

export function PagoProveedorCuentaField(p: Props) {
  const { role } = usePermissions();
  const cuenta = p.cuentas.find((c) => c.id === p.cuentaId);
  // MNY: en efectivo no hay cuenta bancaria posible: se dice explícitamente que
  // no habrá salida de banco, en vez de mostrar un selector con una cuenta
  // preseleccionada que generaba un cargo indebido.
  if (!p.requiereCuenta) {
    return (
      <div className="space-y-1">
        <Label>Cuenta bancaria</Label>
        <p className="text-body-sm text-muted-foreground">
          Pago en efectivo: no se registra salida de ninguna cuenta bancaria.
        </p>
      </div>
    );
  }
  if (p.cuentas.length === 0) {
    return (
      <CuentaBancariaMensaje
        cargando={p.cuentasCargando}
        fallo={p.cuentasError}
        onRetry={p.reintentarCuentas}
        puedeAbrirTesoreria={hasRouteAccess(role, "/tesoreria/cuentas")}
      />
    );
  }
  return (
    <div className="space-y-1">
      <Label htmlFor="cuenta-bancaria">Cuenta bancaria *</Label>
      {p.cuentasError && <CuentaBancariaMensaje cargando={false} fallo onRetry={p.reintentarCuentas} puedeAbrirTesoreria={false} />}
      <Select value={p.cuentaId} onValueChange={p.setCuentaId}>
        <SelectTrigger id="cuenta-bancaria">
          <SelectValue placeholder="Selecciona la cuenta de donde sale el pago" />
        </SelectTrigger>
        <SelectContent>
          {p.cuentas.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.banco} · {c.alias ?? "Cuenta"} ({c.moneda})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!p.cuentaId && (

        <p className="text-body-sm text-destructive">
          Selecciona la cuenta bancaria de donde sale el pago.
        </p>
      )}
      {p.cuentaId && (
        <p className="text-label text-muted-foreground">
          Se registrará el movimiento bancario conciliado en esta cuenta.
        </p>
      )}
      <AvisoFechaPreviaCorte
        fecha={p.fecha}
        corte={cuenta?.fecha_saldo_inicial}
        aliasCuenta={cuenta?.alias}
      />
    </div>
  );
}
