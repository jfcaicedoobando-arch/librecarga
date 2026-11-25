import { useRef } from "react";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BotonVerPago } from "@/features/tesoreria/components/BotonVerPago";
import { PanelConciliacionMovimiento } from "@/features/tesoreria/components/PanelConciliacionMovimiento";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { MovimientoBBVA } from "@/features/tesoreria/services";
import type { RefPago } from "@/features/tesoreria/domain/pagoDetalle";
import type { crearMovimientoColumns } from "./movimientoColumns";

interface Props {
  columns: ReturnType<typeof crearMovimientoColumns>;
  movimientos: MovimientoBBVA[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  seleccionado: MovimientoBBVA | null;
  onSeleccionar: (movimiento: MovimientoBBVA) => void;
  onCerrar: () => void;
  onVerPago: (pago: RefPago) => void;
  moneda: string;
  alias?: string;
}

export function ConciliacionMovimientosMobile({ columns, movimientos, isLoading, isError, onRetry, seleccionado,
  onSeleccionar, onCerrar, onVerPago, moneda, alias }: Props) {
  const filaActiva = useRef<HTMLButtonElement>(null);
  const listaMovimientos = useRef<HTMLParagraphElement>(null);

  return (
    <div className="space-y-1">
      <p ref={listaMovimientos} tabIndex={-1} className="px-1 text-body-sm text-muted-foreground">
        {movimientos.length} movimientos · {alias}
      </p>
      <ResponsiveDataTable columns={columns} data={movimientos} rowKey={(m) => m.id}
        isLoading={isLoading} isError={isError} onRetry={onRetry} emptyMessage="No hay movimientos."
        mobileCard={(m) => (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body-sm text-muted-foreground">{formatDate(m.fecha)}</span>
              <StatusBadge domain="conciliacion" status={m.estado_conciliacion} />
            </div>
            <p className="break-words font-medium">{m.concepto}</p>
            {m.referencia && <p className="break-words text-body-sm text-muted-foreground">Ref. {m.referencia}</p>}
            <MoneyCell label={Number(m.cargo) > 0 ? "Cargo" : "Abono"}
              value={formatCurrency(Number(m.cargo) || Number(m.abono), moneda)} />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="min-h-11" onClick={(event) => {
                filaActiva.current = event.currentTarget;
                onSeleccionar(m);
              }}>Ver movimiento</Button>
              <BotonVerPago movimiento={m} onVerPago={onVerPago} />
            </div>
          </div>
        )}
      />
      <Sheet open={!!seleccionado} onOpenChange={(open) => { if (!open) onCerrar(); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" onCloseAutoFocus={(event) => {
          event.preventDefault();
          const destino = filaActiva.current?.isConnected ? filaActiva.current : listaMovimientos.current;
          destino?.focus();
        }}>
          <SheetHeader className="mb-4">
            <SheetTitle>Detalle del movimiento</SheetTitle>
            <SheetDescription>Movimiento bancario y su conciliación.</SheetDescription>
          </SheetHeader>
          {seleccionado && <PanelConciliacionMovimiento key={seleccionado.id}
            movimiento={seleccionado} onClose={onCerrar} moneda={moneda} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
