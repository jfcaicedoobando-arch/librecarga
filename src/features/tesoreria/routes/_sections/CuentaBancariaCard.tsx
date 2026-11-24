/**
 * Tarjeta de cuenta bancaria del listado de Tesorería › Cuentas.
 * Extraída de `TesoreriaCuentas` para respetar el límite Power-of-10 (≤200 líneas).
 */
import { Trash2, Pencil } from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { ROUTES } from "@/constants/routes";

export interface CuentaBancariaCardData {
  id: string;
  alias: string;
  banco: string;
  moneda: string;
  numero_cuenta: string | null;
  clabe: string | null;
  saldo_inicial: number | string;
  fecha_saldo_inicial: string;
  activa: boolean;
}

export interface CuentaBancariaCardProps {
  cuenta: CuentaBancariaCardData;
  saldoActual?: number;
  cargandoSaldo?: boolean;
  canAdmin: boolean;
  onEditar?: (cuenta: CuentaBancariaCardData) => void;
  onEliminar: (id: string, alias: string) => void;
}

export function CuentaBancariaCard({
  cuenta: c,
  saldoActual,
  cargandoSaldo,
  canAdmin,
  onEditar,
  onEliminar,
}: CuentaBancariaCardProps) {
  const cuentaParam = `?cuenta=${encodeURIComponent(c.id)}`;

  return (
    <Card className={c.activa ? undefined : "opacity-60"}>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold">{c.alias}</p>
            <p className="text-body-sm text-muted-foreground">{c.banco} · {c.moneda}</p>
          </div>
          {canAdmin && (
            <div className="flex items-center gap-1">
              {onEditar && (
                <Button
                  variant="ghost" size="icon"
                  aria-label={`Editar cuenta ${c.alias}`}
                  onClick={() => onEditar(c)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost" size="icon"
                aria-label={`Eliminar cuenta ${c.alias}`}
                onClick={() => onEliminar(c.id, c.alias)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )}
        </div>
        {c.numero_cuenta && <p className="text-body-sm">Cuenta: <span className="font-mono">{c.numero_cuenta}</span></p>}
        {c.clabe && <p className="text-body-sm">CLABE: <span className="font-mono">{c.clabe}</span></p>}
        {saldoActual !== undefined ? (
          <p className="text-body pt-2">Saldo actual: <span className="tabular-nums font-medium">{formatCurrency(saldoActual, c.moneda)}</span></p>
        ) : (
          <p className="text-body pt-2">Saldo actual: {cargandoSaldo ? "Consultando…" : "No disponible"}</p>
        )}
        <p className="text-label text-muted-foreground">
          Saldo inicial {formatCurrency(Number(c.saldo_inicial), c.moneda)} al{" "}
          {formatDate(c.fecha_saldo_inicial)}
        </p>
        {c.activa ? <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
          <Button asChild variant="link" size="sm" className="px-0 text-body-sm">
            <Link to={ROUTES.TESORERIA_CONCILIACION + cuentaParam} aria-label={`Ver conciliación de ${c.alias}`}>
              Ver conciliación
            </Link>
          </Button>
          <Button asChild variant="link" size="sm" className="px-0 text-body-sm">
            <Link to={ROUTES.TESORERIA_ESTADO_CUENTA + cuentaParam} aria-label={`Ver estado de cuenta de ${c.alias}`}>
              Ver estado de cuenta
            </Link>
          </Button>
        </div> : (
          <p className="text-body-sm text-muted-foreground italic">
            Cuenta inactiva. Conciliación y estado de cuenta están disponibles para cuentas activas.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
